import Phaser from 'phaser';

// [Factory] 역할별 클래스 Import
import Unit from '../objects/Unit'; 
import Shooter from '../objects/roles/Shooter';
import Runner from '../objects/roles/Runner';
import Tanker from '../objects/roles/Tanker';
import Dealer from '../objects/roles/Dealer';
import Normal from '../objects/roles/Normal';

import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";

const UnitClasses = {
    'Shooter': Shooter,
    'Runner': Runner,
    'Tanker': Tanker,
    'Dealer': Dealer,
    'Normal': Normal,
    'Leader': Unit,
    'NormalDog': Normal 
};

const DEFAULT_CONFIG = {
    gameSettings: { 
        blueCount: 6, 
        redCount: 6, 
        spawnGap: 90, 
        startY: 250 
    },
    aiSettings: {
        common: { thinkTimeMin: 150, thinkTimeVar: 100 }, 
        runner: { ambushDistance: 60, fleeDuration: 1500 }, 
        dealer: { safeDistance: 150, followDistance: 50 },
        shooter: { attackRange: 250, kiteDistance: 200 } 
    },
    redTeamRoles: [
        { role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 }
    ],
    redTeamStats: { role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 },
    
    blueTeamRoles: [
        { role: 'Leader', hp: 200, attackPower: 25, moveSpeed: 90 },
        { role: 'Runner', hp: 100, attackPower: 12, moveSpeed: 140 },
        { role: 'Dealer', hp: 90, attackPower: 40, moveSpeed: 70 },
        { role: 'Tanker', hp: 400, attackPower: 10, moveSpeed: 40 },
        { role: 'Normal', hp: 140, attackPower: 15, moveSpeed: 70 },
        { role: 'Shooter', hp: 80, attackPower: 30, moveSpeed: 110, attackRange: 250 } 
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

        this.physics.world.setBounds(0, 0, 1600, 1200);

        // 드래그 로직 (배치 단계용)
        this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            if (this.isSetupPhase) {
                gameObject.x = dragX;
                gameObject.y = dragY;
                if (gameObject.body) {
                    gameObject.body.x = dragX - gameObject.body.width / 2;
                    gameObject.body.y = dragY - gameObject.body.height / 2;
                }
            }
        });

        this.fetchConfigAndStart();
    }

    async fetchConfigAndStart() {
        let config = DEFAULT_CONFIG;
        try {
            const docRef = doc(db, "settings", "tacticsConfig");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                console.log("✅ Config Loaded:", docSnap.data());
                const dbData = docSnap.data();
                config = { ...DEFAULT_CONFIG, ...dbData };

                if (dbData.aiSettings) config.aiSettings = { ...DEFAULT_CONFIG.aiSettings, ...dbData.aiSettings };
                if (dbData.blueTeamRoles && dbData.blueTeamRoles.length < DEFAULT_CONFIG.blueTeamRoles.length) {
                    const missingRoles = DEFAULT_CONFIG.blueTeamRoles.slice(dbData.blueTeamRoles.length);
                    config.blueTeamRoles = [...config.blueTeamRoles, ...missingRoles];
                }
            }
        } catch (error) { 
            console.error("❌ Config Error:", error); 
        }

        if (this.loadingText && this.loadingText.active) this.loadingText.destroy();
        this.startGame(config);
    }

    startGame(config) {
        this.isGameOver = false;
        this.battleStarted = false;
        this.isSetupPhase = true; // 배치 단계 시작
        this.checkBattleTimer = 0;

        if (!this.anims.exists('cat_walk')) this.anims.create({ key: 'cat_walk', frames: this.anims.generateFrameNumbers('blueCat', { start: 0, end: 2 }), frameRate: 8, repeat: -1 });
        if (!this.anims.exists('dog_walk')) this.anims.create({ key: 'dog_walk', frames: this.anims.generateFrameNumbers('redDog', { start: 0, end: 1 }), frameRate: 6, repeat: -1 });

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({ up: 'W', left: 'A', down: 'S', right: 'D' });

        this.add.grid(800, 600, 1600, 1200, 32, 32, 0x000000).setAlpha(0.2);
        this.add.line(0, 0, 800, 0, 800, 1200, 0xffffff, 0.1).setOrigin(0);

        this.blueTeam = this.physics.add.group({ runChildUpdate: true });
        this.redTeam = this.physics.add.group({ runChildUpdate: true });

        const { startY, spawnGap } = config.gameSettings;
        const blueCount = config.gameSettings.blueCount ?? config.gameSettings.unitCount ?? 6;
        const redCount = config.gameSettings.redCount ?? config.gameSettings.unitCount ?? 6;

        const blueRoles = config.blueTeamRoles;
        const redRoles = config.redTeamRoles || [config.redTeamStats]; 
        const aiConfig = config.aiSettings;

        // [Factory Method]
        const createUnit = (scene, x, y, texture, team, targetGroup, stats, isLeader) => {
            stats.aiConfig = aiConfig;
            const UnitClass = UnitClasses[stats.role] || UnitClasses['Normal'];
            const unit = new UnitClass(scene, x, y, texture, team, targetGroup, stats, isLeader);
            
            unit.setInteractive();
            scene.input.setDraggable(unit);
            
            return unit;
        };

        const leaderIndex = 0;

        // Blue Team
        for (let i = 0; i < blueCount; i++) {
            const by = startY + (i * spawnGap);
            const bx = 300;
            const isLeader = (i === leaderIndex);
            const roleStats = blueRoles[i % blueRoles.length];
            const blueUnit = createUnit(this, bx, by, 'blueCat', 'blue', this.redTeam, roleStats, isLeader);
            if (isLeader) this.playerUnit = blueUnit;
            this.blueTeam.add(blueUnit);
        }

        // Red Team
        for (let i = 0; i < redCount; i++) {
            const by = startY + (i * spawnGap);
            const rx = 1300;
            const roleStats = redRoles[i % redRoles.length];
            const redUnit = createUnit(this, rx, by, 'redDog', 'red', this.blueTeam, roleStats, false);
            this.redTeam.add(redUnit);
        }

        // 초기 오프셋 설정 (기본은 I 대형처럼 보임)
        if(this.playerUnit && this.playerUnit.active) {
            this.blueTeam.getChildren().forEach(unit => {
                if (unit.active) unit.setFormationOffset(this.playerUnit.x, this.playerUnit.y);
            });
        }

        this.physics.add.collider(this.blueTeam, this.redTeam, this.handleCombat, null, this);
        this.physics.add.collider(this.blueTeam, this.blueTeam);
        this.physics.add.collider(this.redTeam, this.redTeam);

        // [NEW] 포메이션 변경 UI 생성
        this.createFormationUI();

        this.startButton = this.add.text(800, 550, 'CLICK TO START', {
            fontSize: '50px', fill: '#ffffff', backgroundColor: '#00aa00', padding: { x: 20, y: 15 },
            fontStyle: 'bold'
        }).setOrigin(0.5).setInteractive();

        this.startButton.on('pointerdown', () => this.handleStartBattle());

        this.infoText = this.add.text(800, 50, '', {
            fontSize: '24px', fill: '#ffffff'
        }).setOrigin(0.5).setVisible(false);

        this.battleText = this.add.text(800, 600, 'FIGHT!', {
            fontSize: '80px', fill: '#ff0000', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 8
        }).setOrigin(0.5).setAlpha(0);
    }

    // [NEW] 포메이션 UI 생성
    createFormationUI() {
        const x = 50;
        const y = 50;
        const gap = 60;

        // 스타일 정의
        const createBtn = (label, offsetX, formationType) => {
            const btn = this.add.text(x + offsetX, y, label, {
                fontSize: '24px', 
                fill: '#ffffff', 
                backgroundColor: '#444444', 
                padding: { x: 10, y: 5 },
                fixedWidth: 50, align: 'center'
            })
            .setInteractive()
            .setScrollFactor(0); // 카메라 이동해도 UI 고정

            btn.on('pointerdown', () => {
                this.applyFormation(formationType);
                // 버튼 시각적 피드백
                this.tweens.add({ targets: btn, scale: 0.9, duration: 50, yoyo: true });
            });

            return btn;
        };

        this.btnLine = createBtn('I', 0, 'line');
        this.btnWedge = createBtn('>', gap, 'wedge');
        this.btnFree = createBtn('Free', gap * 2, 'free');
    }

    // [NEW] 포메이션 적용 로직
    applyFormation(type) {
        if (!this.playerUnit || !this.isSetupPhase) return;

        const units = this.blueTeam.getChildren().filter(u => u.active);
        const leaderX = this.playerUnit.x;
        const leaderY = this.playerUnit.y;
        
        // 'Free'는 유닛을 움직이지 않음 (사용자 배치 존중)
        if (type === 'free') {
            this.infoText.setVisible(true).setText("Free Formation Selected");
            this.time.delayedCall(1000, () => this.infoText.setVisible(false));
            return;
        }

        // 포메이션별 좌표 계산
        units.forEach((unit, index) => {
            let targetX, targetY;

            if (unit === this.playerUnit) return; // 리더는 기준점

            // 리더가 index 0이라고 가정하고 나머지 정렬
            // 하지만 units 배열에서 리더의 위치는 섞여있을 수 있음
            // 리더를 제외한 유닛들의 상대적 인덱스 계산
            const relativeIndex = index > units.indexOf(this.playerUnit) ? index - 1 : index; 

            if (type === 'line') {
                // I 대형 (수직 일렬)
                const gapY = 80;
                targetX = leaderX;
                targetY = leaderY + ((relativeIndex + 1) * gapY * (this.playerUnit.team === 'blue' ? 1 : -1)); // 뒤로 줄섬 (사실상 Y축 정렬)
                // 위 코드는 Y축 아래로만 뻗어나감. 중앙 정렬을 원하면 로직 수정 필요.
                // 기존 spawn 로직과 유사하게 리더 기준 위아래로 펼치거나, 리더 뒤로 줄을 세움.
                // 여기서는 리더 뒤(화면상 위/아래)가 아니라 Y축 기준 정렬로 단순화
                
                // 다시: 리더 기준 '뒤'로 일렬
                // Blue팀은 오른쪽이 적이므로, '뒤'는 왼쪽? 아니면 위아래? 
                // 통상적으로 'I' 대형은 전열/후열 개념이 아니라 세로 배치(StartY 기준)
                targetX = leaderX; 
                targetY = 250 + (index * 90); // 초기 배치와 동일한 로직
            } 
            else if (type === 'wedge') {
                // > 대형 (쐐기)
                // 리더가 맨 앞(X축 가장 오른쪽), 나머지는 뒤쪽(X축 왼쪽) 위아래로 퍼짐
                const gapX = 60;
                const gapY = 60;
                
                // 1,2번은 1열 뒤, 3,4번은 2열 뒤...
                const col = Math.floor((relativeIndex) / 2) + 1;
                const rowDir = (relativeIndex % 2 === 0) ? 1 : -1; // 위/아래 번갈아
                
                targetX = leaderX - (col * gapX);
                targetY = leaderY + (col * gapY * rowDir);
            }

            // 부드러운 이동 (Tween)
            if (targetX !== undefined) {
                this.tweens.add({
                    targets: unit,
                    x: targetX,
                    y: targetY,
                    duration: 300,
                    ease: 'Power2',
                    onUpdate: () => {
                        // 물리 바디도 같이 이동
                        if(unit.body) { unit.body.x = unit.x - unit.body.width/2; unit.body.y = unit.y - unit.body.height/2; }
                    }
                });
            }
        });
    }

    handleStartBattle() {
        console.log("🔥 [BattleScene] START BATTLE CLICKED");

        // [FIX & LOG] 1. 가장 먼저 현재 배치된 위치를 '포메이션'으로 확정 저장합니다.
        // AI가 움직이기 시작하기 전에 값을 고정해야 합니다.
        if (this.playerUnit && this.playerUnit.active) {
            console.log(`📍 Leader Position: (${this.playerUnit.x.toFixed(0)}, ${this.playerUnit.y.toFixed(0)})`);
            
            this.blueTeam.getChildren().forEach((unit, index) => {
                if (unit.active && unit !== this.playerUnit) {
                    // 저장 전 위치 확인
                    const prevX = unit.x;
                    const prevY = unit.y;
                    
                    unit.setFormationOffset(this.playerUnit.x, this.playerUnit.y);
                    
                    console.log(`   └ Unit [${unit.role}] saved offset. Pos:(${prevX.toFixed(0)},${prevY.toFixed(0)}) -> Offset:(${unit.formationOffset.x.toFixed(0)}, ${unit.formationOffset.y.toFixed(0)})`);
                }
            });
        }

        // 2. 이제 게임 상태 변경 (AI 가동 시작)
        this.isSetupPhase = false;
        
        if(this.startButton) this.startButton.destroy();
        if(this.btnLine) this.btnLine.destroy();
        if(this.btnWedge) this.btnWedge.destroy();
        if(this.btnFree) this.btnFree.destroy();

        this.infoText.setVisible(true);
        this.infoText.setText('Move Leader! Squad will follow.');

        this.startBattle();
    }

    update(time, delta) {
        if (!this.blueTeam || !this.redTeam) return;
        if (this.isGameOver) return;

        if (this.isSetupPhase) return;

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
            this.handleRangedAttacks(); 

            if (blueCount === 0) this.finishGame("Red Team Wins!", '#ff4444');
            else if (redCount === 0) this.finishGame("Blue Team Wins!", '#4488ff');
            else this.infoText.setText(`Blue: ${blueCount} vs Red: ${redCount}`);
        }
    }

    // ... (나머지 메서드들은 기존 코드와 동일) ...
    handleRangedAttacks() {
        const allUnits = [...this.blueTeam.getChildren(), ...this.redTeam.getChildren()];
        allUnits.forEach(unit => {
            if (unit.active && unit.attackRange > 60) {
                const target = unit.currentTarget;
                if (target && target.active) {
                    const distSq = Phaser.Math.Distance.Squared(unit.x, unit.y, target.x, target.y);
                    const rangeSq = unit.attackRange * unit.attackRange;
                    if (distSq <= rangeSq) {
                        this.performAttack(unit, target);
                    }
                }
            }
        });
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
                        if (!this.battleStarted) this.startBattle();
                        return;
                    }
                }
            }
        }
    }

    startBattle() {
        if (this.battleStarted) return;
        this.battleStarted = true;
        this.infoText.setText("FIGHT!");
        this.battleText.setAlpha(1);
        this.tweens.add({ targets: this.battleText, alpha: 0, duration: 1000, ease: 'Power2' });
    }

    handleCombat(unit1, unit2) {
        if (this.isGameOver || !this.battleStarted) return;
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
            
            if (attacker.role === 'Shooter' && defender.active) {
                this.tweens.add({ targets: defender, x: '+=3', duration: 30, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
            }
            
            if (!defender.active || !defender.body) return;
            const angle = Phaser.Math.Angle.Between(attacker.x, attacker.y, defender.x, defender.y);
            const knockbackForce = (attacker.attackRange > 60) ? 10 : 40; 
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