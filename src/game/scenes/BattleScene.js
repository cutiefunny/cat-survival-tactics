import Phaser from 'phaser';

// [Objects & Roles]
import Unit from '../objects/Unit'; 
import Shooter from '../objects/roles/Shooter';
import Runner from '../objects/roles/Runner';
import Tanker from '../objects/roles/Tanker';
import Dealer from '../objects/roles/Dealer';
import Normal from '../objects/roles/Normal';
import Leader from '../objects/roles/Leader';
import Healer from '../objects/roles/Healer';
import Raccoon from '../objects/roles/Raccoon';

// [Data & Config]
import { ROLE_BASE_STATS, DEFAULT_AI_SETTINGS } from '../data/UnitData'; 
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";

// [Managers & Systems]
import BattleUIManager from '../managers/BattleUIManager';
import InputManager from '../managers/InputManager';
import CombatManager from '../systems/CombatManager';

// [Assets - Maps]
import stage1Data from '../../assets/maps/stage1.json';
import level1Data from '../../assets/maps/level1.json';
import level2Data from '../../assets/maps/level2.json'; // Level 2 데이터

// [Assets - Tilesets]
import tilesetGrassImg from '../../assets/tilesets/TX_Tileset_Grass.png';
import tilesetPlantImg from '../../assets/tilesets/TX_Plant.png';
import tilesetCity1Img from '../../assets/tilesets/City_20.png';
import tilesetCity2Img from '../../assets/tilesets/City_20_2.png';
import tilesetParkImg from '../../assets/tilesets/park.png'; // Park 타일셋

// [Assets - Units]
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
    'NormalDog': Unit 
};

// [Level Config]
const LEVEL_LIST = ['level1', 'level2']; 

const DEFAULT_CONFIG = {
    showDebugStats: false,
    gameSettings: { blueCount: 6, redCount: 6, spawnGap: 90, startY: 250, mapSelection: 'level1' },
    aiSettings: DEFAULT_AI_SETTINGS, 
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

    init(data) {
        this.currentLevelIndex = data.levelIndex || 0;
        console.log(`🎮 [BattleScene] Initializing Level Index: ${this.currentLevelIndex} (Target: ${LEVEL_LIST[this.currentLevelIndex]})`);
    }

    preload() {
        const sheetConfig = { frameWidth: 100, frameHeight: 100 };

        this.load.spritesheet('leader', leaderSheet, sheetConfig);
        this.load.spritesheet('dog', dogSheet, sheetConfig); 
        this.load.spritesheet('raccoon', raccoonSheet, sheetConfig);
        this.load.spritesheet('shooter', shooterSheet, sheetConfig);
        this.load.spritesheet('tanker', tankerSheet, sheetConfig);
        this.load.spritesheet('runner', runnerSheet, sheetConfig);
        this.load.spritesheet('healer', healerSheet, sheetConfig);

        // 맵 데이터 로드
        this.load.tilemapTiledJSON('stage1', stage1Data);
        this.load.tilemapTiledJSON('level1', level1Data);
        this.load.tilemapTiledJSON('level2', level2Data);
        
        // 타일셋 이미지 로드
        this.load.image('tiles_grass', tilesetGrassImg);
        this.load.image('tiles_plant', tilesetPlantImg);
        this.load.image('tiles_city', tilesetCity1Img);
        this.load.image('tiles_city2', tilesetCity2Img);
        this.load.image('tiles_park', tilesetParkImg);
    }

    create() {
        this.uiManager = new BattleUIManager(this);
        this.inputManager = new InputManager(this);
        this.combatManager = new CombatManager(this);
        
        this.placementZone = null;
        this.zoneGraphics = null; 

        this.uiManager.createLoadingText();
        this.inputManager.setupControls();
        this.inputManager.checkMobileAndSetup();

        this.fetchConfigAndStart();
    }

    async fetchConfigAndStart() {
        let config = DEFAULT_CONFIG;
        try {
            const docRef = doc(db, "settings", "tacticsConfig");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const dbData = docSnap.data();
                config = { ...DEFAULT_CONFIG, ...dbData };
                if (dbData.aiSettings) {
                     config.aiSettings = { ...DEFAULT_CONFIG.aiSettings, ...dbData.aiSettings };
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
        
        const targetMapKey = LEVEL_LIST[this.currentLevelIndex];
        const mapKey = this.cache.tilemap.exists(targetMapKey) ? targetMapKey : 'level1';
        
        console.log(`🗺️ [BattleScene] Loading Map: '${mapKey}' (Target was '${targetMapKey}')`);
        this.startGame(config, mapKey);
    }

    startGame(config, mapKey) {
        const map = this.make.tilemap({ key: mapKey });
        
        const tilesets = [];

        if (mapKey === 'stage1') {
            const t1 = map.addTilesetImage('tileser_nature', 'tiles_grass');
            const t2 = map.addTilesetImage('tileset_trees', 'tiles_plant');
            if (t1) tilesets.push(t1);
            if (t2) tilesets.push(t2);

        } else if (mapKey === 'level2') {
            console.log("🌲 Loading Tileset for Level 2: Park");
            const t1 = map.addTilesetImage('Park', 'tiles_park');
            if (t1) tilesets.push(t1);

        } else {
            const t1 = map.addTilesetImage('City', 'tiles_city');
            const t2 = map.addTilesetImage('City2', 'tiles_city2');
            
            if (t1) tilesets.push(t1);
            if (t2) tilesets.push(t2);

            if (tilesets.length === 0) {
                console.log("🔍 Auto-detecting tilesets...");
                map.tilesets.forEach(ts => {
                    let imgKey;
                    if (ts.name.includes('Park')) imgKey = 'tiles_park';
                    else if (ts.name.includes('2')) imgKey = 'tiles_city2';
                    else imgKey = 'tiles_city';
                    
                    const t = map.addTilesetImage(ts.name, imgKey);
                    if (t) tilesets.push(t);
                });
            }
        }

        const validTilesets = tilesets.filter(t => t);
        
        const groundLayer = map.createLayer('Ground', validTilesets, 0, 0);
        this.wallLayer = map.createLayer('Walls', validTilesets, 0, 0);
        this.blockLayer = map.createLayer('Blocks', validTilesets, 0, 0);

        if (this.wallLayer) this.wallLayer.setCollisionByExclusion([-1]);
        if (this.blockLayer) this.blockLayer.setCollisionByExclusion([-1]);
        
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        // [New] Blocks Object Layer 처리 (충돌체 생성)
        this.blockObjectGroup = this.physics.add.staticGroup();
        const blockObjectLayer = map.getObjectLayer('Blocks');
        
        if (blockObjectLayer) {
            console.log(`🧱 Found 'Blocks' object layer with ${blockObjectLayer.objects.length} objects.`);
            blockObjectLayer.objects.forEach(obj => {
                // Tiled의 좌표는 Top-Left 기준, Phaser Rectangle은 Center 기준이므로 보정
                const rect = this.add.rectangle(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width, obj.height);
                this.physics.add.existing(rect, true); // static body 생성
                rect.setVisible(false); // 충돌 영역은 보이지 않게 설정
                this.blockObjectGroup.add(rect);
            });
        }

        this.mapWidth = map.widthInPixels;
        this.mapHeight = map.heightInPixels;
        this.updateCameraBounds(this.scale.width, this.scale.height);

        this.isGameOver = false;
        this.battleStarted = false;
        this.isSetupPhase = true;
        this.checkBattleTimer = 0;
        this.isAutoBattle = true;
        this.squadState = 'FREE'; 
        this.gameSpeed = 1;
        this.physics.world.timeScale = 1;
        this.time.timeScale = 1;

        if (config.showDebugStats) this.uiManager.createDebugStats();
        this.uiManager.createStartButton(() => this.handleStartBattle());
        this.uiManager.createGameMessages();
        this.uiManager.createAutoBattleButton(() => this.toggleAutoBattle());
        this.uiManager.updateAutoButton(this.isAutoBattle);
        this.uiManager.createSquadButton(() => this.toggleSquadState());
        this.uiManager.createSpeedButton(() => this.toggleGameSpeed());

        this.createStandardAnimations();

        this.blueTeam = this.physics.add.group({ runChildUpdate: true });
        this.redTeam = this.physics.add.group({ runChildUpdate: true });
        
        this.spawnUnits(config, map);

        if(this.playerUnit && this.playerUnit.active) {
            this.cameras.main.startFollow(this.playerUnit, true, 0.1, 0.1);
            this.cameras.main.setDeadzone(this.cameras.main.width * 0.4, this.cameras.main.height * 0.4);
        }

        this.setupPhysicsColliders(this.wallLayer, this.blockLayer);
    }

    updateCameraBounds(screenWidth, screenHeight) {
        if (!this.mapWidth || !this.mapHeight) return;
        const paddingX = Math.max(0, (screenWidth - this.mapWidth) / 2);
        const paddingY = Math.max(0, (screenHeight - this.mapHeight) / 2);
        this.cameras.main.setBounds(-paddingX, -paddingY, this.mapWidth + 2 * paddingX, this.mapHeight + 2 * paddingY);
        if (paddingX > 0 || paddingY > 0) {
            this.cameras.main.centerOn(this.mapWidth / 2, this.mapHeight / 2);
        }
    }

    createStandardAnimations() {
        const unitTextures = ['leader', 'dog', 'raccoon', 'tanker', 'shooter', 'runner', 'healer']; 
        unitTextures.forEach(key => {
            if (this.textures.exists(key) && !this.anims.exists(`${key}_walk`)) {
                const frameRate = (key === 'healer') ? 3 : 6;
                this.anims.create({
                    key: `${key}_walk`,
                    frames: this.anims.generateFrameNumbers(key, { frames: [1, 2] }),
                    frameRate: frameRate,
                    repeat: -1
                });
            }
        });
    }

    spawnUnits(config, map) {
        const { startY, spawnGap } = config.gameSettings;
        const blueCount = config.gameSettings.blueCount ?? 6;
        const redCount = config.gameSettings.redCount ?? 6;
        const blueRoles = config.blueTeamRoles;
        const redRoles = config.redTeamRoles || [config.redTeamStats];
        
        const createUnit = (x, y, team, target, stats, isLeader) => {
            stats.aiConfig = config.aiSettings;
            const UnitClass = UnitClasses[stats.role] || UnitClasses['Normal'];
            const baseStats = ROLE_BASE_STATS[stats.role] || {};
            const safeStats = { ...stats };
            if (baseStats.attackRange) { safeStats.attackRange = baseStats.attackRange; }
            const finalStats = { ...baseStats, ...safeStats };
            const unit = new UnitClass(this, x, y, null, team, target, finalStats, isLeader);
            unit.setInteractive();
            this.input.setDraggable(unit);
            return unit;
        };

        const catsLayer = map.getObjectLayer('Cats');
        let spawnZone = null;
        if (catsLayer && catsLayer.objects.length > 0) {
            const obj = catsLayer.objects[0];
            spawnZone = new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height);
            this.placementZone = spawnZone; 
            this.zoneGraphics = this.add.graphics();
            this.zoneGraphics.fillStyle(0x00ff00, 0.2); 
            this.zoneGraphics.fillRectShape(spawnZone);
            this.zoneGraphics.setDepth(0); 
        } else {
            console.warn("⚠️ 'Cats' layer not found. Using default spawn.");
        }

        for (let i = 0; i < blueCount; i++) {
            const roleConfig = blueRoles[i % blueRoles.length];
            let spawnX, spawnY;
            if (spawnZone) {
                spawnX = Phaser.Math.Between(spawnZone.x + 20, spawnZone.right - 20);
                spawnY = Phaser.Math.Between(spawnZone.y + 20, spawnZone.bottom - 20);
            } else {
                spawnX = 300;
                spawnY = startY + (i * spawnGap);
            }
            const unit = createUnit(spawnX, spawnY, 'blue', this.redTeam, roleConfig, i === 0);
            if (i === 0) this.playerUnit = unit;
            this.blueTeam.add(unit);
        }

        const dogLayer = map.getObjectLayer('Dogs');
        if (dogLayer && dogLayer.objects.length > 0) {
            dogLayer.objects.forEach((obj, index) => {
                const stats = redRoles[index % redRoles.length];
                const unit = createUnit(obj.x, obj.y, 'red', this.blueTeam, stats, false);
                this.redTeam.add(unit);
            });
        } else {
            console.log("⚠️ No 'Dogs' layer found. Using default spawn logic.");
            for (let i = 0; i < redCount; i++) {
                const stats = redRoles[i % redRoles.length];
                const unit = createUnit(1300, startY + (i*spawnGap), 'red', this.blueTeam, stats, false);
                this.redTeam.add(unit);
            }
        }
    }
    
    setupPhysicsColliders(wallLayer, blockLayer) {
        const onWallCollision = (unit, tile) => {
            if (unit && typeof unit.handleWallCollision === 'function') unit.handleWallCollision(tile);
        };
        
        // 기존 타일 레이어 충돌
        if (wallLayer) {
            this.physics.add.collider(this.blueTeam, wallLayer, onWallCollision);
            this.physics.add.collider(this.redTeam, wallLayer, onWallCollision);
        }
        if (blockLayer) {
            this.physics.add.collider(this.blueTeam, blockLayer, onWallCollision);
            this.physics.add.collider(this.redTeam, blockLayer, onWallCollision);
        }

        // [New] Block 오브젝트 레이어 충돌 추가
        if (this.blockObjectGroup) {
            this.physics.add.collider(this.blueTeam, this.blockObjectGroup, onWallCollision);
            this.physics.add.collider(this.redTeam, this.blockObjectGroup, onWallCollision);
        }

        this.combatManager.setupColliders(this.blueTeam, this.redTeam);
        this.physics.add.collider(this.blueTeam, this.blueTeam);
        this.physics.add.collider(this.redTeam, this.redTeam);
    }

    handleStartBattle() {
        this.saveInitialFormation(); 
        this.isSetupPhase = false;
        if (this.zoneGraphics) { this.zoneGraphics.destroy(); this.zoneGraphics = null; }
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
            if (unit.active) unit.saveFormationPosition(lx, ly);
        });
    }

    selectPlayerUnit(newUnit) {
        if (!newUnit || !newUnit.active || this.playerUnit === newUnit) return;
        if (this.playerUnit) {
            this.playerUnit.isLeader = false;
            if (this.playerUnit.active && !this.playerUnit.isDying) this.playerUnit.resetVisuals();
        }
        this.playerUnit = newUnit;
        newUnit.isLeader = true;
        if (newUnit.active && !newUnit.isDying) newUnit.resetVisuals();
        this.cameras.main.startFollow(newUnit, true, 0.1, 0.1);
        this.updateFormationOffsets();
    }
    
    transferControlToNextUnit() {
        const nextLeader = this.blueTeam.getChildren().find(unit => 
            unit.active && !unit.isDying && unit !== this.playerUnit
        );
        if (nextLeader) this.selectPlayerUnit(nextLeader);
    }

    updateFormationOffsets() {
        if (this.playerUnit?.active && !this.playerUnit.isDying) {
            this.blueTeam.getChildren().forEach(unit => {
                if (unit.active) unit.calculateFormationOffset(this.playerUnit);
            });
        }
    }

    toggleAutoBattle() {
        this.isAutoBattle = !this.isAutoBattle;
        this.uiManager.updateAutoButton(this.isAutoBattle);
        if (!this.isAutoBattle && this.playerUnit?.body) this.playerUnit.setVelocity(0);
    }

    toggleSquadState() {
        if (this.squadState === 'FREE') this.squadState = 'FORMATION';
        else this.squadState = 'FREE';
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
        
        if (this.battleStarted && this.playerUnit && this.playerUnit.active && !this.playerUnit.isDying) {
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
            if (!this.playerUnit || !this.playerUnit.active || this.playerUnit.isDying) {
                this.transferControlToNextUnit();
            }
            this.combatManager.handleRangedAttacks([this.blueTeam, this.redTeam]);
            const blueCount = this.blueTeam.countActive();
            const redCount = this.redTeam.countActive();

            if (blueCount === 0) {
                this.finishGame("Defeat...", '#ff4444', false); 
            } else if (redCount === 0) {
                this.finishGame("Victory!", '#4488ff', true);   
            } else {
                this.uiManager.updateScore(blueCount, redCount);
            }
        }
    }

    handleResize(gameSize) {
        this.inputManager.handleResize(gameSize);
        this.uiManager.handleResize(gameSize.width, gameSize.height);
        if (this.cameras.main.deadzone) {
             this.cameras.main.setDeadzone(gameSize.width * 0.4, gameSize.height * 0.4);
        }
        this.updateCameraBounds(gameSize.width, gameSize.height);
    }

    finishGame(message, color, isWin) {
        if (this.isGameOver) return; 
        this.isGameOver = true;
        this.physics.pause();
        this.inputManager.destroy(); 

        let btnText = "Tap to Restart";
        let callback = () => this.restartLevel();

        if (isWin) {
            if (this.currentLevelIndex < LEVEL_LIST.length - 1) {
                btnText = "Next Level ▶️";
                callback = () => this.nextLevel();
            } else {
                btnText = "All Clear! 🏆";
                message = "Champion!";
                callback = () => this.restartGamerFromBeginning();
            }
        }

        this.uiManager.createGameOverUI(message, color, btnText, callback);
    }

    restartLevel() {
        this.scene.restart({ levelIndex: this.currentLevelIndex });
    }

    nextLevel() {
        const nextIndex = this.currentLevelIndex + 1;
        this.scene.restart({ levelIndex: nextIndex });
    }

    restartGamerFromBeginning() {
        this.scene.restart({ levelIndex: 0 });
    }
}