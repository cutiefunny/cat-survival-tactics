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
import Wawa from '../objects/roles/Wawa';

// [Data & Config]
import { ROLE_BASE_STATS, DEFAULT_AI_SETTINGS, getRandomUnitName } from '../data/UnitData'; 
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { LEVEL_KEYS } from '../managers/LevelManager'; 

// [Managers]
import MapAssetManager from '../managers/MapAssetManager'; 
import BattleUIManager from '../managers/BattleUIManager';
import InputManager from '../managers/InputManager';
import CombatManager from '../managers/CombatManager';       
import PathfindingManager from '../managers/PathfindingManager'; 

// [Unit Sprites]
import leaderSheet from '../../assets/units/leader.png';
import dogSheet from '../../assets/units/dog.png';
import raccoonSheet from '../../assets/units/raccoon.png';
import wawaSheet from '../../assets/units/wawa.png';
import shooterSheet from '../../assets/units/shooter.png';
import tankerSheet from '../../assets/units/tanker.png';
import runnerSheet from '../../assets/units/runner.png';
import healerSheet from '../../assets/units/healer.png';
import normalSheet from '../../assets/units/normal.png'; 
import bossSheet from '../../assets/units/boss.png'; 

// [Sounds]
import stage1BgmFile from '../../assets/sounds/stage1_bgm.mp3';
import level1 from '../../assets/sounds/level1.mp3';
import level2 from '../../assets/sounds/level2.mp3';
import level6 from '../../assets/sounds/level6.mp3';
import hit1 from '../../assets/sounds/Hit1.wav';
import hit2 from '../../assets/sounds/Hit2.wav';
import hit3 from '../../assets/sounds/Hit3.wav';
import ouch1 from '../../assets/sounds/Ouch1.mp3';
import ouch2 from '../../assets/sounds/Ouch2.mp3';

const UnitClasses = {
    'Shooter': Shooter, 'Runner': Runner, 'Tanker': Tanker,
    'Dealer': Dealer, 'Normal': Normal, 'Leader': Leader, 
    'Healer': Healer, 'Raccoon': Raccoon, 'Wawa': Wawa,'NormalDog': Unit 
};

const BGM_SOURCES = {
    'stage1_bgm': stage1BgmFile,
    'level1': level1,
    'level2': level2,
    'level6': level6,
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
        
        this.hasScriptPlayed = false;
        this.isWaitingForIntro = false; // 인트로 대기 플래그

        console.log(`🎮 [BattleScene] Init - StrategyMode: ${this.isStrategyMode}, BGM: ${this.bgmKey}`);
    }

    preload() {
        this.mapManager = new MapAssetManager(this);
        this.mapManager.preload();

        const sheetConfig = { frameWidth: 100, frameHeight: 100 };
        this.load.spritesheet('leader', leaderSheet, sheetConfig);
        this.load.spritesheet('dog', dogSheet, sheetConfig); 
        this.load.spritesheet('raccoon', raccoonSheet, sheetConfig);
        this.load.spritesheet('wawa', wawaSheet, sheetConfig);
        this.load.spritesheet('shooter', shooterSheet, sheetConfig);
        this.load.spritesheet('tanker', tankerSheet, sheetConfig);
        this.load.spritesheet('runner', runnerSheet, sheetConfig);
        this.load.spritesheet('healer', healerSheet, sheetConfig);
        this.load.spritesheet('normal', normalSheet, sheetConfig);
        if (bossSheet) this.load.spritesheet('boss', bossSheet, sheetConfig); 

        const bgmFile = BGM_SOURCES[this.bgmKey] || BGM_SOURCES['default'];
        if (bgmFile) this.load.audio(this.bgmKey, bgmFile);
        else this.load.audio('default', BGM_SOURCES['default']);

        this.load.audio('hit1', hit1);
        this.load.audio('hit2', hit2);
        this.load.audio('hit3', hit3);
        this.load.audio('ouch1', ouch1);
        this.load.audio('ouch2', ouch2);
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
        this.catsArea = null; 
        this.dogsArea = null; 
        
        this.zoneGraphics = null; 
        this.blocksDebugGraphics = null;
        this.gameConfig = null; 

        this.uiManager.createLoadingText();
        this.inputManager.setupControls();
        this.inputManager.checkMobileAndSetup();

        this.npcGroup = null; 
        this.touchingNpc = null; 
        this.npcTouchTimer = 0; 
        this.npcInteractionTriggered = false; 

        this.input.keyboard.on('keydown-D', (event) => { if (event.shiftKey) this.toggleDebugMode(); });
        
        // [New] Resume 이벤트 리스너 (이벤트 씬 종료 후 처리)
        this.events.on('resume', this.handleResume, this);

        this.uiManager.create();

        this.fetchConfigAndStart();
    }

    // [New] 이벤트 씬 종료 후 호출되는 핸들러
    handleResume(scene, data) {
        if (this.isWaitingForIntro) {
            console.log("▶️ [BattleScene] Intro Script Finished. Spawning units...");
            this.isWaitingForIntro = false;

            // 스크립트 실행 완료 표시 (1회성 보장)
            const storageKey = `map_script_played_${this.currentMapKey}`;
            localStorage.setItem(storageKey, 'true');

            // 유닛 스폰 (이때 Registry가 업데이트되어 있으므로 Shooter 등이 정상 소환됨)
            if (this.pendingConfig && this.currentMap) {
                this.spawnUnits(this.pendingConfig, this.currentMap);
                this.setupPhysicsColliders(this.wallLayer, this.blockLayer, this.npcGroup);
                
                // 플레이어 유닛이 생겼으므로 카메라 추적 시작
                if(this.playerUnit && this.playerUnit.active && !this.sys.game.device.os.desktop) {
                    this.cameras.main.startFollow(this.playerUnit, true, 0.1, 0.1);
                    this.cameras.main.setDeadzone(this.cameras.main.width * 0.4, this.cameras.main.height * 0.4);
                }
            }
        }
    }

    pauseBattle(isPaused) {
        if (isPaused) {
            this.physics.world.pause();
            this.time.paused = true;
        } else {
            this.physics.world.resume();
            this.time.paused = false;
        }
    }

    playHitSound() {
        const hits = ['hit1', 'hit2', 'hit3'];
        const key = Phaser.Math.RND.pick(hits);
        if (this.sound && this.cache.audio.exists(key)) {
            this.sound.play(key, { volume: 0.4, detune: Phaser.Math.Between(-100, 100) });
        }
    }

    playDieSound() {
        const dieSounds = ['ouch1', 'ouch2'];
        const key = Phaser.Math.RND.pick(dieSounds);
        if (this.sound && this.cache.audio.exists(key)) {
            this.sound.play(key, { volume: 0.6, detune: Phaser.Math.Between(-100, 100) });
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
                if (dbData.redTeamRoles) config.redTeamRoles = dbData.redTeamRoles;
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
        this.currentMapKey = mapKey; 
        let scriptData = null;

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
            if (this.cache.tilemap.exists(mapKey)) {
                const mapData = this.cache.tilemap.get(mapKey).data;
                if (mapData && mapData.script) {
                    scriptData = mapData.script;
                }
            }

            const mapDataObj = this.mapManager.createMap(mapKey);
            
            const map = mapDataObj.map;
            this.currentMap = map;
            this.wallLayer = mapDataObj.layers.wallLayer;
            this.blockLayer = mapDataObj.layers.blockLayer;
            this.blockObjectGroup = mapDataObj.blockObjectGroup;
            this.npcGroup = mapDataObj.npcGroup;

            this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

            const obstacleLayers = [this.wallLayer, this.blockLayer].filter(l => l !== null);
            this.pathfindingManager.setup(map, obstacleLayers);
            this.mapWidth = map.widthInPixels; this.mapHeight = map.heightInPixels;
            
            this.fitCameraToMap(); 
            this.initializeGameVariables(config);

            // [Modified] 스크립트 실행 여부 체크 (최초 1회만 실행)
            const scriptPlayedKey = `map_script_played_${mapKey}`;
            const alreadyPlayed = localStorage.getItem(scriptPlayedKey) === 'true';

            if (scriptData && !alreadyPlayed) {
                console.log(`📜 [BattleScene] Found new script for ${mapKey}. Playing Intro.`);
                
                this.isWaitingForIntro = true;
                this.pendingConfig = config; 
                
                this.scene.pause(); 
                this.scene.launch('EventScene', { 
                    mode: 'overlay', 
                    script: scriptData, 
                    parentScene: 'BattleScene' 
                });
                
                // 스크립트가 있다면 유닛 소환을 보류하고 리턴
                return;
            }

            // 스크립트가 없거나 이미 본 경우: 바로 유닛 소환
            this.spawnUnits(config, map);
            this.setupPhysicsColliders(this.wallLayer, this.blockLayer, this.npcGroup);
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

        this.retreatTimer = 0; 
        this.isRetreatModalOpen = false; 
        
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
        const unitTextures = ['leader', 'dog', 'raccoon', 'tanker', 'shooter', 'runner', 'healer', 'normal', 'wawa']; 
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
        let baseStats = ROLE_BASE_STATS[stats.role] || {};
        if (this.gameConfig && this.gameConfig.roleDefinitions && this.gameConfig.roleDefinitions[stats.role]) {
             baseStats = { ...baseStats, ...this.gameConfig.roleDefinitions[stats.role] };
        }

        const safeStats = { ...stats };
        if (baseStats.attackRange) { safeStats.attackRange = baseStats.attackRange; }
        
        const finalStats = { ...baseStats, ...safeStats };

        const growthHp = this.gameConfig?.gameSettings?.growthHp ?? 10;
        const growthAtk = this.gameConfig?.gameSettings?.growthAtk ?? 1;

        const level = safeStats.level || 1;
        if (level > 1) {
            finalStats.attackPower += (level - 1) * growthAtk;
            finalStats.hp += (level - 1) * growthHp;
            finalStats.maxHp = finalStats.hp; 
        }

        let applyFatigueTint = false;

        if (team === 'blue') {
            const fatigue = safeStats.fatigue || 0;
            const penaltyRate = this.gameConfig?.gameSettings?.fatiguePenaltyRate ?? 0.05;
            const penaltyRatio = fatigue * penaltyRate; 
            const multiplier = Math.max(0, 1 - penaltyRatio);

            if (fatigue > 0) {
                finalStats.hp = Math.floor(finalStats.hp * multiplier);
                finalStats.attackPower = Math.floor(finalStats.attackPower * multiplier);
                if (finalStats.defense) finalStats.defense = Math.floor(finalStats.defense * multiplier);
                finalStats.moveSpeed = Math.floor(finalStats.moveSpeed * multiplier);
                applyFatigueTint = true; 
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
        
        this.catsArea = spawnZone;

        const playerSquad = this.registry.get('playerSquad') || [{ role: 'Leader' }];
        
        playerSquad.forEach((member, i) => {
            const roleConfig = { ...member }; 
            if (!roleConfig.name) roleConfig.name = getRandomUnitName(roleConfig.role);

            let spawnX, spawnY;
            
            // [Modified] NPC 대체 스폰 로직 (role과 일치하는 NPC 찾기)
            let matchedNpc = null;
            if (this.npcGroup) {
                matchedNpc = this.npcGroup.getChildren().find(npc => 
                    npc.active && 
                    (npc.texture.key === member.role || npc.texture.key.toLowerCase() === member.role.toLowerCase())
                );
            }

            if (matchedNpc) {
                spawnX = matchedNpc.x;
                spawnY = matchedNpc.y;
                matchedNpc.destroy(); // NPC 제거 (유닛으로 변신)
                console.log(`✨ [BattleScene] NPC Transformed to Unit: ${member.role} at (${spawnX}, ${spawnY})`);
            } else if (spawnZone) {
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

        // 2. 적군 스폰 로직
        let redSpawnArea = null;
        let bossSpawnPoint = null; 
        
        if (map) {
            const dogLayer = map.getObjectLayer('Dogs');
            if (dogLayer && dogLayer.objects.length > 0) {
                const areaObj = dogLayer.objects.find(obj => obj.width > 0 && obj.height > 0);
                if (areaObj) {
                    redSpawnArea = new Phaser.Geom.Rectangle(areaObj.x, areaObj.y, areaObj.width, areaObj.height);
                }
                const pointObj = dogLayer.objects.find(obj => !obj.width && !obj.height);
                if (pointObj) {
                    bossSpawnPoint = { x: pointObj.x, y: pointObj.y };
                }
            }
        }
        this.dogsArea = redSpawnArea;

        let enemyRoster = [];
        if (this.armyConfig) {
            const configs = Array.isArray(this.armyConfig) ? this.armyConfig : [this.armyConfig];
            configs.forEach(cfg => {
                const count = cfg.count || 1;
                const type = cfg.type || 'NormalDog';
                const role = type.charAt(0).toUpperCase() + type.slice(1);
                for(let i=0; i<count; i++) {
                    enemyRoster.push(role);
                }
            });
        } else {
            const redCount = config.gameSettings.redCount ?? 6;
            const defaultRedRoles = config.redTeamRoles || [config.redTeamStats];
            for(let i=0; i<redCount; i++) {
                const stats = defaultRedRoles[i % defaultRedRoles.length];
                enemyRoster.push(stats.role || 'NormalDog');
            }
        }

        let bossUnitRole = null;
        let bossIndex = -1;

        if (this.armyConfig) {
            const priority = ['Boss', 'Tanker', 'Leader', 'Raccoon', 'Shooter', 'Healer', 'Runner'];
            for (const pRole of priority) {
                bossIndex = enemyRoster.findIndex(r => r === pRole);
                if (bossIndex !== -1) {
                    bossUnitRole = enemyRoster[bossIndex];
                    break;
                }
            }
            if (bossIndex === -1) {
                for (const pRole of priority) {
                    bossIndex = enemyRoster.findIndex(r => r.includes(pRole));
                    if (bossIndex !== -1) {
                        bossUnitRole = enemyRoster[bossIndex];
                        break;
                    }
                }
            }
            if (bossIndex === -1 && enemyRoster.length > 0) {
                bossIndex = 0;
                bossUnitRole = enemyRoster[0];
            }
        }

        if (bossIndex !== -1) {
            let bossX, bossY;
            if (bossSpawnPoint) {
                bossX = bossSpawnPoint.x;
                bossY = bossSpawnPoint.y;
            } else if (redSpawnArea) {
                bossX = redSpawnArea.centerX;
                bossY = redSpawnArea.centerY;
            } else {
                bossX = 1300;
                bossY = startY;
            }

            const bossStats = { 
                role: bossUnitRole, 
                name: `Boss ${bossUnitRole}`,
                level: 10
            };
            
            const bossUnit = this.createUnitInstance(bossX, bossY, 'red', this.blueTeam, bossStats, false);
            if ((bossUnitRole === 'Boss' || bossUnitRole === 'Tanker') && bossUnit.team === 'red') {
                bossUnit.baseSize *= 2;
                bossUnit.resetVisuals();
            }
            this.redTeam.add(bossUnit);
            const removed = enemyRoster.splice(bossIndex, 1);
        }

        enemyRoster.forEach((role, i) => {
            const stats = { role: role, name: `${role} ${i+1}` };
            let spawnX, spawnY;
            if (redSpawnArea) {
                spawnX = Phaser.Math.Between(redSpawnArea.x, redSpawnArea.right);
                spawnY = Phaser.Math.Between(redSpawnArea.y, redSpawnArea.bottom);
            } else {
                spawnX = 1300 + Phaser.Math.Between(-50, 50);
                spawnY = startY + (i * spawnGap);
            }

            const unit = this.createUnitInstance(spawnX, spawnY, 'red', this.blueTeam, stats, false);
            this.redTeam.add(unit);
        });

        this.initialRedCount = this.redTeam.getLength();
    }
    
    getCameraTarget(speaker) {
        if (speaker === '들개' && this.dogsArea) {
            return { x: this.dogsArea.centerX, y: this.dogsArea.centerY };
        }
        if (speaker === '김냐냐' && this.catsArea) {
            return { x: this.catsArea.centerX, y: this.catsArea.centerY };
        }
        return null; 
    }

    animateCoinDrop(startX, startY, amount) {
        const coin = this.add.graphics();
        coin.fillStyle(0xFFD700, 1); coin.fillCircle(0, 0, 8); coin.lineStyle(2, 0xFFFFFF, 1); coin.strokeCircle(0, 0, 8);
        coin.setPosition(startX, startY); coin.setDepth(900); 
        this.tweens.add({
            targets: coin, y: startY - 60, alpha: 0, duration: 800, ease: 'Power1',
            onComplete: () => { 
                coin.destroy(); 
                this.playerCoins += amount; 
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
        
        if (this.npcGroup) {
            this.physics.add.collider(this.redTeam, this.npcGroup, this.handleNpcCollision, null, this);
            this.physics.add.collider(this.blueTeam, this.npcGroup, this.handleNpcCollision, null, this);
        }
    }

    handleNpcCollision(unit, npc) {
        if (unit === this.playerUnit) {
            this.currentFrameTouchingNpc = npc;
        }
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
        if (this.squadState === 'FREE') {
            this.squadState = 'FORMATION';
        } else if (this.squadState === 'FORMATION') {
            this.squadState = 'HOLD';
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
    slowMotionForModal(isActive) {
        if (isActive) {
            this.physics.world.timeScale = 5; 
            this.time.timeScale = 0.2;
            if (this.cameras.main.postFX) {
                this.cameras.main.postFX.clear(); 
                const colorMatrix = this.cameras.main.postFX.addColorMatrix();
                colorMatrix.saturate(0.5); 
            }
        } else {
            this.physics.world.timeScale = 1 / this.gameSpeed; 
            this.time.timeScale = this.gameSpeed;
            if (this.cameras.main.postFX) {
                this.cameras.main.postFX.clear();
            }
        }
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
            if (!this.isGameOver && !this.isRetreatModalOpen) {
                this.checkRetreatCondition(delta);
            }
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
        this.updateNpcInteraction(delta);
    }

    updateNpcInteraction(delta) {
        if (this.currentFrameTouchingNpc) {
            const cursors = this.cursors || {};
            const wasd = this.wasd || {};
            const joy = this.joystickCursors || {};
            
            const isPushing = (
                cursors.left?.isDown || cursors.right?.isDown || cursors.up?.isDown || cursors.down?.isDown ||
                wasd.left?.isDown || wasd.right?.isDown || wasd.up?.isDown || wasd.down?.isDown ||
                joy.left?.isDown || joy.right?.isDown || joy.up?.isDown || joy.down?.isDown
            );

            if (isPushing) {
                if (this.touchingNpc === this.currentFrameTouchingNpc) {
                    if (!this.npcInteractionTriggered) {
                        this.npcTouchTimer += delta;
                        if (this.npcTouchTimer > 500) {
                            console.log("✅ NPC Interaction Triggered!"); 
                            this.triggerNpcEvent(this.touchingNpc);
                            this.npcInteractionTriggered = true; 
                        }
                    }
                } else {
                    console.log("🆕 Started pushing new NPC");
                    this.touchingNpc = this.currentFrameTouchingNpc;
                    this.npcTouchTimer = 0;
                    this.npcInteractionTriggered = false;
                }
            } else {
                this.npcTouchTimer = 0;
            }
        } else {
            this.touchingNpc = null;
            this.npcTouchTimer = 0;
            this.npcInteractionTriggered = false;
        }
        this.currentFrameTouchingNpc = null;
    }

    triggerNpcEvent(npc) {
        if (!npc.scriptData) return;
        console.log("🗣️ NPC Event Triggered:", npc.texture.key);
        this.slowMotionForModal(true);

        npc.scriptData.forEach(script => {
            if (script.type === 'dialog_confirm') {
                let dialogText = script.text;
                let dialogOptions = script.options;

                const costOption = script.options.find(opt => 
                    opt.action && opt.action.includes('remove_coins')
                );

                if (costOption) {
                    const idx = costOption.action.indexOf('remove_coins');
                    const cost = costOption.action[idx + 1];
                    
                    if (this.playerCoins < cost) {
                        dialogText = "코인이 부족합니다!";
                        dialogOptions = [
                            { text: "닫기", action: ["close"] }
                        ];
                    }
                }

                this.uiManager.showDialogConfirm(
                    dialogText, 
                    dialogOptions, 
                    (actionArray) => this.executeScriptAction(actionArray)
                );
            }
        });
    }

    executeScriptAction(actions) {
        if (!Array.isArray(actions)) return;
        let i = 0;
        while (i < actions.length) {
            const command = actions[i];
            i++;
            switch (command) {
                case 'restore_fatigue':
                    const fatigueAmount = actions[i]; 
                    i++;
                    this.restoreFatigue(fatigueAmount);
                    break;
                case 'restore_energy': 
                    const energyAmount = actions[i];
                    i++;
                    this.restoreEnergy(energyAmount);
                    break;
                case 'remove_coins':
                    const cost = actions[i]; 
                    i++;
                    this.removeCoins(cost);
                    break;
                case 'close':
                    this.slowMotionForModal(false);
                    break;
                default:
                    console.warn(`Unknown script command: ${command}`);
                    break;
            }
        }
    }

    restoreFatigue(amount) {
        const squad = this.registry.get('playerSquad') || [];
        let recoveredCount = 0;
        squad.forEach(member => {
            if (member.fatigue > 0) {
                member.fatigue = Math.max(0, member.fatigue - amount);
                recoveredCount++;
            }
        });
        this.registry.set('playerSquad', squad);
        
        this.blueTeam.getChildren().forEach(unit => {
            if (unit.active && !unit.isDying) {
                if (unit.showEmote) {
                    unit.showEmote(`피로도 -${amount}`, '#44ff44'); 
                }
            }
        });
        
        console.log(`💪 Fatigue restored by ${amount} for active units.`);
    }

    // [New] 로그 및 데이터 검증이 강화된 에너지 회복 함수
    restoreEnergy(amount) {
        console.log(`%c[restoreEnergy] Called with amount: ${amount}`, 'color: cyan; font-weight: bold;');
        const numericAmount = Number(amount);

        // 1. Registry Update
        const squad = this.registry.get('playerSquad') || [];
        squad.forEach((member, i) => {
            const maxE = member.maxEnergy || 100;
            const curE = (member.energy !== undefined) ? member.energy : 0;
            const nextE = Math.min(maxE, curE + numericAmount);
            console.log(`[Registry] Unit ${i} (${member.role}): ${curE} -> ${nextE} (Max: ${maxE})`);
            member.energy = nextE;
        });
        this.registry.set('playerSquad', squad);

        // 2. In-Game Unit Update
        this.blueTeam.getChildren().forEach((unit, i) => {
            if (unit.active && !unit.isDying) {
                // Safe access to maxEnergy (유닛 데이터 누락 방지)
                if (unit.maxEnergy === undefined) {
                    console.warn(`[Unit ${i}] maxEnergy is undefined! Defaulting to 100.`);
                    unit.maxEnergy = 100;
                }
                if (unit.energy === undefined) {
                    console.warn(`[Unit ${i}] energy is undefined! Defaulting to 0.`);
                    unit.energy = 0;
                }

                const prevE = unit.energy;
                unit.energy = Math.min(unit.maxEnergy, unit.energy + numericAmount);
                
                console.log(`[Ingame] Unit ${i} (${unit.role}): ${prevE} -> ${unit.energy} (Max: ${unit.maxEnergy})`);

                if (unit.showEmote) {
                    if(numericAmount > 999) unit.showEmote(`완전 회복!`, '#030e9eff'); 
                    else unit.showEmote(`에너지 +${numericAmount}`, '#030e9eff'); 
                }
            }
        });
        
        console.log(`⚡ Energy restored by ${numericAmount} for active units and registry.`);
    }

    removeCoins(amount) {
        if (this.playerCoins >= amount) {
            this.playerCoins -= amount;
            this.uiManager.updateCoins(this.playerCoins);
            console.log(`💰 Coins removed: ${amount}. Current: ${this.playerCoins}`);
        } else {
            console.log("💸 Not enough coins!");
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
    finishGame(message, color, isWin, fatiguePenalty = 1) {
        if (this.isGameOver) return; 
        this.isGameOver = true;
        this.physics.pause();
        this.inputManager.destroy(); 
        if (this.bgm) this.bgm.stop();
        const battleResult = this.processBattleOutcome(isWin, fatiguePenalty);
        const { resultStats, totalScore, totalRewardCoins, capturedUnits } = battleResult;
        if (capturedUnits.length > 0) {
            const names = capturedUnits.map(u => u.name).join(", ");
            message += `\n⛓️ 포로 발생: ${names}`;
        }
        let btnText = "Tap to Restart";
        let callback = () => this.restartLevel();
        if (this.isStrategyMode) {
            btnText = "맵으로";
            callback = () => {
                const finalCoins = this.playerCoins + (isWin ? Math.floor(totalScore / 1000) : 0); 
                this.scene.stop('UIScene'); 
                this.scene.start('StrategyScene', {
                    battleResult: { 
                        isWin: isWin, 
                        targetNodeId: this.targetNodeId, 
                        remainingCoins: finalCoins, 
                        score: totalScore 
                    }
                });
            };
        } else {
            if (isWin) {
                if (this.currentLevelIndex !== -1 && this.currentLevelIndex < LEVEL_KEYS.length - 1) {
                    btnText = "Next Level ▶️"; 
                    callback = () => this.nextLevel(totalScore); 
                } else {
                    btnText = "All Clear! 🏆"; 
                    message = "Champion!"; 
                    callback = () => this.restartGamerFromBeginning();
                }
            }
        }
        const uiData = {
            isWin: isWin, 
            title: message, 
            color: color, 
            btnText: btnText,
            stats: resultStats
        };
        this.uiManager.createGameOverUI(uiData, callback);
    }
    processBattleOutcome(isWin, fatiguePenalty) {
        const killedEnemies = Math.max(0, this.initialRedCount - this.redTeam.countActive());
        const xpGained = killedEnemies * 10;
        const currentSquad = this.registry.get('playerSquad') || [];
        const fallenUnits = this.registry.get('fallenUnits') || [];
        const prisonerList = this.registry.get('prisonerList') || [];
        const nextSquad = [];
        const leveledUpUnits = [];
        const deadUnits = [];
        const capturedUnits = []; 
        let prisonersToTake = 0;
        if (!isWin && fatiguePenalty >= 2) {
            const rand = Math.random() * 100;
            if (rand < 2) prisonersToTake = 3;       
            else if (rand < 7) prisonersToTake = 2;  
            else if (rand < 17) prisonersToTake = 1; 
        }
        const captureCandidates = currentSquad.map((u, i) => i).filter(i => {
            const member = currentSquad[i];
            return member.role !== 'Leader' && !this.deadSquadIndices.includes(i);
        });
        Phaser.Utils.Array.Shuffle(captureCandidates);
        const selectedPrisonerIndices = captureCandidates.slice(0, prisonersToTake);
        currentSquad.forEach((member, i) => {
            if (member.role === 'Leader') member.name = '김냐냐';
            if (this.deadSquadIndices.includes(i)) {
                if (member.role === 'Leader') {
                    member.fatigue = (member.fatigue || 0) + 5;
                    nextSquad.push(member);
                } else {
                    fallenUnits.push({
                        ...member,
                        deathDate: new Date().toISOString(),
                        cause: 'Killed by Wild Dog',
                        deathLevel: this.currentLevelIndex + 1
                    });
                    deadUnits.push({ name: member.name, role: member.role });
                }
            } else if (selectedPrisonerIndices.includes(i)) {
                prisonerList.push({
                    ...member,
                    capturedDate: new Date().toISOString(),
                    capturedLevel: this.currentLevelIndex + 1
                });
                capturedUnits.push({ name: member.name, role: member.role });
            } else {
                member.xp = (member.xp || 0) + xpGained;
                let oldLevel = member.level || 1;
                let reqXp = oldLevel * 100;
                let leveledUp = false;
                while (member.xp >= reqXp) {
                    member.xp -= reqXp;
                    member.level = (member.level || 1) + 1;
                    reqXp = member.level * 100;
                    leveledUp = true;
                }
                if (leveledUp) {
                    leveledUpUnits.push({ 
                        name: member.name, 
                        role: member.role, 
                        oldLevel: oldLevel, 
                        newLevel: member.level 
                    });
                }
                member.fatigue = (member.fatigue || 0) + fatiguePenalty;
                nextSquad.push(member);
            }
        });
        this.registry.set('playerSquad', nextSquad);
        this.registry.set('fallenUnits', fallenUnits);
        this.registry.set('prisonerList', prisonerList);
        const endTime = Date.now();
        const durationSec = Math.floor((endTime - this.battleStartTime) / 1000);
        const survivors = this.blueTeam.countActive();
        const survivorScore = survivors * 500;
        const timeScore = Math.max(0, (300 - durationSec) * 10);
        const totalScore = isWin ? (survivorScore + timeScore) : 0;
        const battleEarnings = Math.max(0, this.playerCoins - this.levelInitialCoins);
        const scoreBonus = isWin ? Math.floor(totalScore / 1000) : 0;
        const totalRewardCoins = battleEarnings + scoreBonus;
        return {
            resultStats: {
                rewardCoins: totalRewardCoins,
                leveledUpUnits,
                deadUnits,
                capturedUnits
            },
            totalScore,
            totalRewardCoins,
            capturedUnits
        };
    }
    checkRetreatCondition(delta) {
        if (!this.playerUnit || !this.playerUnit.active) return;
        const bounds = this.physics.world.bounds;
        const padding = this.playerUnit.baseSize / 2 + 10; 
        const { x, y } = this.playerUnit;
        let isPushing = false;
        const cursors = this.cursors || {};
        const wasd = this.wasd || {};
        const joy = this.joystickCursors || {};
        const leftInput = cursors.left?.isDown || wasd.left?.isDown || joy.left?.isDown;
        const rightInput = cursors.right?.isDown || wasd.right?.isDown || joy.right?.isDown;
        const upInput = cursors.up?.isDown || wasd.up?.isDown || joy.up?.isDown;
        const downInput = cursors.down?.isDown || wasd.down?.isDown || joy.down?.isDown;
        if (x <= bounds.x + padding && leftInput) isPushing = true;
        else if (x >= bounds.width - padding && rightInput) isPushing = true;
        else if (y <= bounds.y + padding && upInput) isPushing = true;
        else if (y >= bounds.height - padding && downInput) isPushing = true;
        if (isPushing) {
            this.retreatTimer += delta;
            if (this.retreatTimer > 1000) {
                this.triggerRetreat();
                this.retreatTimer = 0; 
            }
        } else {
            this.retreatTimer = 0;
        }
    }
    triggerRetreat() {
        this.isRetreatModalOpen = true;
        this.physics.pause(); 
        this.playerUnit.setVelocity(0, 0);
        const bounds = this.physics.world.bounds;
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const angle = Phaser.Math.Angle.Between(this.playerUnit.x, this.playerUnit.y, centerX, centerY);
        const pushBackDist = 30;
        this.playerUnit.setPosition(
            this.playerUnit.x + Math.cos(angle) * pushBackDist,
            this.playerUnit.y + Math.sin(angle) * pushBackDist
        );
        this.uiManager.createRetreatConfirmModal(
            () => { 
                this.isRetreatModalOpen = false;
                this.finishGame("작전상 후퇴!", "#ffaa00", false, 2);
            },
            () => { 
                this.isRetreatModalOpen = false;
                this.physics.resume();
            }
        );
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
    
    // [Modified] 새 게임 시작 시 스크립트 실행 기록 초기화
    restartGamerFromBeginning() {
        // 1. 스크립트/튜토리얼 재생 기록 삭제
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('map_script_played_') || key.startsWith('tutorial_played_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        console.log("🔄 [BattleScene] Game Reset: Script history cleared.");

        // 2. 레지스트리 초기화 (새 게임 상태)
        this.registry.set('playerSquad', [{ role: 'Leader' }]);
        this.registry.set('unlockedRoles', ['Normal']);
        this.registry.set('fallenUnits', []);
        this.registry.set('prisonerList', []);

        // 3. 레벨 0부터 다시 시작
        this.scene.restart({ levelIndex: 0 }); 
    }
}