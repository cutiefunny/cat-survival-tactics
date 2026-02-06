import { ROLE_BASE_STATS, UNIT_COSTS } from '../data/UnitData';

export default class StrategyTurnManager {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 턴 종료 처리
     */
    handleTurnEnd() {
        if (this.scene.isProcessingTurn) return;
        this.scene.isProcessingTurn = true;

        // 피로도 회복 및 유지비 계산
        const { recoveredCount, totalMaintenanceCost, squad } = this.processSquadMaintenance();

        // 영토 수입 계산
        const { ownedTerritories, totalIncome } = this.calculateTerritoryIncome();

        // 코인 업데이트
        const { currentCoins, isBankrupt } = this.updateCoins(totalIncome, totalMaintenanceCost, squad);

        // 이동 상태 초기화
        this.resetMoveState();

        // 턴 카운트 증가
        const turnCount = this.incrementTurnCount();

        // UI 업데이트
        this.updateTurnEndUI(isBankrupt, totalIncome, totalMaintenanceCost);

        // 저장
        this.scene.stateManager.saveProgress();

        // 적군 이동 및 침공 처리
        this.scene.enemyAI.moveEnemies((movedCount) => {
            if (movedCount > 0) {
                this.handleEnemyMovementResult(movedCount, turnCount);
            } else {
                this.scene.enemyAI.handleInvasion(turnCount);
            }
        });
    }

    /**
     * 스쿼드 유지비 및 피로도 처리
     */
    processSquadMaintenance() {
        const squad = this.scene.registry.get('playerSquad') || [];
        const recoveryAmount = this.scene.hasMoved ? 1 : 3;

        let recoveredCount = 0;
        let totalMaintenanceCost = 0;

        const registryRoleDefs = this.scene.registry.get('roleDefinitions') || {};
        const roleDefs = { ...ROLE_BASE_STATS, ...registryRoleDefs };

        squad.forEach(unit => {
            // 피로도 회복
            if (unit.fatigue > 0) {
                unit.fatigue = Math.max(0, unit.fatigue - recoveryAmount);
                recoveredCount++;
            }

            // 유지비 계산
            let maintenance = 0;
            if (roleDefs[unit.role]?.maintenance !== undefined) {
                maintenance = roleDefs[unit.role].maintenance;
            } else {
                if (unit.role === 'Leader') {
                    maintenance = 3;
                } else {
                    const shopInfo = UNIT_COSTS.find(u => u.role === unit.role);
                    const baseCost = shopInfo ? shopInfo.cost : 100;
                    maintenance = Math.floor(baseCost * 0.2);
                }
            }
            totalMaintenanceCost += maintenance;
        });

        return { recoveredCount, totalMaintenanceCost, squad };
    }

    /**
     * 영토 수입 계산
     */
    calculateTerritoryIncome() {
        const mapNodes = this.scene.mapManager.mapNodes;
        const ownedTerritories = mapNodes ? mapNodes.filter(n => n.owner === 'player').length : 0;
        const incomePerTerritory = this.scene.strategySettings?.gameSettings?.territoryIncome ?? 2;
        const totalIncome = ownedTerritories * incomePerTerritory;

        return { ownedTerritories, totalIncome };
    }

    /**
     * 코인 업데이트 및 파산 처리
     */
    updateCoins(totalIncome, totalMaintenanceCost, squad) {
        let currentCoins = this.scene.registry.get('playerCoins');
        currentCoins = currentCoins + totalIncome - totalMaintenanceCost;

        console.log(`💰 [Turn End] Income: +${totalIncome}, Cost: -${totalMaintenanceCost}, Result: ${currentCoins}`);

        let isBankrupt = false;

        if (currentCoins < 0) {
            isBankrupt = true;
            currentCoins = 0;
            const leaderOnly = squad.filter(u => u.role === 'Leader');
            this.scene.registry.set('playerSquad', leaderOnly);
            console.warn("⚠️ [Bankruptcy] Mercenaries dismissed.");
        } else {
            this.scene.registry.set('playerSquad', squad);
        }

        this.scene.registry.set('playerCoins', currentCoins);
        this.scene.uiManager.updateCoinText(currentCoins);

        return { currentCoins, isBankrupt };
    }

    /**
     * 이동 상태 초기화
     */
    resetMoveState() {
        this.scene.hasMoved = false;
        this.scene.previousLeaderId = null;
        this.scene.selectedTargetId = null;

        if (this.scene.selectionTween) {
            this.scene.selectionTween.stop();
            this.scene.selectionTween = null;
        }

        this.scene.mapManager.resetNodesVisual();
    }

    /**
     * 턴 카운트 증가
     */
    incrementTurnCount() {
        let turnCount = this.scene.registry.get('turnCount') || 0;
        turnCount++;
        this.scene.registry.set('turnCount', turnCount);
        return turnCount;
    }

    /**
     * 턴 종료 UI 업데이트
     */
    updateTurnEndUI(isBankrupt, totalIncome, totalMaintenanceCost) {
        if (isBankrupt) {
            this.scene.uiManager.setStatusText(`💸 급식비 부족! 용병들이 모두 떠났습니다...`, '#ff4444');
        } else {
            const incomeMsg = totalIncome > 0 ? ` (+${totalIncome})` : "";
            const maintenanceMsg = totalMaintenanceCost > 0 ? ` (-${totalMaintenanceCost})` : "";
            this.scene.uiManager.setStatusText(`🌙 턴 종료${incomeMsg}${maintenanceMsg}`, '#ffffff');

            if (totalIncome > 0) {
                this.scene.uiManager.showFloatingText(
                    this.scene.scale.width / 2,
                    this.scene.scale.height / 2 - 80,
                    `+${totalIncome}냥 (영토)`,
                    '#44ff44'
                );
            }
            if (totalMaintenanceCost > 0) {
                this.scene.uiManager.showFloatingText(
                    this.scene.scale.width / 2,
                    this.scene.scale.height / 2,
                    `-${totalMaintenanceCost}냥 (유지비)`,
                    '#ff4444'
                );
            }
        }
    }

    /**
     * 적군 이동 결과 처리
     */
    handleEnemyMovementResult(movedCount, turnCount) {
        this.scene.registry.set('worldMapData', this.scene.mapManager.mapNodes);
        this.scene.tokenManager.createEnemyTokens(this.scene.mapManager.mapNodes);

        const currentText = (this.scene.uiManager.statusText?.text) || "";
        this.scene.uiManager.setStatusText(
            currentText + `\n⚔️ 적군 ${movedCount}부대가 이동했습니다!`,
            '#ffaaaa'
        );

        // 플레이어가 적에게 잡혔는지 확인
        const leaderPos = this.scene.registry.get('leaderPosition');
        const playerNode = this.scene.mapManager.getNodeById(leaderPos);

        if (playerNode?.owner === 'enemy') {
            console.log("⚔️ Enemy caught the player! Starting Battle...");
            this.scene.selectedTargetId = leaderPos;

            this.scene.cameras.main.flash(500, 255, 0, 0);
            this.scene.time.delayedCall(500, () => {
                this.scene.battleCoordinator.startBattle();
            });
            return;
        }

        // 침공 처리
        this.scene.time.delayedCall(1000, () => {
            this.scene.enemyAI.handleInvasion(turnCount);
        });
    }

    /**
     * 이동 취소
     */
    undoMove() {
        if (!this.scene.hasMoved || this.scene.previousLeaderId === null) return;

        const prevNode = this.scene.mapManager.getNodeById(this.scene.previousLeaderId);
        if (!prevNode) return;

        this.scene.uiManager.setStatusText("↩️ 원래 위치로 복귀 중...");

        this.scene.moveLeaderToken(prevNode, () => {
            this.scene.hasMoved = false;
            this.scene.previousLeaderId = null;
            this.scene.selectedTargetId = null;

            this.scene.uiManager.setStatusText(`📍 복귀 완료: ${prevNode.name}`);
            this.scene.uiManager.updateState();

            if (this.scene.selectionTween) {
                this.scene.selectionTween.stop();
                this.scene.selectionTween = null;
            }

            this.scene.mapManager.resetNodesVisual();
        });
    }
}
