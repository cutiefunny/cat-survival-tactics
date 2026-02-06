export default class StrategyBattleCoordinator {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 전투 결과 처리 및 맵 초기화
     */
    processBattleResult(battleResultData, mapNodes) {
        if (!battleResultData) return { message: null, postBattleScript: null };

        const { targetNodeId, isWin, remainingCoins } = battleResultData;
        
        this.scene.registry.set('playerCoins', remainingCoins);

        let battleResultMessage = null;
        let postBattleScript = null;

        if (isWin) {
            const result = this.handleVictory(targetNodeId, mapNodes);
            battleResultMessage = result.message;
            postBattleScript = result.postBattleScript;
        } else {
            battleResultMessage = this.handleDefeat(mapNodes);
        }

        this.scene.stateManager.saveProgress();
        this.scene.battleResultData = null;

        return { message: battleResultMessage, postBattleScript };
    }

    /**
     * 승리 처리
     */
    handleVictory(targetNodeId, mapNodes) {
        const node = mapNodes.find(n => n.id === targetNodeId);
        let postBattleScript = null;

        if (node) {
            // 승리 시 실행할 스크립트 저장 (condition: 'win')
            if (node.script && node.script_condition === 'win') {
                postBattleScript = node.script;
            }

            // 영토 점령
            node.owner = 'player';
            node.army = null;
            node.script = null; // 초기화 (재실행 방지)

            this.scene.registry.set('worldMapData', mapNodes);
            this.scene.registry.set('leaderPosition', targetNodeId);
            
            this.scene.mapManager.setNodeColor(targetNodeId, 0x4488ff);

            // 스토리 해금 처리
            this.scene.handleStoryUnlocks(targetNodeId);
        }

        return {
            message: "🏆 승리! 영토를 점령했습니다!",
            postBattleScript
        };
    }

    /**
     * 패배 처리
     */
    handleDefeat(mapNodes) {
        const lastSafeId = this.scene.registry.get('lastSafeNodeId');
        
        if (lastSafeId) {
            this.scene.registry.set('leaderPosition', lastSafeId);
            const safeNode = mapNodes.find(n => n.id === lastSafeId);
            const retreatName = safeNode ? safeNode.name : "본부";
            return `🏳️ 패배... ${retreatName}(으)로 후퇴합니다.`;
        } else {
            const base = mapNodes.find(n => n.owner === 'player') || mapNodes[0];
            if (base) {
                this.scene.registry.set('leaderPosition', base.id);
            }
            return "🏳️ 패배... 본부로 후퇴합니다.";
        }
    }

    /**
     * 전투 시작
     */
    startBattle() {
        const targetNode = this.scene.mapManager.getNodeById(this.scene.selectedTargetId);
        if (!targetNode) return;

        const selectedLevelIndex = targetNode.levelIndex || 0;
        const currentCoins = this.scene.registry.get('playerCoins') ?? 0;

        const battleData = {
            isStrategyMode: true,
            targetNodeId: this.scene.selectedTargetId,
            levelIndex: selectedLevelIndex,
            currentCoins: currentCoins,
            armyConfig: targetNode.army || null,
            bgmKey: targetNode.bgm
        };

        this.scene.scene.start('LoadingScene', {
            targetScene: 'BattleScene',
            targetData: battleData
        });
    }

    /**
     * 노드 도착 시 처리
     */
    handleNodeArrival(node) {
        // 중립 노드 처리
        if (node.owner === 'neutral') {
            this.handleNeutralEvent(node);
            return;
        }

        // 적군 수 계산
        let enemyCount = 0;
        if (node.army) {
            if (Array.isArray(node.army)) {
                enemyCount = node.army.reduce((sum, u) => sum + (u.count || 1), 0);
            } else {
                enemyCount = node.army.count || 1;
            }
        }

        // 빈 적 영토 자동 점령
        if (node.owner !== 'player' && enemyCount <= 0) {
            this.captureEmptyTerritory(node);
            return;
        }

        // 전투 메시지 표시
        if (this.scene.selectedTargetId) {
            const infoText = enemyCount > 0 ? ` (적군: ${enemyCount}마리)` : "";
            const battleMsg = `⚔️ ${node.name} 진입!${infoText} 전투하려면 [전투 시작]`;
            const finalMsg = node.text ? `${node.text}\n${battleMsg}` : battleMsg;
            this.scene.uiManager.setStatusText(finalMsg);
        } else {
            this.scene.uiManager.setStatusText(`✅ ${node.name} 도착. (취소 가능)`);
        }

        this.scene.uiManager.updateState();
    }

    /**
     * 빈 영토 점령
     */
    captureEmptyTerritory(node) {
        console.log(`🚩 [StrategyScene] 빈 영토 자동 점령: ${node.name}`);

        node.owner = 'player';
        node.army = null;
        
        this.scene.selectedTargetId = null;

        this.scene.registry.set('worldMapData', this.scene.mapManager.mapNodes);
        this.scene.stateManager.saveProgress();

        this.scene.mapManager.setNodeColor(node.id, 0x4488ff);

        this.scene.uiManager.setStatusText(`🚩 ${node.name} 무혈 입성! 적군 없이 점령했습니다.`);
        this.scene.uiManager.updateState();
    }

    /**
     * 중립 이벤트 처리
     */
    handleNeutralEvent(node) {
        const unlockedUnits = [];

        // 유닛 해금 처리
        if (node.script && Array.isArray(node.script)) {
            const unlockCommand = node.script.find(cmd => cmd.type === 'unlock_unit');

            if (unlockCommand && Array.isArray(unlockCommand.unit)) {
                console.log(`🎁 [StrategyScene] 유닛 해금 이벤트 발생:`, unlockCommand.unit);

                unlockCommand.unit.forEach(roleName => {
                    this.scene.unlockUnit(roleName);
                    unlockedUnits.push(roleName);
                });
            }
        }

        // 영토 점령
        node.owner = 'player';
        node.script = null;
        node.army = null;

        this.scene.registry.set('worldMapData', this.scene.mapManager.mapNodes);

        // 토큰 제거
        const token = this.scene.tokenManager.getTokenAt(node.x, node.y);
        if (token) {
            token.destroy();
            this.scene.tokenManager.enemyTokens = this.scene.tokenManager.enemyTokens.filter(t => t !== token);
        }

        this.scene.mapManager.setNodeColor(node.id, 0x4488ff);

        this.scene.stateManager.saveProgress();
        this.scene.uiManager.updateState();
        this.scene.input.enabled = true;
    }

    /**
     * 이벤트 결과 처리
     */
    handleEventResult(result, node) {
        if (result === 'recruit') {
            if (node.army) {
                const firstUnit = Array.isArray(node.army) ? node.army[0] : node.army;
                if (firstUnit?.type) {
                    const roleName = firstUnit.type.charAt(0).toUpperCase() + firstUnit.type.slice(1);
                    this.scene.unlockUnit(roleName);
                    this.scene.uiManager.setStatusText(`🤝 ${roleName} 영입 성공!`);
                    
                    node.owner = 'player';
                    node.script = null;

                    const token = this.scene.tokenManager.getTokenAt(node.x, node.y);
                    if (token) token.destroy();

                    this.scene.registry.set('worldMapData', this.scene.mapManager.mapNodes);
                    this.scene.stateManager.saveProgress();

                    this.scene.mapManager.setNodeColor(node.id, 0x4488ff);
                }
            }
        } else {
            this.scene.uiManager.setStatusText(`✅ ${node.name}에서 잠시 휴식을 취했습니다.`);
        }

        this.scene.uiManager.updateState();
        this.scene.input.enabled = true;
    }
}
