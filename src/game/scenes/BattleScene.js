import Phaser from 'phaser';

// [Objects & Roles]
import Unit from '../objects/Unit'; // [Fix] 기본 Unit 클래스 임포트
import Shooter from '../objects/roles/Shooter';
import Runner from '../objects/roles/Runner';
import Tanker from '../objects/roles/Tanker';
import Dealer from '../objects/roles/Dealer';
import Normal from '../objects/roles/Normal';
import Leader from '../objects/roles/Leader';
import Healer from '../objects/roles/Healer';
import Raccoon from '../objects/roles/Raccoon';

// [Firebase]
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";

// [Managers & Systems]
import BattleUIManager from '../managers/BattleUIManager';
import InputManager from '../managers/InputManager';
import CombatManager from '../systems/CombatManager';

// [Assets - Maps]
import stage1Data from '../../assets/maps/stage1.json';
import tilesetGrassImg from '../../assets/tilesets/TX_Tileset_Grass.png';
import tilesetPlantImg from '../../assets/tilesets/TX_Plant.png';

// [Assets - Units]
// 🚨 파일 경로가 실제 프로젝트와 일치하는지 확인해주세요.
import leaderSheet from '../../assets/units/leader.png';
import dogSheet from '../../assets/units/dog.png';
import raccoonSheet from '../../assets/units/raccoon.png';
import shooterSheet from '../../assets/units/shooter.png';
import tankerSheet from '../../assets/units/tanker.png';
import runnerSheet from '../../assets/units/runner.png';
import healerSheet from '../../assets/units/healer.png';

const UnitClasses = {
    'Shooter': Shooter, 
    'Runner': Runner, 
    'Tanker': Tanker,
    'Dealer': Dealer, 
    'Normal': Normal, 
    'Leader': Leader, 
    'Healer': Healer, 
    'Raccoon': Raccoon,
    'NormalDog': Unit // [Fix] NormalDog는 기본 Unit 로직과 'dog' 텍스처를 사용
};

// [Update] 역할별 기본 스탯 정의
const ROLE_BASE_STATS = {
    'Leader': { hp: 200, attackPower: 25, moveSpeed: 90, skillCooldown: 30000, skillRange: 300, skillDuration: 10000 },
    'Tanker': { hp: 300, attackPower: 10, moveSpeed: 50, skillCooldown: 10000, skillRange: 200 },
    'Healer': { hp: 100, attackPower: 15, moveSpeed: 110, skillCooldown: 5000 },
    'Raccoon': { hp: 150, attackPower: 20, moveSpeed: 100, skillCooldown: 8000 },
    'Shooter': { hp: 80, attackPower: 30, moveSpeed: 80 },
    'Runner': { hp: 120, attackPower: 18, moveSpeed: 120 },
    'Normal': { hp: 140, attackPower: 15, moveSpeed: 70 },
    'NormalDog': { hp: 140, attackPower: 15, moveSpeed: 70 }
};

const DEFAULT_CONFIG = {
    showDebugStats: false,
    gameSettings: { blueCount: 6, redCount: 6, spawnGap: 90, startY: 250 },
    aiSettings: {
        // [Update] 기본값 명시 (도망 20%, 초당 회복 1%)
        common: { thinkTimeMin: 150, thinkTimeVar: 100, fleeHpThreshold: 0.2, hpRegenRate: 0.01 }, 
        runner: { ambushDistance: 60, fleeDuration: 1500 }, 
        dealer: { safeDistance: 150, followDistance: 50 },
        shooter: { attackRange: 250, kiteDistance: 200 } 
    },
    redTeamRoles: [{ role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 }],
    redTeamStats: { role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 },
    blueTeamRoles: [
        { role: 'Leader', hp: 200, attackPower: 25, moveSpeed: 90 },
        { role: 'Healer', hp: 100, attackPower: 20, moveSpeed: 110 },
        { role: 'Raccoon', hp: 150, attackPower: 20, moveSpeed: 100 },
        { role: 'Tanker', hp: 300, attackPower: 10, moveSpeed: 50 },
        { role: 'Shooter', hp: 80, attackPower: 30, moveSpeed: 80 },
        { role: 'Normal', hp: 140, attackPower: 15, moveSpeed: 70 }
    ]
};

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BattleScene' });
    }

    preload() {
        // [Asset Loading] 500x100 or 600x100 spritesheets
        const sheetConfig = { frameWidth: 100, frameHeight: 100 };

        // [Fix] 'dog' 키로 dog.png 로드 (이전 코드의 redDog 삭제)
        this.load.spritesheet('leader', leaderSheet, sheetConfig);
        this.load.spritesheet('dog', dogSheet, sheetConfig); 
        this.load.spritesheet('raccoon', raccoonSheet, sheetConfig);
        this.load.spritesheet('shooter', shooterSheet, sheetConfig);
        this.load.spritesheet('tanker', tankerSheet, sheetConfig);
        this.load.spritesheet('runner', runnerSheet, sheetConfig);
        this.load.spritesheet('healer', healerSheet, sheetConfig);

        // [Map]
        this.load.tilemapTiledJSON('stage1', stage1Data);
        this.load.image('tiles_grass', tilesetGrassImg);
        this.load.image('tiles_plant', tilesetPlantImg);
    }

    create() {
        this.uiManager = new BattleUIManager(this);
        this.inputManager = new InputManager(this);
        this.combatManager = new CombatManager(this);

        this.uiManager.createLoadingText();

        const map = this.make.tilemap({ key: 'stage1' });
        const tilesets = [
            map.addTilesetImage('tileser_nature', 'tiles_grass'),
            map.addTilesetImage('tileset_trees', 'tiles_plant')
        ].filter(t => t);

        const groundLayer = map.createLayer('Ground', tilesets, 0, 0);
        const wallLayer = map.createLayer('Walls', tilesets, 0, 0);
        const blockLayer = map.createLayer('Blocks', tilesets, 0, 0);

        if (wallLayer) wallLayer.setCollisionByExclusion([-1]);
        if (blockLayer) blockLayer.setCollisionByExclusion([-1]);
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        this.inputManager.setupControls();
        this.inputManager.checkMobileAndSetup();

        this.fetchConfigAndStart(wallLayer, blockLayer);
    }

    async fetchConfigAndStart(wallLayer, blockLayer) {
        let config = DEFAULT_CONFIG;
        try {
            const docRef = doc(db, "settings", "tacticsConfig");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const dbData = docSnap.data();
                config = { ...DEFAULT_CONFIG, ...dbData };
                if (dbData.aiSettings) {
                     config.aiSettings = { ...DEFAULT_CONFIG.aiSettings, ...dbData.aiSettings };
                     // common 병합 추가
                     if (dbData.aiSettings.common) {
                         config.aiSettings.common = { ...DEFAULT_CONFIG.aiSettings.common, ...dbData.aiSettings.common };
                     }
                }
                if (dbData.blueTeamRoles) {
                     if (dbData.blueTeamRoles.length < DEFAULT_CONFIG.blueTeamRoles.length) {
                         config.blueTeamRoles = [...dbData.blueTeamRoles, ...DEFAULT_CONFIG.blueTeamRoles.slice(dbData.blueTeamRoles.length)];
                     }
                }
            }
        } catch (error) { 
            console.error("❌ Config Error:", error); 
        }

        this.uiManager.destroyLoadingText();
        this.startGame(config, wallLayer, blockLayer);
    }

    startGame(config, wallLayer, blockLayer) {
        this.wallLayer = wallLayer;
        this.blockLayer = blockLayer;
        
        this.isGameOver = false;
        this.battleStarted = false;
        this.isSetupPhase = true;
        this.checkBattleTimer = 0;
        this.isAutoBattle = false;
        this.squadState = 'FREE'; 
        this.gameSpeed = 1;
        this.physics.world.timeScale = 1;
        this.time.timeScale = 1;

        if (config.showDebugStats) this.uiManager.createDebugStats();
        this.uiManager.createStartButton(() => this.handleStartBattle());
        this.uiManager.createGameMessages();
        this.uiManager.createAutoBattleButton(() => this.toggleAutoBattle());
        this.uiManager.createSquadButton(() => this.toggleSquadState());
        this.uiManager.createSpeedButton(() => this.toggleGameSpeed());

        // [Animation] 통합된 애니메이션 생성 함수 호출
        this.createStandardAnimations();

        this.blueTeam = this.physics.add.group({ runChildUpdate: true });
        this.redTeam = this.physics.add.group({ runChildUpdate: true });
        this.spawnUnits(config);

        if(this.playerUnit && this.playerUnit.active) {
            this.cameras.main.setBounds(0, 0, this.physics.world.bounds.width, this.physics.world.bounds.height);
            this.cameras.main.startFollow(this.playerUnit, true, 0.1, 0.1);
            this.cameras.main.setDeadzone(this.cameras.main.width * 0.4, this.cameras.main.height * 0.4);
        }

        this.setupPhysicsColliders(wallLayer, blockLayer);
    }

    createStandardAnimations() {
        const unitTextures = ['leader', 'dog', 'raccoon', 'tanker', 'shooter', 'runner', 'healer']; 
        
        unitTextures.forEach(key => {
            // [Check] 텍스처가 로드되었는지 확인 후 애니메이션 생성
            if (this.textures.exists(key) && !this.anims.exists(`${key}_walk`)) {
                this.anims.create({
                    key: `${key}_walk`,
                    frames: this.anims.generateFrameNumbers(key, { frames: [1, 2] }),
                    frameRate: 6,
                    repeat: -1
                });
            }
        });
    }

    spawnUnits(config) {
        const { startY, spawnGap } = config.gameSettings;
        const blueCount = config.gameSettings.blueCount ?? 6;
        const redCount = config.gameSettings.redCount ?? 6;
        const blueRoles = config.blueTeamRoles;
        const redRoles = config.redTeamRoles || [config.redTeamStats];
        
        const createUnit = (x, y, team, target, stats, isLeader) => {
            stats.aiConfig = config.aiSettings;
            const UnitClass = UnitClasses[stats.role] || UnitClasses['Normal'];
            const baseStats = ROLE_BASE_STATS[stats.role] || {};
            const finalStats = { ...baseStats, ...stats };
            
            // Texture Key는 Unit.js 내부에서 결정하므로 null을 넘김
            const unit = new UnitClass(this, x, y, null, team, target, finalStats, isLeader);
            
            unit.setInteractive();
            this.input.setDraggable(unit);
            return unit;
        };

        for (let i = 0; i < blueCount; i++) {
            const roleConfig = blueRoles[i % blueRoles.length];
            const stats = { ...ROLE_BASE_STATS[roleConfig.role], ...roleConfig };
            const unit = createUnit(300, startY + (i*spawnGap), 'blue', this.redTeam, stats, i===0);
            if (i===0) this.playerUnit = unit;
            this.blueTeam.add(unit);
        }

        for (let i = 0; i < redCount; i++) {
            const stats = redRoles[i % redRoles.length];
            const unit = createUnit(1300, startY + (i*spawnGap), 'red', this.blueTeam, stats, false);
            this.redTeam.add(unit);
        }
    }
    
    setupPhysicsColliders(wallLayer, blockLayer) {
        const onWallCollision = (unit, tile) => {
            if (unit && typeof unit.handleWallCollision === 'function') {
                unit.handleWallCollision(tile);
            }
        };

        if (wallLayer) {
            this.physics.add.collider(this.blueTeam, wallLayer, onWallCollision);
            this.physics.add.collider(this.redTeam, wallLayer, onWallCollision);
        }
        if (blockLayer) {
            this.physics.add.collider(this.blueTeam, blockLayer, onWallCollision);
            this.physics.add.collider(this.redTeam, blockLayer, onWallCollision);
        }

        this.combatManager.setupColliders(this.blueTeam, this.redTeam);
        this.physics.add.collider(this.blueTeam, this.blueTeam);
        this.physics.add.collider(this.redTeam, this.redTeam);
    }

    handleStartBattle() {
        this.saveInitialFormation(); 
        this.isSetupPhase = false;
        this.uiManager.cleanupBeforeBattle();

        if (this.isMobile && this.playerUnit?.active) {
             this.cameras.main.startFollow(this.playerUnit, true, 0.1, 0.1);
        }
        this.startBattle();
    }
    
    saveInitialFormation() {
        if (!this.playerUnit || !this.playerUnit.active) return;
        const lx = this.playerUnit.x;
        const ly = this.playerUnit.y;
        
        this.blueTeam.getChildren().forEach(unit => {
            if (unit.active) {
                unit.saveFormationPosition(lx, ly);
            }
        });
    }

    selectPlayerUnit(newUnit) {
        if (!newUnit || !newUnit.active || this.playerUnit === newUnit) return;

        if (this.playerUnit) {
            this.playerUnit.isLeader = false;
            this.playerUnit.resetVisuals(); 
        }

        this.playerUnit = newUnit;
        newUnit.isLeader = true;
        newUnit.resetVisuals(); 

        this.cameras.main.startFollow(newUnit, true, 0.1, 0.1);
        this.updateFormationOffsets();
    }

    updateFormationOffsets() {
        if (this.playerUnit?.active) {
            this.blueTeam.getChildren().forEach(unit => {
                if (unit.active) unit.calculateFormationOffset(this.playerUnit);
            });
        }
    }

    toggleAutoBattle() {
        this.isAutoBattle = !this.isAutoBattle;
        this.uiManager.updateAutoButton(this.isAutoBattle);
        if (!this.isAutoBattle && this.playerUnit?.body) {
            this.playerUnit.setVelocity(0);
        }
    }

    toggleSquadState() {
        if (this.squadState === 'FREE') {
            this.squadState = 'FORMATION';
        } else if (this.squadState === 'FORMATION') {
            this.squadState = 'FLEE';
        } else {
            this.squadState = 'FREE';
        }
        this.uiManager.updateSquadButton(this.squadState);
    }

    toggleGameSpeed() {
        this.gameSpeed++;
        if (this.gameSpeed > 3) this.gameSpeed = 1;
        
        this.physics.world.timeScale = 1 / this.gameSpeed; 
        this.time.timeScale = this.gameSpeed;
        
        this.uiManager.updateSpeedButton(this.gameSpeed);
    }

    startBattle() {
        if (this.battleStarted) return;
        this.battleStarted = true;
        this.uiManager.showStartAnimation();
    }

    update(time, delta) {
        if (this.inputManager.isOrientationBad) return;

        this.uiManager.updateDebugStats(this.game.loop);
        
        if (this.battleStarted && this.playerUnit && this.playerUnit.active) {
            if (this.inputManager.spaceKey && Phaser.Input.Keyboard.JustDown(this.inputManager.spaceKey)) { 
                this.playerUnit.tryUseSkill();
            }
        }

        if (!this.blueTeam || !this.redTeam || this.isGameOver || this.isSetupPhase) return;

        if (!this.battleStarted && this.playerUnit?.active) {
            this.checkBattleTimer -= delta;
            if (this.checkBattleTimer <= 0) {
                this.checkBattleTimer = 100;
                if (this.combatManager.checkBattleDistance(this.blueTeam, this.redTeam)) {
                    this.startBattle();
                }
            }
        }

        if (this.battleStarted) {
            // [Optimization] 배열 스프레드 연산자([...a, ...b]) 제거. 그룹 배열 자체를 넘김.
            this.combatManager.handleRangedAttacks([this.blueTeam, this.redTeam]);

            const blueCount = this.blueTeam.countActive();
            const redCount = this.redTeam.countActive();

            if (blueCount === 0) this.finishGame("Red Team Wins!", '#ff4444');
            else if (redCount === 0) this.finishGame("Blue Team Wins!", '#4488ff');
            else this.uiManager.updateScore(blueCount, redCount);
        }
    }

    handleResize(gameSize) {
        this.inputManager.handleResize(gameSize);
        this.uiManager.handleResize(gameSize.width, gameSize.height);
        if (this.cameras.main.deadzone) {
             this.cameras.main.setDeadzone(gameSize.width * 0.4, gameSize.height * 0.4);
        }
    }

    finishGame(message, color) {
        this.isGameOver = true;
        this.physics.pause();
        this.inputManager.destroy(); 
        this.uiManager.createGameOverUI(message, color, () => this.scene.restart());
    }
}