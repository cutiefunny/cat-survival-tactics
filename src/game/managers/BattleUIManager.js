import Phaser from 'phaser';

export default class BattleUIManager {
    constructor(scene) {
        this.scene = scene;
        console.log("🔧 [BattleUIManager] Initialized");
        
        this.isDebugEnabled = false; 

        if (this.scene.scene.isActive('UIScene')) {
            this.scene.scene.stop('UIScene');
        }
        this.scene.scene.launch('UIScene');
    }

    // --- Bridge Methods ---

    createFooter() { }
    createAutoBattleButton() { }
    createSquadButton() { }
    createSpeedButton() { }
    createGameMessages() { }
    createLoadingText() { }
    destroyLoadingText() { }

    createDebugStats() { 
        this.isDebugEnabled = true;
        this.scene.time.delayedCall(100, () => {
            const ui = this.scene.scene.get('UIScene');
            if (ui && ui.showDebugStats) ui.showDebugStats();
        });
    }

    createStartButton(callback) {
        this.scene.time.delayedCall(100, () => {
            const ui = this.scene.scene.get('UIScene');
            if (ui && ui.showStartButton) {
                ui.showStartButton(callback);
            }
        });
    }
    
    // [New] 상점 UI 생성 요청
    createShopUI(unitData, currentCoins, onBuyCallback) {
        this.scene.time.delayedCall(150, () => {
            const ui = this.scene.scene.get('UIScene');
            if (ui && ui.createShopUI) {
                ui.createShopUI(unitData, currentCoins, onBuyCallback);
            }
        });
    }

    // [New] 코인 업데이트
    updateCoins(amount) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.updateCoins) ui.updateCoins(amount);
    }

    // [New] 상점 숨기기
    hideShopUI() {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.hideShopUI) ui.hideShopUI();
    }

    updateAutoButton(isAuto) { this.emitUIEvent('auto', isAuto); }
    updateSquadButton(state) { this.emitUIEvent('squad', state); }
    updateSpeedButton(speed) { this.emitUIEvent('speed', speed); }

    showStartAnimation() {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.showStartAnimation) ui.showStartAnimation();
    }

    createGameOverUI(message, color, btnText, callback) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.createGameOverUI) {
            ui.createGameOverUI(message, color, btnText, callback);
        }
    }

    updateDebugStats(loop) {
        if (!this.isDebugEnabled) return;
        const ui = this.scene.scene.get('UIScene');
        
        if (ui && ui.updateDebugStats) {
            let memInfo = null;
            if (window.performance && window.performance.memory) {
                memInfo = Math.round(window.performance.memory.usedJSHeapSize / 1024 / 1024);
            }
            ui.updateDebugStats(loop.actualFps, memInfo);
        }
    }
    
    updateScore(blue, red) {}
    cleanupBeforeBattle() {} 
    handleResize(w, h) {} 

    emitUIEvent(type, value) {
        this.scene.events.emit('updateUI', { type, value });
    }
}