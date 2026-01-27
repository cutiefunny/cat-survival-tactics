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
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { ROLE_BASE_STATS, UNIT_COSTS } from '../data/UnitData'; 

import SaveManager from '../managers/SaveManager';
import StrategyUIManager from '../managers/StrategyUIManager'; 
import StrategyMapManager from '../managers/StrategyMapManager'; 
import StrategyTokenManager from '../managers/StrategyTokenManager'; 

export default class StrategyScene extends BaseScene {
    constructor() {
        super('StrategyScene'); 
    }

    init(data) {
        this.isManualLoad = false;
        this.isProcessingTurn = false;

        if (data && data.battleResult) {
            this.battleResultData = data.battleResult;
        }

        if (data && data.manualLoadData) {
            console.log("📂 [StrategyScene] Manual Load Data Applied", data.manualLoadData);
            const loadData = data.manualLoadData;

            this.registry.set('playerInventory', loadData.playerInventory || {});
            
            this.isManualLoad = true;

            const keysToReset = ['playerCoins', 'playerSquad', 'unlockedRoles', 'worldMapData', 'leaderPosition', 'turnCount', 'lastSafeNodeId'];
            keysToReset.forEach(key => this.registry.remove(key));

            this.registry.set('playerCoins', loadData.playerCoins);
            this.registry.set('playerSquad', loadData.playerSquad);
            this.registry.set('unlockedRoles', loadData.unlockedRoles);
            this.registry.set('worldMapData', loadData.worldMapData);
            this.registry.set('leaderPosition', loadData.leaderPosition);
            this.registry.set('turnCount', loadData.turnCount || 1);
            this.registry.set('lastSafeNodeId', loadData.lastSafeNodeId);
            
            this.battleResultData = null;
        }

        if (!this.isManualLoad) {
            const savedData = SaveManager.loadGame();

            if (savedData) {
                if (this.registry.get('playerCoins') === undefined) {
                    this.registry.set('playerCoins', savedData.playerCoins ?? 10);
                }
                if (!this.registry.get('playerSquad')) {
                    this.registry.set('playerSquad', savedData.playerSquad || [{ role: 'Leader', level: 1, xp: 0 }]);
                }
                if (!this.registry.get('unlockedRoles')) {
                    this.registry.set('unlockedRoles', savedData.unlockedRoles || ['Normal']);
                }
                if (!this.registry.get('worldMapData') && savedData.worldMapData) {
                    this.registry.set('worldMapData', savedData.worldMapData);
                }
                if (this.registry.get('leaderPosition') === undefined && savedData.leaderPosition) {
                    this.registry.set('leaderPosition', savedData.leaderPosition);
                }
                if (this.registry.get('turnCount') === undefined) {
                    this.registry.set('turnCount', savedData.turnCount ?? 1);
                }
                if (!this.registry.get('playerInventory')) {
                    this.registry.set('playerInventory', savedData.playerInventory || {});
                }
            }
        }

        if (this.registry.get('playerInventory') === undefined) {
            this.registry.set('playerInventory', {});
        }

        const hasRegistryData = this.registry.get('playerCoins') !== undefined;
        this.isNewGame = !this.isManualLoad && !hasRegistryData; 
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

        this.load.audio('opening_bgm', openingBgm);
    }

    create() {
        super.create(); 

        this.uiManager = new StrategyUIManager(this);
        this.mapManager = new StrategyMapManager(this); 
        this.tokenManager = new StrategyTokenManager(this);

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

    getCurrentGameData() {
        return {
            playerCoins: this.registry.get('playerCoins'),
            playerSquad: this.registry.get('playerSquad'),
            playerInventory: this.registry.get('playerInventory'),
            unlockedRoles: this.registry.get('unlockedRoles'),
            worldMapData: this.registry.get('worldMapData'),
            leaderPosition: this.registry.get('leaderPosition'),
            lastSafeNodeId: this.registry.get('lastSafeNodeId'),
            turnCount: this.registry.get('turnCount')
        };
    }

    saveProgress() {
        const data = this.getCurrentGameData();
        SaveManager.saveGame(data);
        console.log("💾 [StrategyScene] Progress Saved (Auto)");
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
        
        if (!this.isManualLoad) {
            const initialCoins = this.strategySettings?.gameSettings?.initialCoins ?? 50; 
            
            if (this.registry.get('playerCoins') === undefined) {
                 this.registry.set('playerCoins', initialCoins);
            }
            
            if (!this.registry.get('playerSquad')) {
                 this.registry.set('playerSquad', [{ role: 'Leader', level: 1, xp: 0 }]);
            }
            
            if (!this.registry.get('unlockedRoles')) {
                 this.registry.set('unlockedRoles', ['Normal']);
            }
            
            if (this.registry.get('turnCount') === undefined) {
                 this.registry.set('turnCount', 1);
            }

            if (!this.registry.get('playerInventory')) {
                this.registry.set('playerInventory', {});
            }
        }

        this.initializeGameWorld(map, armyData);
    }

    initializeGameWorld(map, dbArmyData) {
        this.hasMoved = false;
        this.previousLeaderId = null;
        this.selectedTargetId = null; 
        
        this.playBgm('opening_bgm', 0.5);

        this.mapManager.initialize(map, dbArmyData);
        const mapNodes = this.mapManager.mapNodes;

        let battleResultMessage = null;
        if (this.battleResultData) {
            const { targetNodeId, isWin, remainingCoins } = this.battleResultData;
            
            this.registry.set('playerCoins', remainingCoins);

            if (isWin) {
                const node = mapNodes.find(n => n.id === targetNodeId);
                if (node) {
                    node.owner = 'player';
                    node.army = null; 
                    node.script = null; 
                    this.registry.set('worldMapData', mapNodes);
                    this.registry.set('leaderPosition', targetNodeId);
                    
                    this.mapManager.setNodeColor(targetNodeId, 0x4488ff);
                }
                battleResultMessage = "🏆 승리! 영토를 점령했습니다!";
                this.handleStoryUnlocks(targetNodeId);
            } else {
                const lastSafeId = this.registry.get('lastSafeNodeId');
                if (lastSafeId) {
                    this.registry.set('leaderPosition', lastSafeId);
                    const safeNode = mapNodes.find(n => n.id === lastSafeId);
                    const retreatName = safeNode ? safeNode.name : "본부";
                    battleResultMessage = `🏳️ 패배... ${retreatName}(으)로 후퇴합니다.`;
                } else {
                    const base = mapNodes.find(n => n.owner === 'player') || mapNodes[0];
                    if (base) this.registry.set('leaderPosition', base.id);
                    battleResultMessage = "🏳️ 패배... 본부로 후퇴합니다.";
                }
            }
            
            this.saveProgress();
            this.battleResultData = null;
        }

        this.tokenManager.createEnemyTokens(mapNodes);
        this.createPlayerToken(); 

        this.uiManager.createUI();
        
        if (battleResultMessage) {
            this.uiManager.setStatusText(battleResultMessage);
        }
        
        this.uiManager.updateState();

        this.updateCameraLayout();
        this.setupCameraControls();
        this.prevPinchDistance = 0;
    }

    handleStoryUnlocks(conqueredNodeId) {}

    unlockUnit(roleName) {
        const unlocked = this.registry.get('unlockedRoles') || [];
        if (!unlocked.includes(roleName)) {
            unlocked.push(roleName);
            this.registry.set('unlockedRoles', unlocked);
            this.uiManager.setStatusText(`🎉 새로운 동료 해금: ${roleName}!`);
            this.cameras.main.flash(500, 255, 255, 0); 
            this.saveProgress();
        }
    }

    handleResize(gameSize) {
        this.updateCameraLayout();
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
            this.saveProgress();
            if (onCompleteCallback) onCompleteCallback();
        });
    }

    undoMove() {
        if (!this.hasMoved || this.previousLeaderId === null) return;
        const prevNode = this.mapManager.getNodeById(this.previousLeaderId);
        if (!prevNode) return;
        this.uiManager.setStatusText("↩️ 원래 위치로 복귀 중...");
        this.moveLeaderToken(prevNode, () => {
            this.hasMoved = false; this.previousLeaderId = null; this.selectedTargetId = null; 
            this.uiManager.setStatusText(`📍 복귀 완료: ${prevNode.name}`);
            this.uiManager.updateState();
            if (this.selectionTween) { this.selectionTween.stop(); this.selectionTween = null; }
            this.mapManager.resetNodesVisual(); 
        });
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
            
            if (node.script) {
                this.pendingNode = node; 
                this.scene.pause(); 
                this.scene.launch('EventScene', { 
                    mode: 'overlay', 
                    script: node.script, 
                    parentScene: 'StrategyScene' 
                });
            } else {
                this.handleNodeArrival(node);
            }
        });
    }

    handleNodeArrival(node) {
        if (node.owner === 'neutral') {
            this.handleNeutralEvent(node);
            return; 
        }

        let enemyCount = 0;
        if (node.army) {
            if (Array.isArray(node.army)) {
                enemyCount = node.army.reduce((sum, u) => sum + (u.count || 1), 0);
            } else {
                enemyCount = node.army.count || 1;
            }
        }

        if (node.owner !== 'player' && enemyCount <= 0) {
            console.log(`🚩 [StrategyScene] 빈 영토 자동 점령: ${node.name}`);

            node.owner = 'player';
            node.army = null;
            
            this.selectedTargetId = null;

            this.registry.set('worldMapData', this.mapManager.mapNodes);
            this.saveProgress();

            this.mapManager.setNodeColor(node.id, 0x4488ff);

            this.uiManager.setStatusText(`🚩 ${node.name} 무혈 입성! 적군 없이 점령했습니다.`);
            this.uiManager.updateState();
            return;
        }

        if (this.selectedTargetId) {
            let infoText = ""; 
            if (enemyCount > 0) {
                infoText = ` (적군: ${enemyCount}마리)`;
            }
            const battleMsg = `⚔️ ${node.name} 진입!${infoText} 전투하려면 [전투 시작]`;
            const finalMsg = node.text ? `${node.text}\n${battleMsg}` : battleMsg;
            this.uiManager.setStatusText(finalMsg);
        } else { 
            this.uiManager.setStatusText(`✅ ${node.name} 도착. (취소 가능)`); 
        }
        
        this.uiManager.updateState();
    }

    handleNeutralEvent(node) {
        let unlockedUnits = [];

        if (node.script && Array.isArray(node.script)) {
            const unlockCommand = node.script.find(cmd => cmd.type === 'unlock_unit');

            if (unlockCommand && Array.isArray(unlockCommand.unit)) {
                console.log(`🎁 [StrategyScene] 유닛 해금 이벤트 발생:`, unlockCommand.unit);

                unlockCommand.unit.forEach(roleName => {
                    this.unlockUnit(roleName); 
                    unlockedUnits.push(roleName);
                });
            }
        }

        node.owner = 'player';
        node.script = null; 
        node.army = null;   

        this.registry.set('worldMapData', this.mapManager.mapNodes);
        
        const token = this.tokenManager.getTokenAt(node.x, node.y);
        if (token) {
            token.destroy();
            this.tokenManager.enemyTokens = this.tokenManager.enemyTokens.filter(t => t !== token);
        }

        this.mapManager.setNodeColor(node.id, 0x4488ff);

        this.saveProgress();
        this.uiManager.updateState();
        this.input.enabled = true;
    }

    handleEventResult(result, node) {
        if (result === 'recruit') {
            if (node.army) {
                let firstUnit = Array.isArray(node.army) ? node.army[0] : node.army;
                if (firstUnit && firstUnit.type) {
                    const roleName = firstUnit.type.charAt(0).toUpperCase() + firstUnit.type.slice(1);
                    this.unlockUnit(roleName);
                    this.uiManager.setStatusText(`🤝 ${roleName} 영입 성공!`);
                    node.owner = 'player';
                    node.script = null; 
                    
                    const token = this.tokenManager.getTokenAt(node.x, node.y);
                    if (token) token.destroy();
                    
                    this.registry.set('worldMapData', this.mapManager.mapNodes);
                    this.saveProgress();
                    
                    this.mapManager.setNodeColor(node.id, 0x4488ff);
                }
            }
        } else {
            this.uiManager.setStatusText(`✅ ${node.name}에서 잠시 휴식을 취했습니다.`);
        }
        
        this.uiManager.updateState();
        this.input.enabled = true;
    }

    getCameraTarget(speaker) {
        if (this.tokenManager.leaderObj) {
            return { x: this.tokenManager.leaderObj.x, y: this.tokenManager.leaderObj.y };
        }
        return null;
    }

    shakeNode(target) { this.tweens.add({ targets: target, x: target.x + 5, duration: 50, yoyo: true, repeat: 3 }); this.cameras.main.shake(100, 0.005); }

    moveEnemies(onComplete) {
        const playerPosId = this.registry.get('leaderPosition');
        const enemyNodes = this.mapManager.getNodesByOwner('enemy')
            .filter(n => n.army && n.army.isReinforcement);

        if (enemyNodes.length === 0) {
            if (onComplete) onComplete(0);
            return 0;
        }

        const moves = [];

        enemyNodes.forEach(node => {
            const path = this.mapManager.findPath(node.id, playerPosId);
            if (path && path.length > 1) {
                const nextNodeId = path[1];
                const targetNode = this.mapManager.getNodeById(nextNodeId);
                const isBlocked = targetNode.army !== null && targetNode.army !== undefined;
                
                if (!isBlocked) {
                    moves.push({ fromNode: node, toNode: targetNode });
                }
            }
        });

        if (moves.length === 0) {
            if (onComplete) onComplete(0);
            return 0;
        }

        this.tokenManager.moveEnemies(
            moves, 
            (move) => {
                move.toNode.army = move.fromNode.army;
                move.toNode.owner = 'enemy';
                move.fromNode.army = null;
                
                this.mapManager.setNodeColor(move.toNode.id, 0xff4444);
            },
            () => {
                if (onComplete) onComplete(moves.length);
            }
        );
        
        return moves.length;
    }

    handleTurnEnd() {
        if (this.isProcessingTurn) return;
        this.isProcessingTurn = true; 

        const squad = this.registry.get('playerSquad') || [];
        const recoveryAmount = this.hasMoved ? 1 : 3;
        
        let recoveredCount = 0;
        let totalMaintenanceCost = 0;

        const registryRoleDefs = this.registry.get('roleDefinitions') || {};
        const roleDefs = { ...ROLE_BASE_STATS, ...registryRoleDefs };

        squad.forEach(unit => {
            if (unit.fatigue > 0) {
                unit.fatigue = Math.max(0, unit.fatigue - recoveryAmount);
                recoveredCount++;
            }
            let maintenance = 0;
            if (roleDefs[unit.role] && roleDefs[unit.role].maintenance !== undefined) {
                maintenance = roleDefs[unit.role].maintenance;
            } else {
                if (unit.role === 'Leader') maintenance = 3;
                else {
                    const shopInfo = UNIT_COSTS.find(u => u.role === unit.role);
                    const baseCost = shopInfo ? shopInfo.cost : 100;
                    maintenance = Math.floor(baseCost * 0.2);
                }
            }
            totalMaintenanceCost += maintenance;
        });
        
        const mapNodes = this.mapManager.mapNodes;
        const ownedTerritories = mapNodes ? mapNodes.filter(n => n.owner === 'player').length : 0;
        const incomePerTerritory = this.strategySettings?.gameSettings?.territoryIncome ?? 2;
        const totalIncome = ownedTerritories * incomePerTerritory;

        let currentCoins = this.registry.get('playerCoins');
        let isBankrupt = false;
        
        currentCoins = currentCoins + totalIncome - totalMaintenanceCost;
        
        console.log(`💰 [Turn End] Income: +${totalIncome} (Terr: ${ownedTerritories}), Cost: -${totalMaintenanceCost}, Result: ${currentCoins}`);

        if (currentCoins < 0) {
            isBankrupt = true;
            currentCoins = 0;
            const leaderOnly = squad.filter(u => u.role === 'Leader');
            this.registry.set('playerSquad', leaderOnly);
            console.warn("⚠️ [Bankruptcy] Mercenaries dismissed.");
        } else {
            this.registry.set('playerSquad', squad);
        }

        this.registry.set('playerCoins', currentCoins);
        this.uiManager.updateCoinText(currentCoins);

        this.hasMoved = false; 
        this.previousLeaderId = null; 
        this.selectedTargetId = null; 
        
        if (this.selectionTween) { 
            this.selectionTween.stop(); 
            this.selectionTween = null; 
        }
        
        this.mapManager.resetNodesVisual();

        let turnCount = this.registry.get('turnCount') || 0;
        turnCount++;
        this.registry.set('turnCount', turnCount);

        if (isBankrupt) {
            this.uiManager.setStatusText(`💸 급식비 부족! 용병들이 모두 떠났습니다...`, '#ff4444');
        } else {
            const incomeMsg = totalIncome > 0 ? ` (+${totalIncome})` : "";
            const maintenanceMsg = totalMaintenanceCost > 0 ? ` (-${totalMaintenanceCost})` : "";
            this.uiManager.setStatusText(`🌙 턴 종료${incomeMsg}${maintenanceMsg}`, '#ffffff');
            
            if (totalIncome > 0) {
                this.uiManager.showFloatingText(this.scale.width / 2, this.scale.height / 2 - 80, `+${totalIncome}냥 (영토)`, '#44ff44');
            }
            if (totalMaintenanceCost > 0) {
                this.uiManager.showFloatingText(this.scale.width / 2, this.scale.height / 2, `-${totalMaintenanceCost}냥 (유지비)`, '#ff4444');
            }
        }
        this.saveProgress();

        this.moveEnemies((movedCount) => {
             if (movedCount > 0) {
                 this.registry.set('worldMapData', this.mapManager.mapNodes);
                 this.tokenManager.createEnemyTokens(this.mapManager.mapNodes); 
                 
                 const currentText = (this.uiManager.statusText && this.uiManager.statusText.text) ? this.uiManager.statusText.text : "";
                 this.uiManager.setStatusText(currentText + `\n⚔️ 적군 ${movedCount}부대가 이동했습니다!`, '#ffaaaa');

                 const leaderPos = this.registry.get('leaderPosition');
                 const playerNode = this.mapManager.getNodeById(leaderPos);
                 
                 if (playerNode && playerNode.owner === 'enemy') {
                     console.log("⚔️ Enemy caught the player! Starting Battle...");
                     this.selectedTargetId = leaderPos;
                     
                     this.cameras.main.flash(500, 255, 0, 0);
                     this.time.delayedCall(500, () => {
                         this.startBattle();
                     });
                     return; 
                 }
                 
                 this.time.delayedCall(1000, () => {
                     this.handleInvasion(turnCount);
                 });
             } else {
                 this.handleInvasion(turnCount);
             }
        });
    }

    handleInvasion(turnCount) {
        const reinforceInterval = this.strategySettings?.gameSettings?.reinforcementInterval || 3;
        let invasionHappened = false;
        let warningMsg = "";

        if (turnCount % reinforceInterval === 0) {
            const playerNodes = this.mapManager.getNodesByOwner('player');
            
            if (playerNodes.length > 0) {
                playerNodes.sort((a, b) => b.id - a.id);
                
                let targetNode = playerNodes[0];
                const leaderPos = this.registry.get('leaderPosition');

                if (targetNode.id === leaderPos) {
                    if (playerNodes.length > 1) {
                        targetNode = playerNodes[1];
                        console.log(`⚠️ [Invasion] Leader detected at Node ${leaderPos}. Targeting next node: ${targetNode.id}`);
                    } else {
                        targetNode = null;
                        console.log("⚠️ [Invasion] Skipped: Player is defending the only territory.");
                    }
                }

                if (targetNode) {
                    const spawnCount = 5 + Math.floor(turnCount / 10);
                    console.log(`⚠️ [Invasion] Node ${targetNode.id} (${targetNode.name}) taken by Enemy! Spawn: ${spawnCount}`);

                    targetNode.owner = 'enemy';
                    targetNode.army = { type: 'normalDog', count: spawnCount, isReinforcement: true };

                    this.registry.set('worldMapData', this.mapManager.mapNodes);

                    this.mapManager.setNodeColor(targetNode.id, 0xff4444);

                    const token = this.tokenManager.createSingleEnemyToken(targetNode);
                    if (token) {
                        this.tokenManager.animateSpawn(token);
                    }

                    warningMsg = `\n⚠️ [경고] 영토 침공! ${targetNode.name}을(를) 뺏겼습니다!`;
                    this.cameras.main.flash(500, 255, 0, 0); 
                    
                    invasionHappened = true;
                }
            }
        }

        if (invasionHappened) {
            const currentText = (this.uiManager.statusText && this.uiManager.statusText.text) ? this.uiManager.statusText.text : "";
            this.uiManager.setStatusText(currentText + warningMsg, '#ffaaaa');
        }

        this.isProcessingTurn = false;
        this.uiManager.updateState();
        this.saveProgress();
    }

    startBattle() {
        const targetNode = this.mapManager.getNodeById(this.selectedTargetId);
        if (!targetNode) return;
        const selectedLevelIndex = targetNode ? (targetNode.levelIndex || 0) : 0;
        
        const currentCoins = this.registry.get('playerCoins') ?? 0;

        const battleData = {
            isStrategyMode: true, 
            targetNodeId: this.selectedTargetId, 
            levelIndex: selectedLevelIndex,
            currentCoins: currentCoins, 
            armyConfig: targetNode.army || null, 
            bgmKey: targetNode.bgm 
        };

        this.scene.start('LoadingScene', {
            targetScene: 'BattleScene',
            targetData: battleData
        });
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
        if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
            const distance = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
            if (this.prevPinchDistance > 0) {
                const distanceDiff = (distance - this.prevPinchDistance) * 0.005; 
                const newZoom = this.cameras.main.zoom + distanceDiff;
                const clampedZoom = Phaser.Math.Clamp(newZoom, this.minZoom, 3);
                this.cameras.main.setZoom(clampedZoom);
                this.updateCameraLayout(); 
            }
            this.prevPinchDistance = distance;
        } else { this.prevPinchDistance = 0; }
    }

    updateCameraLayout() {
        const screenWidth = this.scale.width; const screenHeight = this.scale.height;
        const isPC = this.sys.game.device.os.desktop;
        const mapWidth = this.mapManager.mapWidth || 1024;
        const mapHeight = this.mapManager.mapHeight || 1024;

        const zoomFitWidth = screenWidth / mapWidth; const zoomFitHeight = screenHeight / mapHeight;
        this.minZoom = isPC ? zoomFitHeight : zoomFitWidth;
        if (this.cameras.main.zoom < this.minZoom || this.cameras.main.zoom === 1) { this.cameras.main.setZoom(this.minZoom); }
        const currentZoom = this.cameras.main.zoom;
        const displayWidth = screenWidth / currentZoom; const displayHeight = screenHeight / currentZoom;
        const offsetX = Math.max(0, (displayWidth - mapWidth) / 2);
        const offsetY = Math.max(0, (displayHeight - mapHeight) / 2);
        this.cameras.main.setBounds(-offsetX, -offsetY, Math.max(mapWidth, displayWidth), Math.max(mapHeight, displayHeight));
    }

    setupCameraControls() {
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            const newZoom = this.cameras.main.zoom - deltaY * 0.001;
            const clampedZoom = Phaser.Math.Clamp(newZoom, this.minZoom, 3);
            this.cameras.main.setZoom(clampedZoom);
            this.updateCameraLayout(); 
        });
        this.input.on('pointermove', (pointer) => {
            if (this.input.pointer1.isDown && this.input.pointer2.isDown) return;
            if (pointer.isDown) {
                this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
                this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
            }
        });
    }
}