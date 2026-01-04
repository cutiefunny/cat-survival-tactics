export default class BattleUIManager {
    constructor(scene) {
        this.scene = scene;
        console.log("🔧 [BattleUIManager] Initialized");

        // [Debug] UIScene 실행 시도
        const uiSceneKey = 'UIScene';
        
        // Scene Manager에 등록되었는지 확인
        if (this.scene.scene.get(uiSceneKey)) {
             console.log("   -> UIScene found in SceneManager.");
             
             if (this.scene.scene.isActive(uiSceneKey)) {
                console.log("   -> UIScene is active. Restarting...");
                this.scene.scene.stop(uiSceneKey);
            }
            console.log("   -> Launching UIScene...");
            this.scene.scene.launch(uiSceneKey);
        } else {
            console.error("❌ [BattleUIManager] UIScene NOT found in SceneManager! Check phaserConfig.js 'scene' array.");
        }
    }

    // --- Bridge Methods ---

    createFooter() { /* UIScene handles this */ }
    createAutoBattleButton() { /* UIScene handles this */ }
    createSquadButton() { /* UIScene handles this */ }
    createSpeedButton() { /* UIScene handles this */ }
    createGameMessages() { /* UIScene handles this */ }
    createLoadingText() { }
    destroyLoadingText() { }

    createStartButton(callback) {
        console.log("🔧 [BattleUIManager] Requesting Start Button...");
        this.scene.time.delayedCall(200, () => {
            const ui = this.scene.scene.get('UIScene');
            if (ui && ui.showStartButton) {
                console.log("   -> UIScene.showStartButton found. Executing.");
                ui.showStartButton(callback);
            } else {
                console.warn("   ⚠️ UIScene or showStartButton method missing!");
            }
        });
    }

    updateAutoButton(isAuto) { this.emitUIEvent('auto', isAuto); }
    updateSquadButton(state) { this.emitUIEvent('squad', state); }
    updateSpeedButton(speed) { this.emitUIEvent('speed', speed); }

    showStartAnimation() {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.showStartAnimation) ui.showStartAnimation();
    }

    createGameOverUI(message, color, restartCallback) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.createGameOverUI) ui.createGameOverUI(message, color, restartCallback);
    }

    updateDebugStats(loop) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.updateDebugStats) ui.updateDebugStats(loop.actualFps);
    }
    
    updateScore(blue, red) {}
    cleanupBeforeBattle() {} 
    handleResize(w, h) {} 

    emitUIEvent(type, value) {
        this.scene.events.emit('updateUI', { type, value });
    }
}