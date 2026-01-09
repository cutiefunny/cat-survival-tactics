import BaseScene from './BaseScene'; // BaseScene 임포트

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
import { LEVEL_KEYS, LEVEL_DATA } from '../managers/LevelManager'; 

// [Managers & Systems]
import BattleUIManager from '../managers/BattleUIManager';
import InputManager from '../managers/InputManager';
import CombatManager from '../systems/CombatManager';
import PathfindingManager from '../systems/PathfindingManager'; 
import Phaser from 'phaser';

// [Assets] (기존과 동일)
import stage1Data from '../../assets/maps/stage1.json';
import level4Data from '../../assets/maps/level4.json'; 
import tilesetGrassImg from '../../assets/tilesets/TX_Tileset_Grass.png';
import tilesetPlantImg from '../../assets/tilesets/TX_Plant.png';
import tilesetCity1Img from '../../assets/tilesets/City_20.png';
import tilesetCity2Img from '../../assets/tilesets/City_20_2.png';
import tilesetParkImg from '../../assets/tilesets/park.png'; 
import tilesetCarImg from '../../assets/tilesets/car.png'; 
import tilesetStreet1Img from '../../assets/tilesets/street1.png';
import tilesetStreet2Img from '../../assets/tilesets/street2.png';
import tilesetStreet3Img from '../../assets/tilesets/street3.png';
import tilesetStreet4Img from '../../assets/tilesets/street4.png';
import leaderSheet from '../../assets/units/leader.png';
import dogSheet from '../../assets/units/dog.png';
import raccoonSheet from '../../assets/units/raccoon.png';
import shooterSheet from '../../assets/units/shooter.png';
import tankerSheet from '../../assets/units/tanker.png';
import runnerSheet from '../../assets/units/runner.png';
import healerSheet from '../../assets/units/healer.png';
import stage1BgmFile from '../../assets/sounds/stage1_bgm.mp3';
import level1 from '../../assets/sounds/level1.mp3';
import level2 from '../../assets/sounds/level2.mp3';

const UnitClasses = {
    'Shooter': Shooter, 'Runner': Runner, 'Tanker': Tanker,
    'Dealer': Dealer, 'Normal': Normal, 'Leader': Leader, 
    'Healer': Healer, 'Raccoon': Raccoon, 'NormalDog': Unit 
};

const BGM_SOURCES = {
    'stage1_bgm': stage1BgmFile,
    'level1': level1,
    'level2': level2,
    'default': stage1BgmFile
};

const DEFAULT_UNIT_COSTS = [
    { role: 'Tanker', name: '탱커', cost: 10 },
    { role: 'Shooter', name: '슈터', cost: 20 },
    { role: 'Healer', name: '힐러', cost: 25 },
    { role: 'Raccoon', name: '너구리', cost: 10 },
    { role: 'Runner', name: '러너', cost: 10 },
    { role: 'Normal', name: '일반냥', cost: 5 }
];

const DEFAULT_CONFIG = {
    showDebugStats: false, 
    gameSettings: { blueCount: 1, redCount: 6, spawnGap: 90, startY: 250, mapSelection: 'level1', initialCoins: 50 },
    aiSettings: DEFAULT_AI_SETTINGS, 
    redTeamRoles: [{ role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 }],
    redTeamStats: { role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 },
    blueTeamRoles: [{ role: 'Leader', hp: 200, attackPower: 25, moveSpeed: 90 }],
    unitCosts: {} 
};

// [수정] BaseScene 상속
export default class BattleScene extends BaseScene {
    constructor() {
        super('BattleScene'); // key 전달
    }

    init(data) {
        let targetIndex = 0;
        this.hasLevelIndexPassed = false; 

        this.isStrategyMode = data && data.isStrategyMode;
        this.targetNodeId = data ? data.targetNodeId : null;
        this.armyConfig = data ? data.armyConfig : null;
        
        this.bgmKey = (data && data.bgmKey) ? data.bgmKey : 'default';

        if (data && data.levelIndex !== undefined) {
            targetIndex = data.levelIndex;
            this.hasLevelIndexPassed = true; 
        } else if (window.TACTICS_START_LEVEL !== undefined) {
            targetIndex = window.TACTICS_START_LEVEL;
        }

        this.currentLevelIndex = targetIndex;
        this.passedCoins = (data && data.currentCoins !== undefined) ? data.currentCoins : null;
        
        console.log(`🎮 [BattleScene] Init - StrategyMode: ${this.isStrategyMode}, BGM: ${this.bgmKey}`);
    }

    preload() {
        // ... (기존 에셋 로드 코드 유지) ...
        const sheetConfig = { frameWidth: 100, frameHeight: 100 };
        this.load.spritesheet('leader', leaderSheet, sheetConfig);
        this.load.spritesheet('dog', dogSheet, sheetConfig); 
        this.load.spritesheet('raccoon', raccoonSheet, sheetConfig);
        this.load.spritesheet('shooter', shooterSheet, sheetConfig);
        this.load.spritesheet('tanker', tankerSheet, sheetConfig);
        this.load.spritesheet('runner', runnerSheet, sheetConfig);
        this.load.spritesheet('healer', healerSheet, sheetConfig);

        this.load.tilemapTiledJSON('stage1', stage1Data);
        this.load.tilemapTiledJSON('level4', level4Data); 
        
        LEVEL_KEYS.forEach(key => {
            this.load.tilemapTiledJSON(key, LEVEL_DATA[key]);
        });
        
        this.load.image('tiles_grass', tilesetGrassImg);
        this.load.image('tiles_plant', tilesetPlantImg);
        this.load.image('tiles_city', tilesetCity1Img);
        this.load.image('tiles_city2', tilesetCity2Img);
        this.load.image('tiles_park', tilesetParkImg);
        this.load.image('tiles_car', tilesetCarImg); 
        this.load.image('tiles_street1', tilesetStreet1Img);
        this.load.image('tiles_street2', tilesetStreet2Img);
        this.load.image('tiles_street3', tilesetStreet3Img);
        this.load.image('tiles_street4', tilesetStreet4Img);

        const bgmFile = BGM_SOURCES[this.bgmKey] || BGM_SOURCES['default'];
        if (bgmFile) {
            this.load.audio(this.bgmKey, bgmFile);
        } else {
            this.load.audio('default', BGM_SOURCES['default']);
        }
    }

    create() {
        super.create(); // [수정] BaseScene.create() 호출 (리사이즈 이벤트 등록 등)

        // [수정] BaseScene의 playBgm 메서드 사용
        let playKey = this.bgmKey;
        if (!this.cache.audio.exists(playKey)) {
            playKey = 'default';
        }
        this.playBgm(playKey, 0.5);

        this.uiManager = new BattleUIManager(this);
        this.inputManager = new InputManager(this);
        this.combatManager = new CombatManager(this);
        this.pathfindingManager = new PathfindingManager(this); 
        
        this.placementZone = null;
        this.zoneGraphics = null; 
        this.blocksDebugGraphics = null;
        this.gameConfig = null; 

        this.uiManager.createLoadingText();
        this.inputManager.setupControls();
        this.inputManager.checkMobileAndSetup();

        this.input.keyboard.on('keydown-D', (event) => {
            if (event.shiftKey) this.toggleDebugMode();
        });

        this.fetchConfigAndStart();
    }
    
    // ... (toggleDebugMode, fetchConfigAndStart 등 중간 메서드들은 기존과 동일, 생략 없음) ...
    toggleDebugMode() {
        if (this.uiManager.isDebugEnabled) {
            this.uiManager.destroyDebugStats();
            if (this.blocksDebugGraphics) this.blocksDebugGraphics.setVisible(false);
        } else {
            this.uiManager.createDebugStats();
            if (!this.blocksDebugGraphics) this.createBlocksDebug();
            if (this.blocksDebugGraphics) this.blocksDebugGraphics.setVisible(true);
        }
    }
    
    async fetchConfigAndStart() {
         let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
         try {
            const docRef = doc(db, "settings", "tacticsConfig");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const dbData = docSnap.data();
                if (dbData.showDebugStats !== undefined) config.showDebugStats = dbData.showDebugStats;
                if (dbData.gameSettings) config.gameSettings = { ...config.gameSettings, ...dbData.gameSettings };
                if (dbData.unitCosts) config.unitCosts = { ...config.unitCosts, ...dbData.unitCosts };
                if (dbData.aiSettings) {
                      config.aiSettings = { ...DEFAULT_CONFIG.aiSettings, ...dbData.aiSettings };
                      if (dbData.aiSettings.common) {
                          config.aiSettings.common = { ...DEFAULT_CONFIG.aiSettings.common, ...dbData.aiSettings.common };
                      }
                }
                if (dbData.roleDefinitions) config.roleDefinitions = dbData.roleDefinitions;
                if (!this.hasLevelIndexPassed && dbData.gameSettings && dbData.gameSettings.startLevelIndex !== undefined) {
                    this.currentLevelIndex = dbData.gameSettings.startLevelIndex;
                }
            }
        } catch (error) { console.error("❌ Config Error:", error); }

        this.uiManager.destroyLoadingText();
        this.gameConfig = config; 

        this.currentShopData = DEFAULT_UNIT_COSTS.map(item => {
            if (config.unitCosts && config.unitCosts[item.role] !== undefined) {
                return { ...item, cost: parseInt(config.unitCosts[item.role]) };
            }
            return item;
        });

        if (this.passedCoins !== null) {
            this.playerCoins = this.passedCoins;
        } else {
            this.playerCoins = config.gameSettings.initialCoins ?? 50;
        }
        this.levelInitialCoins = this.playerCoins;
        
        config.blueTeamRoles = [{ role: 'Leader', hp: 200, attackPower: 25, moveSpeed: 90 }];
        config.gameSettings.blueCount = 1;

        if (this.currentLevelIndex === -1) {
            this.startGame(config, null); 
            return;
        }
        if (this.currentLevelIndex >= LEVEL_KEYS.length) this.currentLevelIndex = 0;
        
        const targetMapKey = LEVEL_KEYS[this.currentLevelIndex];
        const mapKey = this.cache.tilemap.exists(targetMapKey) ? targetMapKey : 'level1';
        this.startGame(config, mapKey);
    }

    startGame(config, mapKey) {
        if (!mapKey) {
            this.mapWidth = 2000; this.mapHeight = 2000; const tileSize = 32;
            this.physics.world.setBounds(0, 0, this.mapWidth, this.mapHeight);
            // ... (기존 그리드 생성 코드) ...
            const gridGraphics = this.add.graphics();
            gridGraphics.lineStyle(1, 0x333333, 0.5);
            gridGraphics.fillStyle(0x111111, 1);
            gridGraphics.fillRect(0, 0, this.mapWidth, this.mapHeight);
            for (let x = 0; x <= this.mapWidth; x += tileSize) {
                gridGraphics.moveTo(x, 0); gridGraphics.lineTo(x, this.mapHeight);
            }
            for (let y = 0; y <= this.mapHeight; y += tileSize) {
                gridGraphics.moveTo(0, y); gridGraphics.lineTo(this.mapWidth, y);
            }
            gridGraphics.strokePath();

            const virtualMap = { width: Math.ceil(this.mapWidth / tileSize), height: Math.ceil(this.mapHeight / tileSize), tileWidth: tileSize };
            this.blockObjectGroup = this.physics.add.staticGroup();
            this.pathfindingManager.setup(virtualMap, []);
            this.updateCameraBounds(this.scale.width, this.scale.height);
            this.initializeGameVariables(config);
            this.spawnUnits(config, null); 
            this.setupPhysicsColliders(null, null);

        } else {
            const map = this.make.tilemap({ key: mapKey });
            const tilesets = [];
            // ... (타일셋 로드 로직 동일) ...
            if (mapKey === 'stage1') {
                const t1 = map.addTilesetImage('tileser_nature', 'tiles_grass');
                const t2 = map.addTilesetImage('tileset_trees', 'tiles_plant');
                if (t1) tilesets.push(t1); if (t2) tilesets.push(t2);
            } else {
                const tCity1 = map.addTilesetImage('City', 'tiles_city');
                const tCity2 = map.addTilesetImage('City2', 'tiles_city2');
                if (tCity1) tilesets.push(tCity1); if (tCity2) tilesets.push(tCity2);
                map.tilesets.forEach(ts => {
                    if (tilesets.some(loadedTs => loadedTs.name === ts.name)) return;
                    let imgKey = null;
                    const name = ts.name;
                    if (name.includes('Park')) imgKey = 'tiles_park';
                    else if (name.includes('street1') || name === 'Street1') imgKey = 'tiles_street1';
                    else if (name.includes('street2') || name === 'Street2') imgKey = 'tiles_street2';
                    else if (name.includes('street3') || name === 'Street3') imgKey = 'tiles_street3';
                    else if (name.includes('street4') || name === 'Street4') imgKey = 'tiles_street4';
                    else if (name.includes('2') && name.includes('City')) imgKey = 'tiles_city2';
                    else if (name.includes('City')) imgKey = 'tiles_city';
                    else if (name.includes('Car') || name === 'car') imgKey = 'tiles_car';
                    if (imgKey) { const t = map.addTilesetImage(ts.name, imgKey); if (t) tilesets.push(t); }
                });
            }
            const validTilesets = tilesets.filter(t => t);
            const groundLayer = map.createLayer('Ground', validTilesets, 0, 0);
            this.wallLayer = map.createLayer('Walls', validTilesets, 0, 0);
            this.blockLayer = map.createLayer('Blocks', validTilesets, 0, 0);
            if (this.wallLayer) this.wallLayer.setCollisionByExclusion([-1]);
            if (this.blockLayer) this.blockLayer.setCollisionByExclusion([-1]);
            this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

            this.blockObjectGroup = this.physics.add.staticGroup();
            const blockObjectLayer = map.getObjectLayer('Blocks');
            if (blockObjectLayer) {
                blockObjectLayer.objects.forEach(obj => {
                    const rect = this.add.rectangle(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width, obj.height);
                    this.physics.add.existing(rect, true); rect.setVisible(false); this.blockObjectGroup.add(rect);
                });
            }
            const obstacleLayers = [this.wallLayer, this.blockLayer].filter(l => l !== null);
            this.pathfindingManager.setup(map, obstacleLayers);
            this.mapWidth = map.widthInPixels; this.mapHeight = map.heightInPixels;
            this.updateCameraBounds(this.scale.width, this.scale.height);
            this.initializeGameVariables(config);
            this.spawnUnits(config, map);
            this.setupPhysicsColliders(this.wallLayer, this.blockLayer);
        }
        
        if(this.playerUnit && this.playerUnit.active) {
            this.cameras.main.startFollow(this.playerUnit, true, 0.1, 0.1);
            this.cameras.main.setDeadzone(this.cameras.main.width * 0.4, this.cameras.main.height * 0.4);
        }
        this.uiManager.createShopUI(this.currentShopData, this.playerCoins, (role, cost) => this.buyUnit(role, cost));
    }
    
    // ... (initializeGameVariables, createBlocksDebug 등) ...
    initializeGameVariables(config) {
        this.isGameOver = false;
        this.battleStarted = false;
        this.isSetupPhase = true;
        this.checkBattleTimer = 0;
        this.isAutoBattle = true;
        this.squadState = 'FREE'; 
        this.gameSpeed = 1;
        this.physics.world.timeScale = 1;
        this.time.timeScale = 1;
        this.playerSkillCount = 0;
        this.battleStartTime = 0;
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
    }
    incrementSkillCount() { if (this.battleStarted && !this.isGameOver) { this.playerSkillCount++; } }
    createBlocksDebug() {
        this.blocksDebugGraphics = this.add.graphics().setDepth(1000);
        if (this.blockObjectGroup) {
            this.blocksDebugGraphics.lineStyle(2, 0xff0000, 0.5);
            this.blockObjectGroup.children.iterate((child) => {
                const { x, y, width, height } = child;
                this.blocksDebugGraphics.strokeRect(x - width/2, y - height/2, width, height);
            });
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

    // ... (spawnUnits, buyUnit, animateCoinDrop, showFloatingCoinText, setupPhysicsColliders 등 동일) ...
    spawnUnits(config, map) {
        const { startY, spawnGap } = config.gameSettings;
        const blueCount = config.gameSettings.blueCount ?? 1; 
        const redCount = config.gameSettings.redCount ?? 6;
        const blueRoles = config.blueTeamRoles;
        const defaultRedRoles = config.redTeamRoles || [config.redTeamStats];
        const createUnit = (x, y, team, target, stats, isLeader) => {
            stats.aiConfig = config.aiSettings;
            const UnitClass = UnitClasses[stats.role] || UnitClasses['Normal'];
            const baseStats = ROLE_BASE_STATS[stats.role] || {};
            const safeStats = { ...stats };
            if (baseStats.attackRange) { safeStats.attackRange = baseStats.attackRange; }
            const finalStats = { ...baseStats, ...safeStats };
            const unit = new UnitClass(this, x, y, null, team, target, finalStats, isLeader);
            unit.setInteractive();
            if (team === 'blue') { this.input.setDraggable(unit); }
            return unit;
        };
        // (spawnUnits 내부 로직 유지)
        let spawnZone = null;
        if (map) {
            const catsLayer = map.getObjectLayer('Cats');
            if (catsLayer && catsLayer.objects.length > 0) {
                const obj = catsLayer.objects[0];
                spawnZone = new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height);
                this.placementZone = spawnZone; 
                this.zoneGraphics = this.add.graphics();
                this.zoneGraphics.fillStyle(0x00ff00, 0.2); 
                this.zoneGraphics.fillRectShape(spawnZone);
                this.zoneGraphics.setDepth(0); 
            }
        }
        for (let i = 0; i < blueCount; i++) {
            const roleConfig = blueRoles[i % blueRoles.length];
            let spawnX, spawnY;
            if (spawnZone) {
                spawnX = Phaser.Math.Between(spawnZone.x + 20, spawnZone.right - 20);
                spawnY = Phaser.Math.Between(spawnZone.y + 20, spawnZone.bottom - 20);
            } else { spawnX = 300; spawnY = startY + (i * spawnGap); }
            const unit = createUnit(spawnX, spawnY, 'blue', this.redTeam, roleConfig, i === 0);
            if (i === 0) this.playerUnit = unit;
            this.blueTeam.add(unit);
        }
        let dogsSpawned = false;
        let redSpawnArea = null;
        if (map) {
            const dogLayer = map.getObjectLayer('Dogs');
            if (dogLayer && dogLayer.objects.length > 0) {
                const areaObj = dogLayer.objects.find(obj => obj.width > 0 && obj.height > 0);
                if (areaObj) redSpawnArea = new Phaser.Geom.Rectangle(areaObj.x, areaObj.y, areaObj.width, areaObj.height);
            }
        }
        if (this.armyConfig) {
            const count = this.armyConfig.count || 1;
            const armyStats = defaultRedRoles[0] || config.redTeamStats; 
            for (let i = 0; i < count; i++) {
                let spawnX, spawnY;
                if (redSpawnArea) {
                    spawnX = Phaser.Math.Between(redSpawnArea.x, redSpawnArea.right);
                    spawnY = Phaser.Math.Between(redSpawnArea.y, redSpawnArea.bottom);
                } else {
                    spawnX = (this.mapWidth || 2000) - 250 + Phaser.Math.Between(-30, 30);
                    spawnY = startY + (i * spawnGap);
                }
                const unit = createUnit(spawnX, spawnY, 'red', this.blueTeam, armyStats, false);
                this.redTeam.add(unit);
            }
            dogsSpawned = true;
        }
        if (!dogsSpawned && map) {
            const dogLayer = map.getObjectLayer('Dogs');
            if (dogLayer && dogLayer.objects.length > 0) {
                if (redSpawnArea) {
                    for (let i = 0; i < redCount; i++) {
                        const stats = defaultRedRoles[i % defaultRedRoles.length];
                        const spawnX = Phaser.Math.Between(redSpawnArea.x, redSpawnArea.right);
                        const spawnY = Phaser.Math.Between(redSpawnArea.y, redSpawnArea.bottom);
                        const unit = createUnit(spawnX, spawnY, 'red', this.blueTeam, stats, false);
                        this.redTeam.add(unit);
                    }
                } else {
                    dogLayer.objects.forEach((obj, index) => {
                        const stats = defaultRedRoles[index % defaultRedRoles.length];
                        const unit = createUnit(obj.x, obj.y, 'red', this.blueTeam, stats, false);
                        this.redTeam.add(unit);
                    });
                }
                dogsSpawned = true;
            }
        }
        if (!dogsSpawned) {
            for (let i = 0; i < redCount; i++) {
                const stats = defaultRedRoles[i % defaultRedRoles.length];
                const unit = createUnit(1300, startY + (i*spawnGap), 'red', this.blueTeam, stats, false);
                this.redTeam.add(unit);
            }
        }
    }
    
    buyUnit(role, cost) {
        if (!this.isSetupPhase) return;
        if (this.playerCoins >= cost) {
            this.playerCoins -= cost;
            this.uiManager.updateCoins(this.playerCoins);
            let stats = ROLE_BASE_STATS[role] || {};
            if (this.gameConfig && this.gameConfig.roleDefinitions && this.gameConfig.roleDefinitions[role]) {
                stats = { ...stats, ...this.gameConfig.roleDefinitions[role] };
                stats.role = role;
            }
            let spawnX = this.playerUnit ? this.playerUnit.x : 300;
            let spawnY = this.playerUnit ? this.playerUnit.y : 300;
            if (this.placementZone) {
                spawnX = Phaser.Math.Between(this.placementZone.x + 20, this.placementZone.right - 20);
                spawnY = Phaser.Math.Between(this.placementZone.y + 20, this.placementZone.bottom - 20);
            } else {
                spawnX += Phaser.Math.Between(-50, 50);
                spawnY += Phaser.Math.Between(-50, 50);
            }
            const finalStats = { ...stats };
            if (this.gameConfig && this.gameConfig.aiSettings) {
                finalStats.aiConfig = this.gameConfig.aiSettings;
            } else {
                finalStats.aiConfig = DEFAULT_AI_SETTINGS;
            }
            const UnitClass = UnitClasses[role] || UnitClasses['Normal'];
            const unit = new UnitClass(this, spawnX, spawnY, null, 'blue', this.redTeam, finalStats, false);
            unit.setInteractive();
            this.input.setDraggable(unit);
            this.blueTeam.add(unit);
            if (this.wallLayer) this.physics.add.collider(unit, this.wallLayer);
            if (this.blockLayer) this.physics.add.collider(unit, this.blockLayer);
            if (this.blockObjectGroup) this.physics.add.collider(unit, this.blockObjectGroup);
            console.log(`💰 Bought ${role}. Remaining Coins: ${this.playerCoins}`);
        } else {
            console.log("💸 Not enough coins!");
            this.tweens.addCounter({
                from: 0, to: 1, duration: 200, yoyo: true,
                onUpdate: (tween) => { this.cameras.main.shake(100, 0.005); }
            });
        }
    }
    animateCoinDrop(startX, startY, amount) {
        const coin = this.add.graphics();
        coin.fillStyle(0xFFD700, 1); coin.fillCircle(0, 0, 8); coin.lineStyle(2, 0xFFFFFF, 1); coin.strokeCircle(0, 0, 8);
        coin.setPosition(startX, startY); coin.setDepth(900); 
        this.tweens.add({
            targets: coin, y: startY - 60, alpha: 0, duration: 800, ease: 'Power1',
            onComplete: () => { coin.destroy(); this.playerCoins += amount; if(this.uiManager) this.uiManager.updateCoins(this.playerCoins); }
        });
        this.showFloatingCoinText(startX, startY, amount);
    }
    showFloatingCoinText(x, y, amount) {
        const text = this.add.text(x, y, `+${amount}`, {
            fontFamily: 'Arial', fontSize: '24px', color: '#FFD700', stroke: '#000000', strokeThickness: 3, fontWeight: 'bold'
        });
        text.setOrigin(0.5); text.setDepth(2000);
        this.tweens.add({ targets: text, y: y - 50, alpha: 0, duration: 1000, ease: 'Power2', onComplete: () => { text.destroy(); } });
    }
    setupPhysicsColliders(wallLayer, blockLayer) {
        const onWallCollision = (unit, tile) => {
            if (unit && typeof unit.handleWallCollision === 'function') unit.handleWallCollision(tile);
        };
        if (wallLayer) { this.physics.add.collider(this.blueTeam, wallLayer, onWallCollision); this.physics.add.collider(this.redTeam, wallLayer, onWallCollision); }
        if (blockLayer) { this.physics.add.collider(this.blueTeam, blockLayer, onWallCollision); this.physics.add.collider(this.redTeam, blockLayer, onWallCollision); }
        if (this.blockObjectGroup) { this.physics.add.collider(this.blueTeam, this.blockObjectGroup, onWallCollision); this.physics.add.collider(this.redTeam, this.blockObjectGroup, onWallCollision); }
        this.combatManager.setupColliders(this.blueTeam, this.redTeam);
        this.physics.add.collider(this.blueTeam, this.blueTeam);
        this.physics.add.collider(this.redTeam, this.redTeam);
    }
    handleStartBattle() {
        this.saveInitialFormation(); 
        this.isSetupPhase = false;
        this.uiManager.hideShopUI();
        if (this.zoneGraphics) { this.zoneGraphics.destroy(); this.zoneGraphics = null; }
        this.uiManager.cleanupBeforeBattle();
        if (this.isMobile && this.playerUnit?.active) { this.cameras.main.startFollow(this.playerUnit, true, 0.1, 0.1); }
        this.startBattle();
    }
    saveInitialFormation() {
        if (!this.playerUnit || !this.playerUnit.active) return;
        const lx = this.playerUnit.x; const ly = this.playerUnit.y;
        this.blueTeam.getChildren().forEach(unit => { if (unit.active && typeof unit.saveFormationPosition === 'function') unit.saveFormationPosition(lx, ly); });
    }
    selectPlayerUnit(newUnit) {
        if (!newUnit || !newUnit.active || this.playerUnit === newUnit) return;
        if (this.playerUnit) {
            this.playerUnit.isLeader = false;
            if (this.playerUnit.active && !this.playerUnit.isDying) this.playerUnit.resetVisuals();
        }
        this.playerUnit = newUnit; newUnit.isLeader = true;
        if (newUnit.active && !newUnit.isDying) newUnit.resetVisuals();
        this.cameras.main.startFollow(newUnit, true, 0.1, 0.1);
        this.updateFormationOffsets();
    }
    transferControlToNextUnit() {
        const nextLeader = this.blueTeam.getChildren().find(unit => unit.active && !unit.isDying && unit !== this.playerUnit);
        if (nextLeader) this.selectPlayerUnit(nextLeader);
    }
    updateFormationOffsets() {
        if (this.playerUnit?.active && !this.playerUnit.isDying) { this.blueTeam.getChildren().forEach(unit => { if (unit.active) unit.calculateFormationOffset(this.playerUnit); }); }
    }
    toggleAutoBattle() {
        this.isAutoBattle = !this.isAutoBattle;
        this.uiManager.updateAutoButton(this.isAutoBattle);
        if (!this.isAutoBattle && this.playerUnit?.body) this.playerUnit.setVelocity(0);
    }
    toggleSquadState() {
        this.squadState = (this.squadState === 'FREE') ? 'FORMATION' : 'FREE';
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
        this.battleStartTime = Date.now();
        this.uiManager.showStartAnimation();
    }
    update(time, delta) {
        if (this.inputManager.isOrientationBad) return;
        this.uiManager.updateDebugStats(this.game.loop);
        if (this.uiManager.isDebugEnabled) {
            if (!this.blocksDebugGraphics) this.createBlocksDebug();
            if (this.blocksDebugGraphics) this.blocksDebugGraphics.setVisible(true);
        } else {
            if (this.blocksDebugGraphics) this.blocksDebugGraphics.setVisible(false);
        }
        if (this.battleStarted && this.playerUnit && this.playerUnit.active && !this.playerUnit.isDying) {
            if (this.inputManager.spaceKey && Phaser.Input.Keyboard.JustDown(this.inputManager.spaceKey)) { this.playerUnit.tryUseSkill(); }
        }
        if (!this.blueTeam || !this.redTeam || this.isGameOver || this.isSetupPhase) return;
        if (!this.battleStarted && this.playerUnit?.active) {
            this.checkBattleTimer -= delta;
            if (this.checkBattleTimer <= 0) {
                this.checkBattleTimer = 100;
                if (this.combatManager.checkBattleDistance(this.blueTeam, this.redTeam)) { }
            }
        }
        if (this.battleStarted) {
            if (!this.playerUnit || !this.playerUnit.active || this.playerUnit.isDying) { this.transferControlToNextUnit(); }
            this.combatManager.handleRangedAttacks([this.blueTeam, this.redTeam]);
            const blueCount = this.blueTeam.countActive();
            const redCount = this.redTeam.countActive();
            if (blueCount === 0) { this.finishGame("Defeat...", '#ff4444', false); } 
            else if (redCount === 0) { this.finishGame("Victory!", '#4488ff', true); } 
            else { this.uiManager.updateScore(blueCount, redCount); }
        }
    }

    // [수정] handleResize: BaseScene에서 호출됨
    handleResize(gameSize) {
        this.inputManager.handleResize(gameSize);
        this.uiManager.handleResize(gameSize.width, gameSize.height);
        if (this.cameras.main.deadzone) {
             this.cameras.main.setDeadzone(gameSize.width * 0.4, gameSize.height * 0.4);
        }
        this.updateCameraBounds(gameSize.width, gameSize.height);
    }

    updateCameraBounds(w, h) { 
        if (!this.mapWidth) return;
        const paddingX = Math.max(0, (w - this.mapWidth) / 2);
        const paddingY = Math.max(0, (h - this.mapHeight) / 2);
        this.cameras.main.setBounds(-paddingX, -paddingY, this.mapWidth + 2 * paddingX, this.mapHeight + 2 * paddingY);
    }

    finishGame(message, color, isWin) {
        if (this.isGameOver) return; 
        this.isGameOver = true;
        this.physics.pause();
        this.inputManager.destroy(); 
        
        let btnText = "Tap to Restart";
        let callback = () => this.restartLevel();
        const endTime = Date.now();
        const durationSec = Math.floor((endTime - this.battleStartTime) / 1000);
        const survivors = this.blueTeam.countActive();
        const survivorScore = survivors * 500;
        const timeScore = Math.max(0, (300 - durationSec) * 10);
        const totalScore = isWin ? (survivorScore + timeScore) : 0;
        
        if (this.isStrategyMode) {
            btnText = "맵으로";
            callback = () => {
                const bonusCoins = isWin ? Math.floor(totalScore / 100) : 0;
                const finalCoins = this.playerCoins + bonusCoins;
                this.scene.stop('UIScene'); 
                this.scene.start('StrategyScene', {
                    battleResult: { isWin: isWin, targetNodeId: this.targetNodeId, remainingCoins: finalCoins, score: totalScore }
                });
            };
        } else {
            let rank = 'F';
            if (isWin) {
                if (totalScore >= 3500) rank = 'S';
                else if (totalScore >= 2500) rank = 'A';
                else if (totalScore >= 1500) rank = 'B';
                else rank = 'C';
                if (this.currentLevelIndex !== -1 && this.currentLevelIndex < LEVEL_KEYS.length - 1) {
                    btnText = "Next Level ▶️"; callback = () => this.nextLevel(totalScore); 
                } else {
                    btnText = "All Clear! 🏆"; message = "Champion!"; callback = () => this.restartGamerFromBeginning();
                }
            }
        }
        const resultData = {
            isWin: isWin, title: message, color: color, btnText: btnText,
            stats: { time: durationSec, survivors: survivors, score: totalScore, rank: isWin ? 'S' : 'F' }
        };
        this.uiManager.createGameOverUI(resultData, callback);
    }
    nextLevel(score) {
        const nextIndex = this.currentLevelIndex + 1;
        const bonusCoins = Math.floor(score / 100);
        const nextCoins = this.playerCoins + bonusCoins; 
        console.log(`🎉 [nextLevel] Score: ${score}, BonusCoins: ${bonusCoins}, NextCoins: ${nextCoins}`);
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        this.uiManager.playCoinAnimation(centerX, centerY, bonusCoins, () => {
            console.log("➡️ [nextLevel] Callback Triggered - Restarting Scene...");
            this.scene.restart({ levelIndex: nextIndex, currentCoins: nextCoins });
        });
    }
    restartLevel() { this.scene.restart({ levelIndex: this.currentLevelIndex, currentCoins: this.levelInitialCoins }); }
    restartGamerFromBeginning() { this.scene.restart({ levelIndex: 0 }); }
}