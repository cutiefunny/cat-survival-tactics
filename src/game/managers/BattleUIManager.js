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

    createRetreatConfirmModal(onConfirm, onCancel) {
        const { width, height } = this.scene.scale;
        
        // 입력 차단용 배경
        const bg = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
            .setInteractive()
            .setDepth(3000);

        const modal = this.scene.add.container(width / 2, height / 2).setDepth(3001);
        
        const panel = this.scene.add.rectangle(0, 0, 400, 250, 0x222222)
            .setStrokeStyle(3, 0xffaa00);
        
        const titleText = this.scene.add.text(0, -60, "전장에서 이탈하시겠습니까?", {
            fontSize: '22px', fontStyle: 'bold', color: '#ffffff'
        }).setOrigin(0.5);

        const descText = this.scene.add.text(0, -10, "후퇴 시 모든 아군의\n피로도가 2 증가합니다.", {
            fontSize: '18px', color: '#cccccc', align: 'center'
        }).setOrigin(0.5);

        // 확인 버튼
        const confirmBtn = this.scene.add.container(-90, 70);
        const cBg = this.scene.add.rectangle(0, 0, 140, 50, 0xcc4444).setInteractive({ useHandCursor: true });
        const cText = this.scene.add.text(0, 0, "후퇴", { fontSize: '20px', fontStyle: 'bold' }).setOrigin(0.5);
        cBg.setStrokeStyle(2, 0xffffff);
        confirmBtn.add([cBg, cText]);
        
        cBg.on('pointerdown', () => {
            bg.destroy();
            modal.destroy();
            onConfirm();
        });

        // 취소 버튼
        const cancelBtn = this.scene.add.container(90, 70);
        const cancelBg = this.scene.add.rectangle(0, 0, 140, 50, 0x444444).setInteractive({ useHandCursor: true });
        const cancelText = this.scene.add.text(0, 0, "취소", { fontSize: '20px', fontStyle: 'bold' }).setOrigin(0.5);
        cancelBg.setStrokeStyle(2, 0xffffff);
        cancelBtn.add([cancelBg, cancelText]);

        cancelBg.on('pointerdown', () => {
            bg.destroy();
            modal.destroy();
            onCancel();
        });

        modal.add([panel, titleText, descText, confirmBtn, cancelBtn]);
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