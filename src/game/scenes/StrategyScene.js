import BaseScene from './BaseScene'; 
import Phaser from 'phaser';
import sangsuMap from '../../assets/maps/sangsu_map.json'; 

// [Restored] 이미지 Import 복구 (Vite 빌드 호환성을 위해 필수)
import leaderImg from '../../assets/units/leader.png';
import dogImg from '../../assets/units/dog.png';
import runnerImg from '../../assets/units/runner.png'; 
import tankerImg from '../../assets/units/tanker.png';
import shooterImg from '../../assets/units/shooter.png';
import healerImg from '../../assets/units/healer.png';
import raccoonImg from '../../assets/units/raccoon.png';
import normalImg from '../../assets/units/normal.png';
import bossImg from '../../assets/units/boss.png'; 

import sangsuTilesImg from '../../assets/tilesets/sangsu_map.jpg';
import openingBgm from '../../assets/sounds/opening.mp3';

// [New] Daiso 아이템 아이콘 Import
import catnipIcon from '../../assets/items/catnip.png';
import ciaoIcon from '../../assets/items/ciao.png';
import partyMixIcon from '../../assets/items/partyMix.png';

import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { ROLE_BASE_STATS, UNIT_COSTS } from '../data/UnitData'; 

import SaveManager from '../managers/SaveManager';
import StrategyUIManager from '../managers/StrategyUIManager'; 
import StrategyMapManager from '../managers/StrategyMapManager'; 
import StrategyTokenManager from '../managers/StrategyTokenManager'; 
import StrategyStateManager from '../managers/StrategyStateManager';
import StrategyBattleCoordinator from '../managers/StrategyBattleCoordinator';
import StrategyTurnManager from '../managers/StrategyTurnManager';
import StrategyEnemyAI from '../managers/StrategyEnemyAI';
import StrategyCameraManager from '../managers/StrategyCameraManager'; 

export default class StrategyScene extends BaseScene {
    constructor() {
        super('StrategyScene'); 
    }

    init(data) {
        this.stateManager = new StrategyStateManager(this);
        this.stateManager.initializeState(data);
    }

    preload() {
        this.load.tilemapTiledJSON('strategy_map', sangsuMap);
        this.load.image('sangsu_tiles', sangsuTilesImg);
        
        // [Fixed] Import된 변수를 사용하여 로드 (문자열 경로 X)
        this.load.spritesheet('leader_token', leaderImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('dog_token', dogImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('runner_token', runnerImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('tanker_token', tankerImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('shooter_token', shooterImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('healer_token', healerImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('raccoon_token', raccoonImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('normal_token', normalImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('boss_token', bossImg, { frameWidth: 100, frameHeight: 100 });

        // [New] Daiso 아이템 아이콘 로드
        this.load.image('icon_catnip', catnipIcon);
        this.load.image('icon_ciao', ciaoIcon);
        this.load.image('icon_partyMix', partyMixIcon);

        this.load.audio('opening_bgm', openingBgm);
    }

    create() {
        super.create(); 

        this.uiManager = new StrategyUIManager(this);
        this.mapManager = new StrategyMapManager(this); 
        this.tokenManager = new StrategyTokenManager(this);
        this.battleCoordinator = new StrategyBattleCoordinator(this);
        this.turnManager = new StrategyTurnManager(this);
        this.enemyAI = new StrategyEnemyAI(this);
        this.cameraManager = new StrategyCameraManager(this);

        this.scene.stop('UIScene');
        this.cameras.main.setBackgroundColor('#111');

        this.input.addPointer(1);
        
        this.tokenManager.createAnimations();

        const map = this.make.tilemap({ key: 'strategy_map' });
        const tilesetName = map.tilesets[0].name;
        const tileset = map.addTilesetImage(tilesetName, 'sangsu_tiles');

        if (tileset) {
            map.layers.forEach(layerData => {
                const layer = map.createLayer(layerData.name, tileset, 0, 0);
                if (layer) layer.setDepth(0);
            });
        }

        this.events.on('resume', (scene, data) => {
            if (this.pendingNode) {
                this.handleNodeArrival(this.pendingNode);
                this.pendingNode = null;
            }
        });

        this.fetchStrategyConfig(map);
    }

    async fetchStrategyConfig(map) {
        let armyData = {};
        this.strategySettings = null; 

        try {
            const docRef = doc(db, "settings", "tacticsConfig");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.territoryArmies) armyData = data.territoryArmies;
                
                this.strategySettings = {
                    gameSettings: data.gameSettings || {},
                    roleDefinitions: data.roleDefinitions || {}
                };

                if (data.gameSettings) {
                    this.registry.set('gameSettings', data.gameSettings);
                }

                if (data.roleDefinitions) {
                    this.registry.set('roleDefinitions', data.roleDefinitions);
                }
            }
        } catch (e) {
            console.error("❌ Failed to load strategy config:", e);
        }
        
        this.stateManager.applyInitialDefaults(this.strategySettings);

        this.initializeGameWorld(map, armyData);
    }

    initializeGameWorld(map, dbArmyData) {
        this.hasMoved = false;
        this.previousLeaderId = null;
        this.selectedTargetId = null; 
        
        this.playBgm('opening_bgm', 0.5);

        this.mapManager.initialize(map, dbArmyData);
        const mapNodes = this.mapManager.mapNodes;

        // 전투 결과 처리
        const result = this.battleCoordinator.processBattleResult(this.battleResultData, mapNodes);
        const battleResultMessage = result.message;
        const postBattleScript = result.postBattleScript;

        this.tokenManager.createEnemyTokens(mapNodes);
        this.createPlayerToken(); 

        this.uiManager.createUI();
        
        if (battleResultMessage) {
            this.uiManager.setStatusText(battleResultMessage);
        }
        
        this.uiManager.updateState();

        this.cameraManager.updateLayout();
        this.cameraManager.setupControls();

        // 전투 승리 스크립트 재생
        if (postBattleScript) {
            console.log("📜 Playing Post-Battle Script (Win Condition)");
            this.time.delayedCall(500, () => {
                this.scene.pause();
                this.scene.launch('EventScene', { 
                    mode: 'overlay', 
                    script: postBattleScript, 
                    parentScene: 'StrategyScene' 
                });
            });
        }
    }

    handleStoryUnlocks(conqueredNodeId) {}

    unlockUnit(roleName) {
        const unlocked = this.registry.get('unlockedRoles') || [];
        if (!unlocked.includes(roleName)) {
            unlocked.push(roleName);
            this.registry.set('unlockedRoles', unlocked);
            this.uiManager.setStatusText(`🎉 새로운 동료 해금: ${roleName}!`);
            this.cameras.main.flash(500, 255, 255, 0); 
            this.stateManager.saveProgress();
        }
    }

    handleResize(gameSize) {
        this.cameraManager.handleResize();
        this.uiManager.resize(gameSize);
    }

    openDaiso() {
        console.log("Open Daiso Shop");
        // [Modified] 모달 토글 호출
        this.uiManager.toggleDaisoModal();
    }

    toggleBgmMute() {
        if (this.bgm) {
            this.bgm.setMute(!this.bgm.mute);
            return this.bgm.mute;
        }
        return false;
    }

    moveLeaderToken(targetNode, onCompleteCallback) {
        this.input.enabled = false; 
        
        this.tokenManager.moveLeaderToken(targetNode, () => {
            this.registry.set('leaderPosition', targetNode.id);
            this.input.enabled = true;
            this.stateManager.saveProgress();
            if (onCompleteCallback) onCompleteCallback();
        });
    }

    undoMove() {
        this.turnManager.undoMove();
    }

    selectTerritory(circleObj) {
        if (this.isProcessingTurn) return;

        const node = circleObj.nodeData;
        const currentLeaderId = this.registry.get('leaderPosition');
        const currentNode = this.mapManager.getNodeById(currentLeaderId);

        if (this.hasMoved) {
            if (this.previousLeaderId !== null && node.id === this.previousLeaderId) { this.undoMove(); return; }
            this.uiManager.setStatusText("🚫 이미 이동했습니다. [취소]하거나 [턴 종료] 하세요."); this.uiManager.shakeStatusText(); return;
        }
        if (node.id === currentLeaderId) { this.uiManager.setStatusText(`📍 현재 위치: ${node.name}`); return; }
        const isConnected = currentNode.connectedTo.includes(node.id);
        if (!isConnected) { this.uiManager.setStatusText("🚫 너무 멉니다! 연결된 지역(1칸)으로만 이동 가능합니다."); this.shakeNode(circleObj); return; }
        
        if (this.selectionTween) { this.selectionTween.stop(); this.selectionTween = null; }
        this.mapManager.resetNodesVisual();
        
        circleObj.setAlpha(1.0);
        this.selectionTween = this.tweens.add({ targets: circleObj, scale: { from: 1, to: 1.3 }, yoyo: true, repeat: -1, duration: 600 });
        
        this.previousLeaderId = currentLeaderId;
        this.registry.set('lastSafeNodeId', currentLeaderId); 
        
        if (node.owner !== 'player' && node.owner !== 'neutral') { this.selectedTargetId = node.id; } else { this.selectedTargetId = null; }
        
        this.uiManager.setStatusText(`🚶 ${node.name}(으)로 이동 중...`);
        
        this.moveLeaderToken(node, () => {
            this.hasMoved = true; 
            
            // [Modified] 이동 완료 시 스크립트 실행 조건 체크 로그
            console.log(`📍 Arrived at ${node.name} (ID: ${node.id})`);
            console.log(`   - Script exists: ${!!node.script}`);
            console.log(`   - Condition: ${node.script_condition}`);

            // 조건이 'win'이면 여기서 실행하지 않음 (전투 후 실행)
            const isWinCondition = (node.script_condition === 'win');

            if (node.script && !isWinCondition) {
                console.log("   - Playing Script immediately (Reason: No 'win' condition)");
                this.pendingNode = node; 
                this.scene.pause(); 
                this.scene.launch('EventScene', { 
                    mode: 'overlay', 
                    script: node.script, 
                    parentScene: 'StrategyScene' 
                });
            } else {
                if (isWinCondition) console.log("   - Script Deferred (Reason: 'win' condition)");
                this.handleNodeArrival(node);
            }
        });
    }

    handleNodeArrival(node) {
        this.battleCoordinator.handleNodeArrival(node);
    }

    handleNeutralEvent(node) {
        this.battleCoordinator.handleNeutralEvent(node);
    }

    handleEventResult(result, node) {
        this.battleCoordinator.handleEventResult(result, node);
    }

    getCameraTarget(speaker) {
        if (this.tokenManager.leaderObj) {
            return { x: this.tokenManager.leaderObj.x, y: this.tokenManager.leaderObj.y };
        }
        return null;
    }

    shakeNode(target) { this.tweens.add({ targets: target, x: target.x + 5, duration: 50, yoyo: true, repeat: 3 }); this.cameras.main.shake(100, 0.005); }

    handleTurnEnd() {
        this.turnManager.handleTurnEnd();
    }

    startBattle() {
        this.battleCoordinator.startBattle();
    }

    createPlayerToken() {
        let leaderNodeId = this.registry.get('leaderPosition');
        if (leaderNodeId === undefined) {
            const base = this.mapManager.mapNodes.find(n => n.name === "Main Base") || this.mapManager.mapNodes.find(n => n.owner === 'player');
            leaderNodeId = base ? base.id : this.mapManager.mapNodes[0].id;
            this.registry.set('leaderPosition', leaderNodeId);
        }
        const currentNode = this.mapManager.getNodeById(leaderNodeId);
        this.tokenManager.createPlayerToken(currentNode);
    }

    update(time, delta) {
        this.cameraManager.handlePinchZoom();
    }
}