export default class StrategyEnemyAI {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 적군 이동
     */
    moveEnemies(onComplete) {
        const playerPosId = this.scene.registry.get('leaderPosition');
        const enemyNodes = this.scene.mapManager.getNodesByOwner('enemy')
            .filter(n => n.army?.isReinforcement);

        if (enemyNodes.length === 0) {
            if (onComplete) onComplete(0);
            return 0;
        }

        const moves = this.calculateEnemyMoves(enemyNodes, playerPosId);

        if (moves.length === 0) {
            if (onComplete) onComplete(0);
            return 0;
        }

        this.executeEnemyMoves(moves, onComplete);
        return moves.length;
    }

    /**
     * 적군 이동 계산
     */
    calculateEnemyMoves(enemyNodes, playerPosId) {
        const moves = [];

        enemyNodes.forEach(node => {
            const path = this.scene.mapManager.findPath(node.id, playerPosId);
            if (path && path.length > 1) {
                const nextNodeId = path[1];
                const targetNode = this.scene.mapManager.getNodeById(nextNodeId);
                const isBlocked = targetNode.army !== null && targetNode.army !== undefined;

                if (!isBlocked) {
                    moves.push({ fromNode: node, toNode: targetNode });
                }
            }
        });

        return moves;
    }

    /**
     * 적군 이동 실행
     */
    executeEnemyMoves(moves, onComplete) {
        this.scene.tokenManager.moveEnemies(
            moves,
            (move) => {
                // 이동 완료 콜백
                move.toNode.army = move.fromNode.army;
                move.toNode.owner = 'enemy';
                move.fromNode.army = null;

                this.scene.mapManager.setNodeColor(move.toNode.id, 0xff4444);
            },
            () => {
                // 모든 이동 완료 콜백
                if (onComplete) onComplete(moves.length);
            }
        );
    }

    /**
     * 영토 침공 처리
     */
    handleInvasion(turnCount) {
        const reinforceInterval = this.scene.strategySettings?.gameSettings?.reinforcementInterval || 3;

        // 침공 주기가 아니면 종료
        if (turnCount % reinforceInterval !== 0) {
            this.finishInvasionCheck(false, "");
            return;
        }

        const { targetNode, spawnCount } = this.selectInvasionTarget(turnCount);

        if (targetNode) {
            this.executeInvasion(targetNode, spawnCount);
        } else {
            this.finishInvasionCheck(false, "");
        }
    }

    /**
     * 침공 대상 선택
     */
    selectInvasionTarget(turnCount) {
        const playerNodes = this.scene.mapManager.getNodesByOwner('player');

        if (playerNodes.length === 0) {
            return { targetNode: null, spawnCount: 0 };
        }

        // ID가 큰 순서로 정렬
        playerNodes.sort((a, b) => b.id - a.id);

        let targetNode = playerNodes[0];
        const leaderPos = this.scene.registry.get('leaderPosition');

        // 리더가 있는 노드는 건너뛰기
        if (targetNode.id === leaderPos) {
            if (playerNodes.length > 1) {
                targetNode = playerNodes[1];
                console.log(`⚠️ [Invasion] Leader detected at Node ${leaderPos}. Targeting next node: ${targetNode.id}`);
            } else {
                console.log("⚠️ [Invasion] Skipped: Player is defending the only territory.");
                return { targetNode: null, spawnCount: 0 };
            }
        }

        const spawnCount = 5 + Math.floor(turnCount / 10);
        return { targetNode, spawnCount };
    }

    /**
     * 침공 실행
     */
    executeInvasion(targetNode, spawnCount) {
        console.log(`⚠️ [Invasion] Node ${targetNode.id} (${targetNode.name}) taken by Enemy! Spawn: ${spawnCount}`);

        // 영토 점령
        targetNode.owner = 'enemy';
        targetNode.army = {
            type: 'normalDog',
            count: spawnCount,
            isReinforcement: true
        };

        this.scene.registry.set('worldMapData', this.scene.mapManager.mapNodes);

        // 맵 색상 변경
        this.scene.mapManager.setNodeColor(targetNode.id, 0xff4444);

        // 토큰 생성
        const token = this.scene.tokenManager.createSingleEnemyToken(targetNode);
        if (token) {
            this.scene.tokenManager.animateSpawn(token);
        }

        // UI 업데이트
        const warningMsg = `\n⚠️ [경고] 영토 침공! ${targetNode.name}을(를) 뺏겼습니다!`;
        this.scene.cameras.main.flash(500, 255, 0, 0);

        this.finishInvasionCheck(true, warningMsg);
    }

    /**
     * 침공 체크 완료
     */
    finishInvasionCheck(invasionHappened, warningMsg) {
        if (invasionHappened) {
            const currentText = (this.scene.uiManager.statusText?.text) || "";
            this.scene.uiManager.setStatusText(currentText + warningMsg, '#ffaaaa');
        }

        this.scene.isProcessingTurn = false;
        this.scene.uiManager.updateState();
        this.scene.stateManager.saveProgress();
    }
}
