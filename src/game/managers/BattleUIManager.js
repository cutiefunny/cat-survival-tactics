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
    
    createShopUI(unitData, currentCoins, onBuyCallback) {
        this.scene.time.delayedCall(150, () => {
            const ui = this.scene.scene.get('UIScene');
            if (ui && ui.createShopUI) {
                ui.createShopUI(unitData, currentCoins, onBuyCallback);
            }
        });
    }

    updateCoins(amount) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.updateCoins) ui.updateCoins(amount);
    }

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

    // [New] 코인 획득 애니메이션 호출
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