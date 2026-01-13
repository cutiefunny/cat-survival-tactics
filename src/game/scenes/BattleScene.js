import Phaser from 'phaser';
import BaseScene from './BaseScene'; 

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
import { ROLE_BASE_STATS, DEFAULT_AI_SETTINGS, getRandomUnitName } from '../data/UnitData'; 
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { LEVEL_KEYS, LEVEL_DATA } from '../managers/LevelManager'; 

// [Managers & Systems]
import BattleUIManager from '../managers/BattleUIManager';
import InputManager from '../managers/InputManager';
import CombatManager from '../systems/CombatManager';
import PathfindingManager from '../systems/PathfindingManager'; 

// [Assets]
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

// [Unit Sprites]
import leaderSheet from '../../assets/units/leader.png';
import dogSheet from '../../assets/units/dog.png';
import raccoonSheet from '../../assets/units/raccoon.png';
import shooterSheet from '../../assets/units/shooter.png';
import tankerSheet from '../../assets/units/tanker.png';
import runnerSheet from '../../assets/units/runner.png';
import healerSheet from '../../assets/units/healer.png';
import normalSheet from '../../assets/units/normal.png'; 

import stage1BgmFile from '../../assets/sounds/stage1_bgm.mp3';
import level1 from '../../assets/sounds/level1.mp3';
import level2 from '../../assets/sounds/level2.mp3';

// [Sounds]
import hit1 from '../../assets/sounds/Hit1.wav';
import hit2 from '../../assets/sounds/Hit2.wav';
import hit3 from '../../assets/sounds/Hit3.wav';

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

const DEFAULT_CONFIG = {
    showDebugStats: false, 
    gameSettings: { blueCount: 1, redCount: 6, spawnGap: 90, startY: 250, mapSelection: 'level1', initialCoins: 50 },
    aiSettings: DEFAULT_AI_SETTINGS, 
    redTeamRoles: [{ role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 }],
    redTeamStats: { role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 },
    blueTeamRoles: [], 
    unitCosts: {} 
};

export default class BattleScene extends BaseScene {
    constructor() {
        super('BattleScene');
    }

    init(data) {
        this.initData = data; 

        let targetIndex = 0;
        this.hasLevelIndexPassed = false; 

        this.isStrategyMode = data && data.isStrategyMode;
        this.targetNodeId = data ? data.targetNodeId : null;
        this.armyConfig = data ? data.armyConfig : null;
        this.bgmKey = (data && data.bgmKey) ? data.bgmKey : 'default';

        this.deadSquadIndices = [];

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
        const sheetConfig = { frameWidth: 100, frameHeight: 100 };
        this.load.spritesheet('leader', leaderSheet, sheetConfig);
        this.load.spritesheet('dog', dogSheet, sheetConfig); 
        this.load.spritesheet('raccoon', raccoonSheet, sheetConfig);
        this.load.spritesheet('shooter', shooterSheet, sheetConfig);
        this.load.spritesheet('tanker', tankerSheet, sheetConfig);
        this.load.spritesheet('runner', runnerSheet, sheetConfig);
        this.load.spritesheet('healer', healerSheet, sheetConfig);
        this.load.spritesheet('normal', normalSheet, sheetConfig);

        this.load.tilemapTiledJSON('stage1', stage1Data);
        this.load.tilemapTiledJSON('level4', level4Data); 
        LEVEL_KEYS.forEach(key => { this.load.tilemapTiledJSON(key, LEVEL_DATA[key]); });
        
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
        if (bgmFile) this.load.audio(this.bgmKey, bgmFile);
        else this.load.audio('default', BGM_SOURCES['default']);

        this.load.audio('hit1', hit1);
        this.load.audio('hit2', hit2);
        this.load.audio('hit3', hit3);
    }

    create() {
        super.create();
        
        if (!this.initData || !this.initData.debugConfig) {
            let playKey = this.bgmKey;
            if (!this.cache.audio.exists(playKey)) playKey = 'default';
            this.playBgm(playKey, 0.5);
        } else {
            console.log("🔇 [BattleScene] Mock Battle - BGM Skipped");
        }

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

        this.input.keyboard.on('keydown-D', (event) => { if (event.shiftKey) this.toggleDebugMode(); });

        this.fetchConfigAndStart();
    }

    playHitSound() {
        const hits = ['hit1', 'hit2', 'hit3'];
        const key = Phaser.Math.RND.pick(hits);
        if (this.sound && this.cache.audio.exists(key)) {
            this.sound.play(key, { volume: 0.4, detune: Phaser.Math.Between(-100, 100) });
        }
    }

    handleUnitDeath(unit) {
        if (unit.team === 'blue' && unit.squadIndex !== undefined) {
            this.deadSquadIndices.push(unit.squadIndex);
        }
    }

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
        if (this.initData && this.initData.debugConfig) {
            console.log("🛠️ [BattleScene] Using Mock Battle Config!");
            this.gameConfig = this.initData.debugConfig;
            const mapKey = LEVEL_KEYS[this.currentLevelIndex] || 'level1';
            this.uiManager.destroyLoadingText();
            if (this.passedCoins !== null) {
                this.playerCoins = this.passedCoins;
            } else {
                this.playerCoins = this.gameConfig.gameSettings.initialCoins ?? 50;
            }
            this.levelInitialCoins = this.playerCoins;
            this.startGame(this.gameConfig, mapKey);
            return;
        }

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

        if (this.passedCoins !== null) {
            this.playerCoins = this.passedCoins;
        } else {
            this.playerCoins = config.gameSettings.initialCoins ?? 50;
        }
        this.levelInitialCoins = this.playerCoins;

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
            
            const gridGraphics = this.add.graphics();
            gridGraphics.lineStyle(1, 0x333333, 0.5);
            gridGraphics.fillStyle(0x111111, 1);
            gridGraphics.fillRect(0, 0, this.mapWidth, this.mapHeight);
            gridGraphics.strokeRect(0, 0, this.mapWidth, this.mapHeight);

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
            
            this.fitCameraToMap(); 

            this.initializeGameVariables(config);
            this.spawnUnits(config, map);
            this.setupPhysicsColliders(this.wallLayer, this.blockLayer);
        }
        
        if(this.playerUnit && this.playerUnit.active && !this.isSetupPhase && !this.sys.game.device.os.desktop) {
            this.cameras.main.startFollow(this.playerUnit, true, 0.1, 0.1);
            this.cameras.main.setDeadzone(this.cameras.main.width * 0.4, this.cameras.main.height * 0.4);
        }
    }

    fitCameraToMap() {
        if (!this.mapWidth || !this.mapHeight) return;

        const isPC = this.sys.game.device.os.desktop;

        if (isPC) {
            this.cameras.main.setZoom(1);
            this.cameras.main.centerOn(this.mapWidth / 2, this.mapHeight / 2);
            return;
        }

        const { width, height } = this.scale;
        const footerHeight = 80;
        
        const availableHeight = height - footerHeight;

        const zoomX = width / this.mapWidth;
        const zoomY = availableHeight / this.mapHeight;
        const targetZoom = Math.max(zoomX, zoomY);

        this.cameras.main.setZoom(targetZoom);
        this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);
        
        const mapCenterX = this.mapWidth / 2;
        const mapCenterY = this.mapHeight / 2;
        this.cameras.main.centerOn(mapCenterX, mapCenterY);

        const screenCenterY = height / 2;
        const safeCenterY = availableHeight / 2;
        const offset = (screenCenterY - safeCenterY) / targetZoom; 
        this.cameras.main.scrollY -= offset;
    }

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
    updateCameraBounds(w, h) { 
        if (!this.mapWidth) return;
        this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);
    }
    
    createStandardAnimations() {
        const unitTextures = ['leader', 'dog', 'raccoon', 'tanker', 'shooter', 'runner', 'healer', 'normal']; 
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

    createUnitInstance(x, y, team, target, stats, isLeader) {
        if (this.gameConfig && this.gameConfig.aiSettings) {
            stats.aiConfig = this.gameConfig.aiSettings;
        } else {
            stats.aiConfig = DEFAULT_AI_SETTINGS;
        }

        const UnitClass = UnitClasses[stats.role] || UnitClasses['Normal'];
        const baseStats = ROLE_BASE_STATS[stats.role] || {};
        const safeStats = { ...stats };
        if (baseStats.attackRange) { safeStats.attackRange = baseStats.attackRange; }
        
        const finalStats = { ...baseStats, ...safeStats };

        const level = safeStats.level || 1;
        if (level > 1) {
            finalStats.attackPower += (level - 1) * 1;
            finalStats.hp += (level - 1) * 10;
            finalStats.maxHp = finalStats.hp; 
        }

        let applyFatigueTint = false;

        if (team === 'blue') {
            const fatigue = safeStats.fatigue || 0;
            const penaltyRatio = fatigue * 0.05; 
            const multiplier = Math.max(0, 1 - penaltyRatio);

            if (fatigue > 0) {
                finalStats.hp = Math.floor(finalStats.hp * multiplier);
                finalStats.attackPower = Math.floor(finalStats.attackPower * multiplier);
                if (finalStats.defense) finalStats.defense = Math.floor(finalStats.defense * multiplier);
                finalStats.moveSpeed = Math.floor(finalStats.moveSpeed * multiplier);
                
                applyFatigueTint = true; 
                console.log(`📉 [Fatigue] ${stats.role} (Lv.${level}): Fatigue ${fatigue} -> Stats reduced by ${(penaltyRatio*100).toFixed(0)}%`);
            }
        }

        const unit = new UnitClass(this, x, y, null, team, target, finalStats, isLeader);
        unit.setInteractive();
        
        if (stats.name) {
            unit.unitName = stats.name;
        }

        if (team === 'blue') {
            this.input.setDraggable(unit);
            if (applyFatigueTint) {
                unit.setTint(0x999999); 
            }
        }
        return unit;
    }

    spawnUnits(config, map) {
        const { startY, spawnGap } = config.gameSettings;

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

        const playerSquad = this.registry.get('playerSquad') || [{ role: 'Leader' }];
        
        playerSquad.forEach((member, i) => {
            const roleConfig = { ...member }; 
            
            if (!roleConfig.name) {
                roleConfig.name = getRandomUnitName(roleConfig.role);
            }

            let spawnX, spawnY;
            if (spawnZone) {
                spawnX = Phaser.Math.Between(spawnZone.x + 20, spawnZone.right - 20);
                spawnY = Phaser.Math.Between(spawnZone.y + 20, spawnZone.bottom - 20);
            } else {
                spawnX = 300;
                spawnY = startY + (i * spawnGap);
            }
            const isLeader = (member.role === 'Leader');
            
            const unit = this.createUnitInstance(spawnX, spawnY, 'blue', this.redTeam, roleConfig, isLeader);
            
            unit.squadIndex = i;

            if (isLeader) this.playerUnit = unit;
            this.blueTeam.add(unit);
        });

        const redCount = config.gameSettings.redCount ?? 6;
        const defaultRedRoles = config.redTeamRoles || [config.redTeamStats];
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
                const unit = this.createUnitInstance(spawnX, spawnY, 'red', this.blueTeam, armyStats, false);
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
                        const unit = this.createUnitInstance(spawnX, spawnY, 'red', this.blueTeam, stats, false);
                        this.redTeam.add(unit);
                    }
                } else {
                    dogLayer.objects.forEach((obj, index) => {
                        const stats = defaultRedRoles[index % defaultRedRoles.length];
                        const unit = this.createUnitInstance(obj.x, obj.y, 'red', this.blueTeam, stats, false);
                        this.redTeam.add(unit);
                    });
                }
                dogsSpawned = true;
            }
        }
        if (!dogsSpawned) {
            for (let i = 0; i < redCount; i++) {
                const stats = defaultRedRoles[i % defaultRedRoles.length];
                const unit = this.createUnitInstance(1300, startY + (i*spawnGap), 'red', this.blueTeam, stats, false);
                this.redTeam.add(unit);
            }
        }

        this.initialRedCount = this.redTeam.getLength();
    }
    
    buyUnit(role, cost) {
        if (this.playerCoins < cost) {
            console.log("💰 Not enough coins!");
            return;
        }

        this.playerCoins -= cost;
        if (this.uiManager) {
            this.uiManager.updateCoins(this.playerCoins);
        }

        const unitName = getRandomUnitName(role);
        
        const newUnitData = {
            role: role,
            name: unitName,
            level: 1,
            xp: 0,
            fatigue: 0
        };

        const currentSquad = this.registry.get('playerSquad') || [];
        currentSquad.push(newUnitData);
        this.registry.set('playerSquad', currentSquad);

        let spawnX = 400;
        let spawnY = 300;
        
        if (this.placementZone) {
            spawnX = Phaser.Math.Between(this.placementZone.x + 20, this.placementZone.right - 20);
            spawnY = Phaser.Math.Between(this.placementZone.y + 20, this.placementZone.bottom - 20);
        } else if (this.playerUnit && this.playerUnit.active) {
            spawnX = this.playerUnit.x + Phaser.Math.Between(-50, 50);
            spawnY = this.playerUnit.y + Phaser.Math.Between(-50, 50);
        }

        const unit = this.createUnitInstance(spawnX, spawnY, 'blue', this.redTeam, newUnitData, false);
        unit.squadIndex = currentSquad.length - 1;
        this.blueTeam.add(unit);

        console.log(`✨ Hired Mercenary: ${role} named "${unitName}"`);
    }

    animateCoinDrop(startX, startY, amount) {
        console.log(`💰 [Coin] Drop occurred! Amount: ${amount}, Pre-Total: ${this.playerCoins}`);
        
        const coin = this.add.graphics();
        coin.fillStyle(0xFFD700, 1); coin.fillCircle(0, 0, 8); coin.lineStyle(2, 0xFFFFFF, 1); coin.strokeCircle(0, 0, 8);
        coin.setPosition(startX, startY); coin.setDepth(900); 
        this.tweens.add({
            targets: coin, y: startY - 60, alpha: 0, duration: 800, ease: 'Power1',
            onComplete: () => { 
                coin.destroy(); 
                this.playerCoins += amount; 
                console.log(`💰 [Coin] Collected! New Total: ${this.playerCoins}`);
                if(this.uiManager) this.uiManager.updateCoins(this.playerCoins); 
            }
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
        
        if (this.zoneGraphics) { this.zoneGraphics.destroy(); this.zoneGraphics = null; }
        
        this.uiManager.cleanupBeforeBattle();

        if (this.playerUnit?.active && !this.sys.game.device.os.desktop) {
            this.cameras.main.startFollow(this.playerUnit, true, 0.1, 0.1);
            this.cameras.main.setDeadzone(this.scale.width * 0.4, this.scale.height * 0.4);
        }

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
        
        if (!this.sys.game.device.os.desktop) {
            this.cameras.main.startFollow(newUnit, true, 0.1, 0.1);
        }

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
            if (blueCount === 0) { this.finishGame("패배!", '#ff4444', false); } 
            else if (redCount === 0) { this.finishGame("승리!", '#4488ff', true); } 
            else { this.uiManager.updateScore(blueCount, redCount); }
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
        if (this.bgm) this.bgm.stop();

        const killedEnemies = Math.max(0, this.initialRedCount - this.redTeam.countActive());
        const xpGained = killedEnemies * 10;

        const currentSquad = this.registry.get('playerSquad') || [];
        const fallenUnits = this.registry.get('fallenUnits') || [];
        const nextSquad = [];
        
        const leveledUpUnits = [];
        const deadUnits = [];

        currentSquad.forEach((member, i) => {
            // [Modified] 리더 이름 강제 고정
            if (member.role === 'Leader') {
                member.name = '김냐냐';
            }

            if (this.deadSquadIndices.includes(i)) {
                fallenUnits.push({
                    ...member,
                    deathDate: new Date().toISOString(),
                    cause: 'Killed by Wild Dog',
                    deathLevel: this.currentLevelIndex + 1
                });
                deadUnits.push({ name: member.name, role: member.role });
            } else {
                member.xp = (member.xp || 0) + xpGained;
                let leveledUp = false;
                let oldLevel = member.level || 1;
                
                let reqXp = oldLevel * 100;
                while (member.xp >= reqXp) {
                    member.xp -= reqXp;
                    member.level = (member.level || 1) + 1;
                    reqXp = member.level * 100;
                    leveledUp = true;
                    console.log(`🆙 ${member.role} leveled up to ${member.level}!`);
                }

                if (leveledUp) {
                    leveledUpUnits.push({ 
                        name: member.name, 
                        role: member.role, 
                        oldLevel: oldLevel, 
                        newLevel: member.level 
                    });
                }

                member.fatigue = (member.fatigue || 0) + 1;
                nextSquad.push(member);
            }
        });

        this.registry.set('playerSquad', nextSquad);
        this.registry.set('fallenUnits', fallenUnits);

        const endTime = Date.now();
        const durationSec = Math.floor((endTime - this.battleStartTime) / 1000);
        const survivors = this.blueTeam.countActive();
        const survivorScore = survivors * 500;
        const timeScore = Math.max(0, (300 - durationSec) * 10);
        const totalScore = isWin ? (survivorScore + timeScore) : 0;
        
        // [Modified] 코인 계산: (전투중 획득한 코인) + (점수 보너스 코인)
        // this.playerCoins에는 이미 animateCoinDrop으로 획득한 코인이 들어있음
        const battleEarnings = Math.max(0, this.playerCoins - this.levelInitialCoins);
        const scoreBonus = isWin ? Math.floor(totalScore / 1000) : 0;
        const totalRewardCoins = battleEarnings + scoreBonus;

        let btnText = "Tap to Restart";
        let callback = () => this.restartLevel();

        if (this.isStrategyMode) {
            btnText = isWin ? "맵으로" : "맵으로";
            callback = () => {
                const finalCoins = this.playerCoins + scoreBonus; // playerCoins에는 이미 battleEarnings가 포함됨
                this.scene.stop('UIScene'); 
                this.scene.start('StrategyScene', {
                    battleResult: { isWin: isWin, targetNodeId: this.targetNodeId, remainingCoins: finalCoins, score: totalScore }
                });
            };
        } else {
            if (isWin) {
                if (this.currentLevelIndex !== -1 && this.currentLevelIndex < LEVEL_KEYS.length - 1) {
                    btnText = "Next Level ▶️"; callback = () => this.nextLevel(totalScore); 
                } else {
                    btnText = "All Clear! 🏆"; message = "Champion!"; callback = () => this.restartGamerFromBeginning();
                }
            }
        }
        
        const resultData = {
            isWin: isWin, 
            title: message, 
            color: color, 
            btnText: btnText,
            stats: { 
                rewardCoins: totalRewardCoins, // 합산된 코인량 전달
                leveledUpUnits: leveledUpUnits,
                deadUnits: deadUnits
            }
        };
        this.uiManager.createGameOverUI(resultData, callback);
    }

    nextLevel(score) {
        const nextIndex = this.currentLevelIndex + 1;
        const bonusCoins = Math.floor(score / 1000);
        const nextCoins = this.playerCoins + bonusCoins; 
        
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        this.uiManager.playCoinAnimation(centerX, centerY, bonusCoins, () => {
            this.scene.restart({ levelIndex: nextIndex, currentCoins: nextCoins });
        });
    }
    restartLevel() { this.scene.restart({ levelIndex: this.currentLevelIndex, currentCoins: this.levelInitialCoins }); }
    restartGamerFromBeginning() { this.scene.restart({ levelIndex: 0 }); }
}