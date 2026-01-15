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
        this.updateDebugStatsVisibility();
    }
    
    destroyDebugStats() {
        this.isDebugEnabled = false;
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.debugStats) {
            ui.debugStats.setVisible(false);
        }
    }

    updateDebugStatsVisibility() {
        if (!this.isDebugEnabled) return;
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.debugStats && !ui.debugStats.visible) {
            ui.showDebugStats();
        }
    }

    createStartButton(callback) {
        this.scene.time.delayedCall(100, () => {
            const ui = this.scene.scene.get('UIScene');
            if (ui && ui.showStartButton) {
                ui.showStartButton(callback);
            }
        });
    }
    
    // [Removed] createShopUI, hideShopUI 제거됨

    updateCoins(amount) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.updateCoins) ui.updateCoins(amount);
    }

    updateAutoButton(isAuto) { this.emitUIEvent('auto', isAuto); }
    updateSquadButton(state) { this.emitUIEvent('squad', state); }
    updateSpeedButton(speed) { this.emitUIEvent('speed', speed); }

    showStartAnimation() {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.showStartAnimation) ui.showStartAnimation();
    }

    playCoinAnimation(startX, startY, amount, onComplete) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.playCoinAnimation) {
            ui.playCoinAnimation(startX, startY, amount, onComplete);
        } else {
            if (onComplete) onComplete();
        }
    }

    createGameOverUI(message, color, btnText, callback) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.createGameOverUI) {
            ui.createGameOverUI(message, color, btnText, callback);
        }
    }

    createRetreatConfirmModal(onConfirm, onCancel) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.showRetreatModal) {
            ui.showRetreatModal(onConfirm, onCancel);
        }
    }

    updateDebugStats(loop) {
        if (!this.isDebugEnabled) return;
        
        const ui = this.scene.scene.get('UIScene');
        
        if (ui && ui.debugStats) {
            if (!ui.debugStats.visible) {
                ui.showDebugStats();
            }
            
            if (ui.updateDebugStats) {
                let memInfo = null;
                if (window.performance && window.performance.memory) {
                    memInfo = Math.round(window.performance.memory.usedJSHeapSize / 1024 / 1024);
                }
                ui.updateDebugStats(loop.actualFps, memInfo);
            }
        }
    }
    
    updateScore(blue, red) {}
    cleanupBeforeBattle() {} 
    handleResize(w, h) {} 

    emitUIEvent(type, value) {
        this.scene.events.emit('updateUI', { type, value });
    }
}