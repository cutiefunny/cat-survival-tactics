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
        // [Fix] 타이밍 문제 해결을 위해 delayedCall 제거
        // updateDebugStats 루프에서 UI가 준비되면 자동으로 켜지도록 변경
        this.updateDebugStatsVisibility();
    }
    
    // [New] 명시적으로 끄는 기능 추가
    destroyDebugStats() {
        this.isDebugEnabled = false;
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.debugStats) {
            ui.debugStats.setVisible(false);
        }
    }

    // [New] 디버그 표시 상태 동기화
    updateDebugStatsVisibility() {
        if (!this.isDebugEnabled) return;
        const ui = this.scene.scene.get('UIScene');
        // UI 씬이 준비되었고 텍스트 객체가 있는데 꺼져있다면 켠다
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

    createGameOverUI(message, color, btnText, callback) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.createGameOverUI) {
            ui.createGameOverUI(message, color, btnText, callback);
        }
    }

    updateDebugStats(loop) {
        if (!this.isDebugEnabled) return;
        
        const ui = this.scene.scene.get('UIScene');
        
        // [Fix] 매 프레임 체크하여 UI 씬 로딩 완료 시점에 즉시 표시 (Race Condition 해결)
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