import SaveManager from './SaveManager';

export default class StrategyStateManager {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 초기 데이터 로드 및 Registry 설정
     */
    initializeState(data) {
        this.scene.isManualLoad = false;
        this.scene.isProcessingTurn = false;

        // 전투 결과 데이터 처리
        if (data?.battleResult) {
            this.scene.battleResultData = data.battleResult;
        }

        // 수동 로드 데이터 처리
        if (data?.manualLoadData) {
            this.handleManualLoad(data.manualLoadData);
            return;
        }

        // 자동 저장 데이터 로드 (battleResult가 있어도 로드해야 함)
        if (!this.scene.isManualLoad) {
            this.loadSavedGame();
        }

        // 기본 인벤토리 설정
        if (this.scene.registry.get('playerInventory') === undefined) {
            this.scene.registry.set('playerInventory', {});
        }

        // 새 게임 여부 판단
        const hasRegistryData = this.scene.registry.get('playerCoins') !== undefined;
        this.scene.isNewGame = !this.scene.isManualLoad && !hasRegistryData;
    }

    /**
     * 수동 로드 데이터 처리
     */
    handleManualLoad(loadData) {
        console.log("📂 [StrategyScene] Manual Load Data Applied", loadData);

        this.scene.registry.set('playerInventory', loadData.playerInventory || {});
        this.scene.isManualLoad = true;

        // 기존 데이터 초기화
        const keysToReset = [
            'playerCoins',
            'playerSquad',
            'unlockedRoles',
            'worldMapData',
            'leaderPosition',
            'turnCount',
            'lastSafeNodeId'
        ];
        keysToReset.forEach(key => this.scene.registry.remove(key));

        // 새 데이터 설정
        this.scene.registry.set('playerCoins', loadData.playerCoins);
        this.scene.registry.set('playerSquad', loadData.playerSquad);
        this.scene.registry.set('unlockedRoles', loadData.unlockedRoles);
        this.scene.registry.set('worldMapData', loadData.worldMapData);
        this.scene.registry.set('leaderPosition', loadData.leaderPosition);
        this.scene.registry.set('turnCount', loadData.turnCount || 1);
        this.scene.registry.set('lastSafeNodeId', loadData.lastSafeNodeId);

        this.scene.battleResultData = null;
    }

    /**
     * 저장된 게임 로드
     */
    loadSavedGame() {
        const savedData = SaveManager.loadGame();

        if (!savedData) return;

        if (this.scene.registry.get('playerCoins') === undefined) {
            this.scene.registry.set('playerCoins', savedData.playerCoins ?? 10);
        }
        if (!this.scene.registry.get('playerSquad')) {
            this.scene.registry.set('playerSquad', savedData.playerSquad || [{ role: 'Leader', level: 1, xp: 0 }]);
        }
        if (!this.scene.registry.get('unlockedRoles')) {
            this.scene.registry.set('unlockedRoles', savedData.unlockedRoles || ['Normal']);
        }
        if (!this.scene.registry.get('worldMapData') && savedData.worldMapData) {
            this.scene.registry.set('worldMapData', savedData.worldMapData);
        }
        if (this.scene.registry.get('leaderPosition') === undefined && savedData.leaderPosition) {
            this.scene.registry.set('leaderPosition', savedData.leaderPosition);
        }
        if (this.scene.registry.get('turnCount') === undefined) {
            this.scene.registry.set('turnCount', savedData.turnCount ?? 1);
        }
        if (!this.scene.registry.get('playerInventory')) {
            this.scene.registry.set('playerInventory', savedData.playerInventory || {});
        }
    }

    /**
     * 현재 게임 데이터 가져오기
     */
    getCurrentGameData() {
        return {
            playerCoins: this.scene.registry.get('playerCoins'),
            playerSquad: this.scene.registry.get('playerSquad'),
            playerInventory: this.scene.registry.get('playerInventory'),
            unlockedRoles: this.scene.registry.get('unlockedRoles'),
            worldMapData: this.scene.registry.get('worldMapData'),
            leaderPosition: this.scene.registry.get('leaderPosition'),
            lastSafeNodeId: this.scene.registry.get('lastSafeNodeId'),
            turnCount: this.scene.registry.get('turnCount')
        };
    }

    /**
     * 진행 상황 저장
     */
    saveProgress() {
        const data = this.getCurrentGameData();
        SaveManager.saveGame(data);
        console.log("💾 [StrategyScene] Progress Saved (Auto)");
    }

    /**
     * 초기 기본값 설정 (Firebase 설정 로드 후)
     */
    applyInitialDefaults(strategySettings) {
        if (this.scene.isManualLoad) return;

        const initialCoins = strategySettings?.gameSettings?.initialCoins ?? 50;

        if (this.scene.registry.get('playerCoins') === undefined) {
            this.scene.registry.set('playerCoins', initialCoins);
        }

        if (!this.scene.registry.get('playerSquad')) {
            this.scene.registry.set('playerSquad', [{ role: 'Leader', level: 1, xp: 0 }]);
        }

        if (!this.scene.registry.get('unlockedRoles')) {
            this.scene.registry.set('unlockedRoles', ['Normal']);
        }

        if (this.scene.registry.get('turnCount') === undefined) {
            this.scene.registry.set('turnCount', 1);
        }

        if (!this.scene.registry.get('playerInventory')) {
            this.scene.registry.set('playerInventory', {});
        }
    }
}
