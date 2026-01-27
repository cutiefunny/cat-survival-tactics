import Phaser from 'phaser';
import BattleItemModal from '../ui/BattleItemModal'; 

export default class BattleUIManager {
    constructor(scene) {
        this.scene = scene; // BattleScene
        console.log("🔧 [BattleUIManager] Initialized");
        
        this.isDebugEnabled = false; 
        this.itemModal = null; 

        // UIScene 실행 확인 및 실행
        if (this.scene.scene.isActive('UIScene')) {
            // 이미 실행 중이면 유지
        } else {
            this.scene.scene.launch('UIScene');
        }
    }

    create() {
        // UIScene이 확실히 로드된 후 실행하기 위해 약간의 딜레이
        this.scene.time.delayedCall(100, () => {
            const uiScene = this.scene.scene.get('UIScene');
            if (uiScene) {
                // UI Scene에 모달과 버튼 생성
                this.itemModal = new BattleItemModal(uiScene, this.scene);
                this.createInventoryButton(uiScene);
            } else {
                console.error("❌ UIScene not found!");
            }
        });
    }

    createInventoryButton(uiScene) {
        const { width, height } = uiScene.scale;
        // 위치: 우측 상단
        const x = width - 60;
        const y = 140; 

        const btn = uiScene.add.container(x, y);
        
        const bg = uiScene.add.circle(0, 0, 30, 0x444444)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true });
            
        const icon = uiScene.add.text(0, 0, "🎒", { fontSize: '30px' }).setOrigin(0.5);

        bg.on('pointerdown', () => {
            if (this.itemModal) {
                uiScene.tweens.add({ targets: btn, scale: 0.9, duration: 50, yoyo: true });
                this.itemModal.toggle();
            }
        });

        btn.add([bg, icon]);
    }

    // --- Bridge Methods (기존과 동일) ---
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
            if (!ui.debugStats.visible) ui.showDebugStats();
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