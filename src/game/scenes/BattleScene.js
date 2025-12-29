import Phaser from 'phaser';

// [Factory] 역할별 클래스 Import
import Unit from '../objects/Unit'; 
import Shooter from '../objects/roles/Shooter';
import Runner from '../objects/roles/Runner';
import Tanker from '../objects/roles/Tanker';
import Dealer from '../objects/roles/Dealer';
import Normal from '../objects/roles/Normal';
import Leader from '../objects/roles/Leader';

import { doc, getDoc, addDoc, collection } from "firebase/firestore";
import { db } from "../../firebaseConfig";

// [Map Assets] 맵 데이터와 타일셋 이미지 Import
import stage1Data from '../../assets/maps/stage1.json';
import tilesetGrassImg from '../../assets/tilesets/TX_Tileset_Grass.png';
import tilesetPlantImg from '../../assets/tilesets/TX_Plant.png';

const UnitClasses = {
    'Shooter': Shooter,
    'Runner': Runner,
    'Tanker': Tanker,
    'Dealer': Dealer,
    'Normal': Normal,
    'Leader': Leader,
    'NormalDog': Normal 
};

// [Safe Config]
const ROLE_BASE_STATS = {
    'Leader': { skillCooldown: 30000, skillRange: 300, skillDuration: 10000, skillEffect: 10 },
    'Tanker': { skillCooldown: 10000, skillRange: 200 }
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
        { role: 'Leader', hp: 200, attackPower: 25, moveSpeed: 90, skillCooldown: 30000, skillRange: 300, skillDuration: 10000, skillEffect: 10 },
        { role: 'Runner', hp: 100, attackPower: 12, moveSpeed: 140 },
        { role: 'Dealer', hp: 90, attackPower: 40, moveSpeed: 70 },
        { role: 'Tanker', hp: 400, attackPower: 10, moveSpeed: 40, skillCooldown: 10000, skillRange: 200 },
        { role: 'Normal', hp: 140, attackPower: 15, moveSpeed: 70 },
        { role: 'Shooter', hp: 80, attackPower: 30, moveSpeed: 110, attackRange: 250 } 
    ]
};

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BattleScene' });
    }

    preload() {
        // [Existing] 기본 에셋
        this.load.spritesheet('blueCat', '/images/cat_walk_3frame_sprite.png', { frameWidth: 100, frameHeight: 100 });
        this.load.image('cat_hit', '/images/cat_hit.png');
        this.load.image('cat_punch', '/images/cat_punch.png');
        this.load.image('cat_haak', '/images/cat_haak.png');
        this.load.spritesheet('redDog', '/images/dog_2frame_horizontal.png', { frameWidth: 100, frameHeight: 100 });

        // [Asset] Hit Images
        this.load.image('tanker_hit', '/images/tanker_hit.png');
        this.load.image('shooter_hit', '/images/shooter_hit.png');
        this.load.image('runner_hit', '/images/runner_hit.png');

        // [Asset] 역할별 추가 이미지
        this.load.image('tanker_idle', '/images/tanker_idle.png');
        this.load.spritesheet('tanker_walk', '/images/tanker_walk.png', { frameWidth: 100, frameHeight: 100 });
        this.load.image('tanker_haak', '/images/tanker_haak.png');
        
        this.load.image('shooter_idle', '/images/shooter_idle.png');
        this.load.spritesheet('shooter_walk', '/images/shooter_walk.png', { frameWidth: 100, frameHeight: 100 });
        this.load.image('shooter_shot', '/images/shooter_shot.png');

        this.load.image('runner_idle', '/images/runner_idle.png');
        this.load.spritesheet('runner_walk', '/images/runner_walk.png', { frameWidth: 100, frameHeight: 100 });
        this.load.image('runner_attack', '/images/runner_attack.png');

        // [Map] 맵 데이터 및 타일셋 로드
        this.load.tilemapTiledJSON('stage1', stage1Data);
        this.load.image('tiles_grass', tilesetGrassImg);
        this.load.image('tiles_plant', tilesetPlantImg);
    }

    create() {
        this.loadingText = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, 'Loading Tactics Config...', {
            fontSize: '40px', fill: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0);

        const map = this.make.tilemap({ key: 'stage1' });
        const tilesetGrass = map.addTilesetImage('tileser_nature', 'tiles_grass');
        const tilesetPlant = map.addTilesetImage('tileset_trees', 'tiles_plant');
        
        const tilesets = [];
        if (tilesetGrass) tilesets.push(tilesetGrass);
        if (tilesetPlant) tilesets.push(tilesetPlant);

        const groundLayer = map.createLayer('Ground', tilesets, 0, 0);
        const wallLayer = map.createLayer('Walls', tilesets, 0, 0);
        const blockLayer = map.createLayer('Blocks', tilesets, 0, 0);

        if (wallLayer) wallLayer.setCollisionByExclusion([-1]);
        if (blockLayer) blockLayer.setCollisionByExclusion([-1]);

        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

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

        // [New] 모바일 체크 및 설정
        this.checkMobileAndSetup();

        this.fetchConfigAndStart(wallLayer, blockLayer);
    }
    
    // [New] 모바일 지원 기능
    checkMobileAndSetup() {
        // 간단한 모바일 디바이스 체크
        const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS || this.sys.game.device.os.iPad || this.sys.game.device.os.iPhone;
        
        if (isMobile) {
            console.log("📱 Mobile Device Detected. Setting up Joystick & Orientation Check.");

            this.cameras.main.setZoom(0.5);
            
            // 1. 가로 모드 강제 (Overlay)
            //this.createOrientationOverlay();
            this.scale.on('resize', this.handleResize, this);
            this.checkOrientation();

            // 2. 가상 조이스틱 생성 (오른쪽 하단)
            // 플러그인이 로드되었는지 확인
            if (this.plugins.get('rexVirtualJoystick')) {
                this.joyStick = this.plugins.get('rexVirtualJoystick').add(this, {
                    x: this.cameras.main.width - 50,
                    y: this.cameras.main.height - 50,
                    radius: 80,
                    base: this.add.circle(0, 0, 80, 0x888888, 0.5).setDepth(100),
                    thumb: this.add.circle(0, 0, 40, 0xcccccc, 0.8).setDepth(101),
                    dir: '8dir',
                    forceMin: 16,
                    enable: true
                });
                
                // 조이스틱을 화면에 고정
                // 베이스와 썸(Thumb) 객체는 rex 플러그인이 내부적으로 관리하지만,
                // scene에 추가된 shape이므로 scrollFactor 설정 필요
                // (rex 플러그인 특성상 base/thumb 객체에 직접 접근하여 설정)
                this.joyStick.base.setScrollFactor(0);
                this.joyStick.thumb.setScrollFactor(0);
                
                // Unit.js에서 사용할 커서 키 생성
                this.joystickCursors = this.joyStick.createCursorKeys();
            }
        }
    }

    createOrientationOverlay() {
        // 가로모드 유도 오버레이 컨테이너
        this.orientationOverlay = this.add.container(0, 0).setScrollFactor(0).setDepth(9999).setVisible(false);
        
        const bg = this.add.rectangle(this.cameras.main.centerX, this.cameras.main.centerY, 
            this.cameras.main.width, this.cameras.main.height, 0x000000).setOrigin(0.5);
            
        const text = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, 
            "Please Rotate Your Device\n↔️ Landscape Only", {
            fontSize: '40px', color: '#ffffff', align: 'center', fontStyle: 'bold'
        }).setOrigin(0.5);
        
        this.orientationOverlay.add([bg, text]);
    }

    checkOrientation() {
        if (!this.orientationOverlay) return;
        
        const { width, height } = this.scale;
        
        if (height > width) {
            // 세로 모드 (Portrait) -> 게임 일시 정지 및 오버레이 표시
            this.orientationOverlay.setVisible(true);
            // 오버레이 크기 갱신
            const bg = this.orientationOverlay.list[0];
            const txt = this.orientationOverlay.list[1];
            if(bg) bg.setSize(width, height).setPosition(width/2, height/2);
            if(txt) txt.setPosition(width/2, height/2);
            
            this.physics.pause();
            this.isOrientationBad = true;
        } else {
            // 가로 모드 (Landscape) -> 정상화
            this.orientationOverlay.setVisible(false);
            if (this.isOrientationBad && !this.isGameOver) {
                this.physics.resume();
            }
            this.isOrientationBad = false;
        }
    }

    async fetchConfigAndStart(wallLayer, blockLayer) {
        let config = DEFAULT_CONFIG;
        try {
            const docRef = doc(db, "settings", "tacticsConfig");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                console.log("✅ Config Loaded:", docSnap.data());
                const dbData = docSnap.data();
                config = { ...DEFAULT_CONFIG, ...dbData };

                if (dbData.aiSettings) config.aiSettings = { ...DEFAULT_CONFIG.aiSettings, ...dbData.aiSettings };
                
                if (dbData.blueTeamRoles) {
                    if (dbData.blueTeamRoles.length < DEFAULT_CONFIG.blueTeamRoles.length) {
                        const missingRoles = DEFAULT_CONFIG.blueTeamRoles.slice(dbData.blueTeamRoles.length);
                        config.blueTeamRoles = [...dbData.blueTeamRoles, ...missingRoles];
                    }
                }
            }
        } catch (error) { 
            console.error("❌ Config Error:", error); 
        }

        if (this.loadingText && this.loadingText.active) this.loadingText.destroy();
        this.startGame(config, wallLayer, blockLayer);
    }

    startGame(config, wallLayer, blockLayer) {
        this.isGameOver = false;
        this.battleStarted = false;
        this.isSetupPhase = true;
        this.checkBattleTimer = 0;

        // [Anim] 애니메이션 정의
        if (!this.anims.exists('cat_walk')) this.anims.create({ key: 'cat_walk', frames: this.anims.generateFrameNumbers('blueCat', { start: 0, end: 2 }), frameRate: 8, repeat: -1 });
        if (!this.anims.exists('dog_walk')) this.anims.create({ key: 'dog_walk', frames: this.anims.generateFrameNumbers('redDog', { start: 0, end: 1 }), frameRate: 6, repeat: -1 });

        if (!this.anims.exists('tanker_walk_anim')) this.anims.create({ key: 'tanker_walk_anim', frames: this.anims.generateFrameNumbers('tanker_walk', { start: 0, end: 1 }), frameRate: 6, repeat: -1 });
        if (!this.anims.exists('shooter_walk_anim')) this.anims.create({ key: 'shooter_walk_anim', frames: this.anims.generateFrameNumbers('shooter_walk', { start: 0, end: 2 }), frameRate: 8, repeat: -1 });
        if (!this.anims.exists('runner_walk_anim')) this.anims.create({ key: 'runner_walk_anim', frames: this.anims.generateFrameNumbers('runner_walk', { start: 0, end: 1 }), frameRate: 10, repeat: -1 });

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({ up: 'W', left: 'A', down: 'S', right: 'D' });

        this.blueTeam = this.physics.add.group({ runChildUpdate: true });
        this.redTeam = this.physics.add.group({ runChildUpdate: true });

        const { startY, spawnGap } = config.gameSettings;
        const blueCount = config.gameSettings.blueCount ?? config.gameSettings.unitCount ?? 6;
        const redCount = config.gameSettings.redCount ?? config.gameSettings.unitCount ?? 6;

        const blueRoles = config.blueTeamRoles;
        const redRoles = config.redTeamRoles || [config.redTeamStats]; 
        const aiConfig = config.aiSettings;

        const createUnit = (scene, x, y, texture, team, targetGroup, stats, isLeader) => {
            stats.aiConfig = aiConfig;
            const UnitClass = UnitClasses[stats.role] || UnitClasses['Normal'];
            const unit = new UnitClass(scene, x, y, texture, team, targetGroup, stats, isLeader);
            
            unit.setInteractive();
            scene.input.setDraggable(unit);
            
            return unit;
        };

        const leaderIndex = 0;

        for (let i = 0; i < blueCount; i++) {
            const by = startY + (i * spawnGap);
            const bx = 300;
            const isLeader = (i === leaderIndex);
            
            const configStats = blueRoles[i % blueRoles.length] || DEFAULT_CONFIG.blueTeamRoles[i % DEFAULT_CONFIG.blueTeamRoles.length];
            const baseDefaults = ROLE_BASE_STATS[configStats.role] || {};
            const finalStats = { ...baseDefaults, ...configStats }; 

            const blueUnit = createUnit(this, bx, by, 'blueCat', 'blue', this.redTeam, finalStats, isLeader);
            if (isLeader) this.playerUnit = blueUnit;
            this.blueTeam.add(blueUnit);
        }

        for (let i = 0; i < redCount; i++) {
            const by = startY + (i * spawnGap);
            const rx = 1300;
            const roleStats = redRoles[i % redRoles.length] || DEFAULT_CONFIG.redTeamRoles[0];
            const redUnit = createUnit(this, rx, by, 'redDog', 'red', this.blueTeam, roleStats, false);
            this.redTeam.add(redUnit);
        }

        // [Camera] 카메라 설정
        if(this.playerUnit && this.playerUnit.active) {
            this.blueTeam.getChildren().forEach(unit => {
                if (unit.active) unit.setFormationOffset(this.playerUnit.x, this.playerUnit.y);
            });

            this.cameras.main.setBounds(0, 0, this.physics.world.bounds.width, this.physics.world.bounds.height);
            this.cameras.main.startFollow(this.playerUnit, true, 0.1, 0.1);

            const deadzoneW = this.cameras.main.width * 0.4;
            const deadzoneH = this.cameras.main.height * 0.4;
            this.cameras.main.setDeadzone(deadzoneW, deadzoneH);
        }

        // [Physics] 충돌 설정
        if (wallLayer) {
            this.physics.add.collider(this.blueTeam, wallLayer);
            this.physics.add.collider(this.redTeam, wallLayer);
        }
        if (blockLayer) {
            this.physics.add.collider(this.blueTeam, blockLayer);
            this.physics.add.collider(this.redTeam, blockLayer);
        }

        this.physics.add.collider(this.blueTeam, this.redTeam, this.handleCombat, null, this);
        this.physics.add.collider(this.blueTeam, this.blueTeam);
        this.physics.add.collider(this.redTeam, this.redTeam);

        //this.createFormationUI();

        // [UI] Start Button
        this.startButton = this.add.text(this.cameras.main.centerX, 550, 'CLICK TO START', {
            fontSize: '50px', fill: '#ffffff', backgroundColor: '#00aa00', padding: { x: 20, y: 15 },
            fontStyle: 'bold'
        }).setOrigin(0.5).setInteractive().setScrollFactor(0); 

        this.startButton.on('pointerdown', () => this.handleStartBattle());

        // [UI] Info Text
        this.infoText = this.add.text(this.cameras.main.centerX, 50, '', {
            fontSize: '24px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5).setVisible(false).setScrollFactor(0); 

        // [UI] Battle Text
        this.battleText = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, 'FIGHT!', {
            fontSize: '80px', fill: '#ff0000', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 8
        }).setOrigin(0.5).setAlpha(0).setScrollFactor(0); 
    }

    createFormationUI() {
        const x = 50;
        const y = 50;
        const gap = 60;

        const createBtn = (label, offsetX, formationType) => {
            const btn = this.add.text(x + offsetX, y, label, {
                fontSize: '24px', fill: '#ffffff', backgroundColor: '#444444', padding: { x: 10, y: 5 },
                fixedWidth: 50, align: 'center'
            }).setInteractive().setScrollFactor(0);

            btn.on('pointerdown', () => {
                this.applyFormation(formationType);
                this.tweens.add({ targets: btn, scale: 0.9, duration: 50, yoyo: true });
            });
            return btn;
        };

        this.btnLine = createBtn('I', 0, 'line');
        this.btnWedge = createBtn('>', gap, 'wedge');
        this.btnFree = createBtn('Free', gap * 2, 'free');
    }

    applyFormation(type) {
        if (!this.playerUnit || !this.isSetupPhase) return;

        const units = this.blueTeam.getChildren().filter(u => u.active);
        const leaderX = this.playerUnit.x;
        const leaderY = this.playerUnit.y;
        
        if (type === 'free') {
            this.infoText.setVisible(true).setText("Free Formation Selected");
            this.time.delayedCall(1000, () => this.infoText.setVisible(false));
            return;
        }

        units.forEach((unit, index) => {
            let targetX, targetY;
            if (unit === this.playerUnit) return; 

            const relativeIndex = index > units.indexOf(this.playerUnit) ? index - 1 : index; 

            if (type === 'line') {
                targetX = leaderX; 
                targetY = 250 + (index * 90); 
            } 
            else if (type === 'wedge') {
                const gapX = 60;
                const gapY = 60;
                const col = Math.floor((relativeIndex) / 2) + 1;
                const rowDir = (relativeIndex % 2 === 0) ? 1 : -1; 
                targetX = leaderX - (col * gapX);
                targetY = leaderY + (col * gapY * rowDir);
            }

            if (targetX !== undefined) {
                this.tweens.add({
                    targets: unit,
                    x: targetX,
                    y: targetY,
                    duration: 300,
                    ease: 'Power2',
                    onUpdate: () => {
                        if(unit.body) { unit.body.x = unit.x - unit.body.width/2; unit.body.y = unit.y - unit.body.height/2; }
                    }
                });
            }
        });
    }

    handleStartBattle() {
        if (this.playerUnit && this.playerUnit.active) {
            this.blueTeam.getChildren().forEach(unit => {
                if (unit.active) unit.setFormationOffset(this.playerUnit.x, this.playerUnit.y);
            });
        }

        this.isSetupPhase = false;
        
        if(this.startButton) this.startButton.destroy();
        if(this.btnLine) this.btnLine.destroy();
        if(this.btnWedge) this.btnWedge.destroy();
        if(this.btnFree) this.btnFree.destroy();

        this.infoText.setVisible(true);
        this.infoText.setText('Move Leader! Squad will follow.');

        // [New] 전투 시작 시 모바일이면 다시 리더 추적 활성화
        if (this.isMobile && this.playerUnit && this.playerUnit.active) {
             this.cameras.main.startFollow(this.playerUnit, true, 0.1, 0.1);
        }

        this.startBattle();
    }

    update(time, delta) {
        if (this.isOrientationBad) return; // [New] 세로 모드면 업데이트 중지

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

    // [New] 화면 리사이즈 핸들러
    handleResize(gameSize) {
        const width = gameSize.width;
        const height = gameSize.height;

        // pc 모드의 50% 크기로 축소
        if (!this.sys.game.device.os.android && !this.sys.game.device.os.iOS && !this.sys.game.device.os.iPad && !this.sys.game.device.os.iPhone) {
            this.cameras.main.setZoom(0.5);
        } else {
            this.cameras.main.setZoom(1);
        }

        this.checkOrientation();

        // 1. 조이스틱 재배치
        if (this.joyStick) {
            this.joyStick.setPosition(width - 120, height - 120);
        }

        // 2. 주요 UI 재배치
        if (this.startButton) this.startButton.setPosition(width / 2, height - 150);
        if (this.infoText) this.infoText.setPosition(width / 2, 50);
        if (this.battleText) this.battleText.setPosition(width / 2, height / 2);
        
        // 3. 카메라 데드존 업데이트
        if (this.cameras.main.deadzone) {
             this.cameras.main.setDeadzone(width * 0.4, height * 0.4);
        }
        
        // 4. 피드백 UI 업데이트
        if (this.feedbackDOM) {
             this.feedbackDOM.setPosition(width / 2, height / 2 + 100);
        }
    }

    finishGame(message, color) {
        this.isGameOver = true;
        this.physics.pause();
        
        if(this.infoText) this.infoText.setVisible(false);
        // [New] 게임 종료 시 조이스틱 제거 (터치 간섭 방지)
        if (this.joyStick) {
             this.joyStick.base.setVisible(false);
             this.joyStick.thumb.setVisible(false);
        }

        const cx = this.cameras.main.centerX;
        const cy = this.cameras.main.centerY;

        // 1. Dimmer
        this.add.rectangle(cx, cy, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.7)
            .setScrollFactor(0).setDepth(100);

        // 2. Modal Window
        this.add.rectangle(cx, cy, 600, 500, 0x222222)
            .setStrokeStyle(4, 0xffffff)
            .setScrollFactor(0).setDepth(101);

        // 3. Message
        this.add.text(cx, cy - 180, message, {
            fontSize: '50px', fill: color, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(102);

        // 4. Restart Button
        const restartBtn = this.add.text(cx, cy - 80, 'Restart Game', {
            fontSize: '32px', fill: '#ffffff', backgroundColor: '#00aa00', padding: { x: 20, y: 15 }
        }).setOrigin(0.5).setInteractive().setScrollFactor(0).setDepth(102);

        restartBtn.on('pointerdown', () => {
            if (this.feedbackDOM) this.feedbackDOM.destroy();
            this.scene.restart();
        });

        // 5. Feedback UI (Textarea + Button)
        const div = document.createElement('div');
        div.style = "display: flex; flex-direction: column; align-items: center; gap: 10px;";
        div.innerHTML = `
            <textarea name="feedback" placeholder="Leave your feedback..." 
                style="font-size: 18px; padding: 10px; width: 400px; height: 120px; 
                border-radius: 5px; border: none; outline: none; resize: none; font-family: monospace;"></textarea>
            <button name="submitBtn" 
                style="font-size: 20px; padding: 10px 20px; background-color: #444444; color: white; border: 1px solid white; cursor: pointer; border-radius: 5px;">
                Submit Feedback
            </button>
        `;

        this.feedbackDOM = this.add.dom(cx, cy + 100, div)
            .setScrollFactor(0)
            .setDepth(102);

        const textarea = div.querySelector('textarea');
        if(textarea) {
            textarea.addEventListener('keydown', (e) => {
                e.stopPropagation();
            });
            // [New] 모바일에서 입력창 클릭 시 포커스 잘 잡히도록 터치 이벤트 처리
            textarea.addEventListener('touchstart', (e) => {
                e.target.focus();
            });
        }
            
        this.feedbackDOM.addListener('click');
        this.feedbackDOM.on('click', async (event) => {
            if (event.target.name === 'submitBtn') {
                const input = div.querySelector('textarea[name="feedback"]');
                if (input && input.value.trim() !== "") {
                    const feedbackMsg = input.value;
                    try {
                        await addDoc(collection(db, "feedbacks"), {
                            message: feedbackMsg,
                            timestamp: new Date().toISOString()
                        });
                        
                        console.log(`[Feedback Saved] ${feedbackMsg}`);
                        
                        input.value = '';
                        input.placeholder = "Saved to DB! Thanks!";
                        event.target.innerText = "Sent!";
                        event.target.style.backgroundColor = "#00aa00";
                        event.target.disabled = true;
                    } catch (e) {
                        console.error("Error saving feedback:", e);
                        event.target.innerText = "Error!";
                        event.target.style.backgroundColor = "#ff0000";
                    }
                }
            }
        });
    }
}