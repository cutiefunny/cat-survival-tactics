import Phaser from 'phaser';
import Unit from '../objects/Unit';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";

// [기본값 확장] AI 설정 추가
const DEFAULT_CONFIG = {
    gameSettings: { unitCount: 5, spawnGap: 100, startY: 300 },
    // [NEW] AI 세부 설정
    aiSettings: {
        common: { thinkTimeMin: 150, thinkTimeVar: 100 }, // 반응 속도 (ms)
        runner: { ambushDistance: 60, fleeDuration: 1500 }, // 암살 거리, 도망 시간
        dealer: { safeDistance: 150, followDistance: 50 }   // 도망 거리, 탱커 호위 거리
    },
    redTeamStats: { role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 },
    blueTeamRoles: [
        { role: 'Leader', hp: 200, attackPower: 25, moveSpeed: 90 },
        { role: 'Runner', hp: 100, attackPower: 12, moveSpeed: 140 },
        { role: 'Dealer', hp: 90, attackPower: 40, moveSpeed: 70 },
        { role: 'Tanker', hp: 400, attackPower: 10, moveSpeed: 40 },
        { role: 'Normal', hp: 140, attackPower: 15, moveSpeed: 70 }
    ]
};

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BattleScene' });
    }

    preload() {
        this.load.spritesheet('blueCat', '/images/cat_walk_3frame_sprite.png', { frameWidth: 100, frameHeight: 100 });
        this.load.image('cat_hit', '/images/cat_hit.png');
        this.load.image('cat_punch', '/images/cat_punch.png');
        this.load.spritesheet('redDog', '/images/dog_2frame_horizontal.png', { frameWidth: 100, frameHeight: 100 });
    }

    create() {
        this.loadingText = this.add.text(800, 600, 'Loading Tactics Config...', {
            fontSize: '40px', fill: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.fetchConfigAndStart();
    }

    async fetchConfigAndStart() {
        let config = DEFAULT_CONFIG;
        try {
            const docRef = doc(db, "settings", "tacticsConfig");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                console.log("✅ Config Loaded:", docSnap.data());
                // DB에 aiSettings가 없을 경우를 대비해 병합
                config = { ...DEFAULT_CONFIG, ...docSnap.data() };
                if (!config.aiSettings) config.aiSettings = DEFAULT_CONFIG.aiSettings;
            }
        } catch (error) { console.error("❌ Config Error:", error); }

        if (this.loadingText && this.loadingText.active) this.loadingText.destroy();
        this.startGame(config);
    }

    startGame(config) {
        this.isGameOver = false;
        this.battleStarted = false;
        this.checkBattleTimer = 0;

        if (!this.anims.exists('cat_walk')) {
            this.anims.create({ key: 'cat_walk', frames: this.anims.generateFrameNumbers('blueCat', { start: 0, end: 2 }), frameRate: 8, repeat: -1 });
        }
        if (!this.anims.exists('dog_walk')) {
            this.anims.create({ key: 'dog_walk', frames: this.anims.generateFrameNumbers('redDog', { start: 0, end: 1 }), frameRate: 6, repeat: -1 });
        }

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({ up: 'W', left: 'A', down: 'S', right: 'D' });

        this.add.grid(800, 600, 1600, 1200, 32, 32, 0x000000).setAlpha(0.2);
        this.add.line(0, 0, 800, 0, 800, 1200, 0xffffff, 0.1).setOrigin(0);

        this.blueTeam = this.physics.add.group({ runChildUpdate: true });
        this.redTeam = this.physics.add.group({ runChildUpdate: true });

        const { unitCount, startY, spawnGap } = config.gameSettings;
        const redStats = config.redTeamStats;
        const blueRoles = config.blueTeamRoles;
        // [NEW] AI 설정 추출
        const aiConfig = config.aiSettings;

        const leaderIndex = 0;

        for (let i = 0; i < unitCount; i++) {
            const by = startY + (i * spawnGap);
            const bx = 300;
            const rx = 1300;
            const isLeader = (i === leaderIndex);

            const roleStats = blueRoles[i % blueRoles.length];
            // [CHANGE] AI Config 전달
            let blueUnit = new Unit(this, bx, by, 'blueCat', 'blue', this.redTeam, roleStats, aiConfig, isLeader);
            if (isLeader) this.playerUnit = blueUnit;
            this.blueTeam.add(blueUnit);

            const currentRedStats = { ...redStats, role: redStats.role || 'NormalDog' };
            const redUnit = new Unit(this, rx, by, 'redDog', 'red', this.blueTeam, currentRedStats, aiConfig, false);
            this.redTeam.add(redUnit);
        }

        this.blueTeam.getChildren().forEach(unit => {
            if (unit.active) unit.setFormationOffset(this.playerUnit.x, this.playerUnit.y);
        });

        // [ROLLBACK] 아군끼리도 충돌 (길막 허용)
        this.physics.add.collider(this.blueTeam, this.redTeam, this.handleCombat, null, this);
        this.physics.add.collider(this.blueTeam, this.blueTeam); // 아군 충돌 복구
        this.physics.add.collider(this.redTeam, this.redTeam);   // 아군 충돌 복구

        this.infoText = this.add.text(800, 100, 'Move Leader! Squad will follow.', {
            fontSize: '32px', fill: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 6
        }).setOrigin(0.5);

        this.battleText = this.add.text(800, 600, 'BATTLE START!', {
            fontSize: '80px', fill: '#ff0000', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 8
        }).setOrigin(0.5).setAlpha(0);
    }

    update(time, delta) {
        if (!this.blueTeam || !this.redTeam) return;
        if (this.isGameOver) return;

        if (!this.battleStarted && this.playerUnit && this.playerUnit.active) {
            this.checkBattleTimer -= delta;
            if (this.checkBattleTimer <= 0) {
                this.checkBattleTimer = 100;
                this.checkBattleDistance();
            }
        }

        const blueCount = this.blueTeam.countActive();
        const redCount = this.redTeam.countActive();

        if (this.battleStarted) {
            if (blueCount === 0) this.finishGame("Red Team Wins!", '#ff4444');
            else if (redCount === 0) this.finishGame("Blue Team Wins!", '#4488ff');
            else this.infoText.setText(`Blue: ${blueCount} vs Red: ${redCount}`);
        }
    }

    checkBattleDistance() {
        const thresholdSq = 600 * 600;
        let closestDistSq = Infinity;
        const blueUnits = this.blueTeam.getChildren();
        const redUnits = this.redTeam.getChildren();

        for (let b = 0; b < blueUnits.length; b++) {
            for (let r = 0; r < redUnits.length; r++) {
                if (blueUnits[b].active && redUnits[r].active) {
                    const dSq = Phaser.Math.Distance.Squared(blueUnits[b].x, blueUnits[b].y, redUnits[r].x, redUnits[r].y);
                    if (dSq < closestDistSq) closestDistSq = dSq;
                    if (closestDistSq < thresholdSq) {
                        this.startBattle();
                        return;
                    }
                }
            }
        }
    }

    startBattle() {
        this.battleStarted = true;
        this.infoText.setText("FIGHT!");
        this.battleText.setAlpha(1);
        this.tweens.add({ targets: this.battleText, alpha: 0, duration: 1000, ease: 'Power2' });
    }

    handleCombat(unit1, unit2) {
        if (this.isGameOver || !this.battleStarted) return;
        
        // 같은 팀끼리는 충돌은 하되, 공격은 안 함
        if (unit1.team === unit2.team) return;

        this.performAttack(unit1, unit2);
        this.performAttack(unit2, unit1);
    }

    performAttack(attacker, defender) {
        if (!attacker.active || !defender.active) return;
        const now = this.time.now;
        if (now > attacker.lastAttackTime + attacker.attackCooldown) {
            defender.takeDamage(attacker.attackPower);
            attacker.lastAttackTime = now;
            attacker.triggerAttackVisuals();
            if (!defender.active || !defender.body) return;
            const angle = Phaser.Math.Angle.Between(attacker.x, attacker.y, defender.x, defender.y);
            const knockbackForce = 40;
            defender.body.velocity.x += Math.cos(angle) * knockbackForce;
            defender.body.velocity.y += Math.sin(angle) * knockbackForce;
        }
    }

    finishGame(message, color) {
        this.isGameOver = true;
        this.infoText.setText(message).setStyle({ fontSize: '60px', fill: color });
        this.physics.pause();
        const restartText = this.add.text(800, 400, 'Click to Restart', {
            fontSize: '40px', fill: '#ffffff', backgroundColor: '#000000', padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive();
        restartText.on('pointerdown', () => this.scene.restart());
    }
}