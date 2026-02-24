import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { LEVEL_KEYS } from './LevelManager';
import { DEFAULT_AI_SETTINGS } from '../data/UnitData';
import territories from '../data/TerritoryConfig.json';

const DEFAULT_CONFIG = {
    showDebugStats: false, 
    gameSettings: { blueCount: 1, redCount: 6, spawnGap: 90, startY: 250, mapSelection: 'level1', initialCoins: 50 },
    aiSettings: DEFAULT_AI_SETTINGS, 
    redTeamRoles: [{ role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 }],
    redTeamStats: { role: 'NormalDog', hp: 140, attackPower: 15, moveSpeed: 70 },
    blueTeamRoles: [], 
    unitCosts: {} 
};

export default class BattleSceneInitializer {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * Firebase에서 설정을 가져오고 게임 시작
     */
    async fetchConfigAndStart() {
        console.log('🎮 [BattleSceneInitializer] fetchConfigAndStart() called');
        
        // 디버그 모드일 경우 즉시 시작
        if (this.scene.initData && this.scene.initData.debugConfig) {
            console.log('🎮 [BattleSceneInitializer] debugConfig detected - starting immediately');
            this.scene.gameConfig = this.scene.initData.debugConfig;
            const mapKey = LEVEL_KEYS[this.scene.currentLevelIndex] || 'level1';
            
            if (this.scene.passedCoins !== null) {
                this.scene.playerCoins = this.scene.passedCoins;
            } else {
                this.scene.playerCoins = this.scene.gameConfig.gameSettings.initialCoins ?? 50;
            }
            this.scene.levelInitialCoins = this.scene.playerCoins;
            
            console.log('🎮 [BattleSceneInitializer] Calling startGame with mapKey:', mapKey);
            this.startGame(this.scene.gameConfig, mapKey);
            return;
        }

        // Firebase에서 설정 로드
        console.log('🎮 [BattleSceneInitializer] Fetching config from Firebase...');
        let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        try {
            const docRef = doc(db, "settings", "tacticsConfig");
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const dbData = docSnap.data();
                
                if (dbData.showDebugStats !== undefined) {
                    config.showDebugStats = dbData.showDebugStats;
                }
                if (dbData.gameSettings) {
                    config.gameSettings = { ...config.gameSettings, ...dbData.gameSettings };
                }
                if (dbData.unitCosts) {
                    config.unitCosts = { ...config.unitCosts, ...dbData.unitCosts };
                }
                if (dbData.aiSettings) {
                    config.aiSettings = { ...DEFAULT_CONFIG.aiSettings, ...dbData.aiSettings };
                    if (dbData.aiSettings.common) {
                        config.aiSettings.common = { ...DEFAULT_CONFIG.aiSettings.common, ...dbData.aiSettings.common };
                    }
                }
                if (dbData.roleDefinitions) {
                    config.roleDefinitions = dbData.roleDefinitions;
                }
                if (!this.scene.hasLevelIndexPassed && dbData.gameSettings && dbData.gameSettings.startLevelIndex !== undefined) {
                    this.scene.currentLevelIndex = dbData.gameSettings.startLevelIndex;
                }
                if (dbData.redTeamRoles) {
                    config.redTeamRoles = dbData.redTeamRoles;
                }
            }
        } catch (error) {
            console.error("❌ Config Error:", error);
        }

        this.scene.gameConfig = config;

        // 코인 초기화
        if (this.scene.passedCoins !== null) {
            this.scene.playerCoins = this.scene.passedCoins;
        } else {
            this.scene.playerCoins = config.gameSettings.initialCoins ?? 50;
        }
        this.scene.levelInitialCoins = this.scene.playerCoins;

        // 맵 키 결정
        // [Arcade Mode] 아케이드 모드를 먼저 확인 (levelIndex 무관)
        let mapKey;
        if (this.scene.isArcadeMode) {
            // initData에서 arcadeMapId를 먼저 확인 (App.jsx에서 전달한 데이터)
            if (this.scene.initData && this.scene.initData.arcadeMapId) {
                mapKey = this.scene.initData.arcadeMapId;
                console.log(`🎮 [ArcadeMode] Using arcade map from initData: Territory ${this.scene.arcadeTerritoryId} (${mapKey})`);
            } else {
                // localStorage에서 현재 영역 ID 읽기
                const currentTerritoryId = parseInt(localStorage.getItem('arcadeCurrentTerritory') || '2');
                const territoryData = territories.territories[currentTerritoryId.toString()];
                
                if (territoryData && territoryData.mapId) {
                    mapKey = territoryData.mapId;
                    console.log(`🎮 [ArcadeMode] Territory ${currentTerritoryId}: "${territoryData.name}" (${mapKey})`);
                } else {
                    // 기본 맵으로 폴백
                    mapKey = 'level1';
                    console.log(`⚠️ [ArcadeMode] Territory config not found, using fallback map: ${mapKey}`);
                }
            }
            this.startGame(config, mapKey);
            return;
        }

        // 일반 모드: levelIndex를 확인
        if (this.scene.currentLevelIndex === -1) {
            this.startGame(config, null);
            return;
        }
        
        // 일반 모드: currentLevelIndex에 따라 맵 선택
        if (this.scene.currentLevelIndex >= LEVEL_KEYS.length) {
            this.scene.currentLevelIndex = 0;
        }
        const targetMapKey = LEVEL_KEYS[this.scene.currentLevelIndex];
        mapKey = this.scene.cache.tilemap.exists(targetMapKey) ? targetMapKey : 'level1';
        
        this.startGame(config, mapKey);
    }

    /**
     * 게임 시작 - 맵 생성, 유닛 스폰, 물리 설정
     */
    startGame(config, mapKey) {
        console.log('🎮 [BattleSceneInitializer] startGame() called with mapKey:', mapKey);
        this.scene.currentMapKey = mapKey;
        let scriptData = this.scene.levelScript;

        // 맵이 없는 경우 (테스트 모드)
        if (!mapKey) {
            this.setupVirtualMap(config);
            return;
        }

        // 맵 스크립트 데이터 추출
        if (this.scene.cache.tilemap.exists(mapKey)) {
            const mapData = this.scene.cache.tilemap.get(mapKey).data;
            if (!scriptData && mapData && mapData.script) {
                scriptData = mapData.script;
                if (mapData.script_condition) {
                    this.scene.levelScriptCondition = mapData.script_condition;
                }
            }
        }

        // [Arcade Mode] 아케이드 모드에서 영역별 카메라 줌 정보 읽기
        let cameraZoom = 1; // 기본 줌 레벨
        if (this.scene.isArcadeMode) {
            const currentTerritoryId = parseInt(localStorage.getItem('arcadeCurrentTerritory') || '2');
            const territoryData = territories.territories[currentTerritoryId.toString()];
            if (territoryData && territoryData.cameraZoom) {
                cameraZoom = territoryData.cameraZoom;
                console.log(`🎮 [ArcadeMode] Territory ${currentTerritoryId} camera zoom: ${cameraZoom}`);
            }
        }

        // 실제 타일맵 생성
        this.setupTiledMap(config, mapKey, scriptData, cameraZoom);
    }

    /**
     * 가상 맵 설정 (테스트용)
     */
    setupVirtualMap(config) {
        this.scene.mapWidth = 2000;
        this.scene.mapHeight = 2000;
        const tileSize = 32;

        this.scene.physics.world.setBounds(0, 0, this.scene.mapWidth, this.scene.mapHeight);

        // 그리드 배경 생성
        const gridGraphics = this.scene.add.graphics();
        gridGraphics.lineStyle(1, 0x333333, 0.5);
        gridGraphics.fillStyle(0x111111, 1);
        gridGraphics.fillRect(0, 0, this.scene.mapWidth, this.scene.mapHeight);
        gridGraphics.strokeRect(0, 0, this.scene.mapWidth, this.scene.mapHeight);

        // 가상 맵 데이터 생성
        const virtualMap = {
            width: Math.ceil(this.scene.mapWidth / tileSize),
            height: Math.ceil(this.scene.mapHeight / tileSize),
            tileWidth: tileSize
        };

        this.scene.wallObjectGroup = this.scene.physics.add.staticGroup();
        this.scene.blockObjectGroup = this.scene.physics.add.staticGroup();
        
        // [Test Walls] 점프 테스트용 벽 추가
        const testWalls = [
            { x: 300, y: 600, width: 100, height: 30 },  // 좌측 벽
            { x: 800, y: 600, width: 100, height: 30 },  // 우측 벽
            { x: 550, y: 750, width: 100, height: 30 }   // 중앙 벽
        ];
        testWalls.forEach(wallData => {
            const rect = this.scene.add.rectangle(wallData.x, wallData.y, wallData.width, wallData.height);
            this.scene.physics.add.existing(rect, true);
            this.scene.wallObjectGroup.add(rect);
        });
        console.log(`[SMOKE] Mock Battle - Added ${testWalls.length} test walls to wallObjectGroup`);
        
        this.scene.pathfindingManager.setup(virtualMap, []);
        
        this.scene.cameraManager.updateBounds(this.scene.scale.width, this.scene.scale.height);
        this.scene.initializeGameVariables(config);
        this.scene.spawnUnits(config, null);
        this.scene.setupPhysicsColliders(null, null);
    }

    /**
     * Tiled 맵 설정
     */
    setupTiledMap(config, mapKey, scriptData, cameraZoom = 1) {
        console.log('🎮 [BattleSceneInitializer] setupTiledMap() called with mapKey:', mapKey, 'cameraZoom:', cameraZoom);
        const mapDataObj = this.scene.mapManager.createMap(mapKey);
        console.log('🎮 [BattleSceneInitializer] Map created successfully');
        
        const map = mapDataObj.map;
        this.scene.currentMap = map;
        this.scene.wallLayer = mapDataObj.layers.wallLayer;
        this.scene.blockLayer = mapDataObj.layers.blockLayer;
        this.scene.wallObjectGroup = mapDataObj.wallObjectGroup;
        this.scene.blockObjectGroup = mapDataObj.blockObjectGroup;
        this.scene.npcGroup = mapDataObj.npcGroup;

        this.scene.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        // Pathfinding 설정
        const obstacleLayers = [this.scene.wallLayer, this.scene.blockLayer].filter(l => l !== null);
        this.scene.pathfindingManager.setup(map, obstacleLayers);
        
        this.scene.mapWidth = map.widthInPixels;
        this.scene.mapHeight = map.heightInPixels;
        
        // [Arcade Mode] 카메라 줌을 미리 설정 (fitToMap에서 사용될 예정)
        if (cameraZoom !== 1) {
            this.scene.forceArcadeZoom = cameraZoom;
        }
        
        // 카메라 핏 (forceArcadeZoom이 설정되어 있으면 그것을 사용함)
        this.scene.cameraManager.fitToMap();
        
        // 게임 변수 초기화
        this.scene.initializeGameVariables(config);

        // 유닛 스폰
        this.scene.spawnUnits(config, map);
        
        // 쥐 소환
        this.scene.objectManager.spawnMice();

        // 물리 충돌 설정
        this.scene.setupPhysicsColliders(
            this.scene.wallLayer, 
            this.scene.blockLayer, 
            this.scene.npcGroup
        );

        // 인트로 스크립트 처리
        this.handleIntroScript(config, scriptData);

        // 플레이어 카메라 따라가기
        if (this.scene.playerUnit?.active && !this.scene.isSetupPhase && !this.scene.sys.game.device.os.desktop) {
            this.scene.cameraManager.followPlayer(this.scene.playerUnit);
        }
    }

    /**
     * 인트로 스크립트 실행 처리
     */
    handleIntroScript(config, scriptData) {
        if (!scriptData) return;

        // [New] Mock Battle에서는 인트로 스크립트 스킵
        if (this.scene.initData && this.scene.initData.debugConfig) {
            console.log('🚀 [BattleScene] Mock Battle - Intro Script Skipped');
            return;
        }

        // [Modified] registry에서 played 상태 확인
        const mapScriptPlayed = this.scene.registry.get('mapScriptPlayed') || {};
        const alreadyPlayed = mapScriptPlayed[this.scene.currentMapKey];
        const isWinCondition = (this.scene.levelScriptCondition === 'win');

        if (alreadyPlayed || isWinCondition) return;

        console.log(`📜 [BattleScene] Playing Intro Script.`);
        
        this.scene.isWaitingForIntro = true;
        this.scene.pendingConfig = config;
        
        this.scene.scene.pause();
        this.scene.scene.launch('EventScene', {
            mode: 'overlay',
            script: scriptData,
            parentScene: 'BattleScene',
            mapKey: this.scene.currentMapKey  // [New] 맵 키 전달
        });
    }

    /**
     * 카메라 타겟 위치 가져오기 (이벤트용)
     */
    getCameraTarget(speaker) {
        if (speaker === '들개' && this.scene.dogsArea) {
            return { x: this.scene.dogsArea.centerX, y: this.scene.dogsArea.centerY };
        }
        if (speaker === '김냐냐' && this.scene.catsArea) {
            return { x: this.scene.catsArea.centerX, y: this.scene.catsArea.centerY };
        }
        return null;
    }
}
