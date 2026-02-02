import Phaser from 'phaser';
import BattleItemModal from '../ui/BattleItemModal'; 

export default class BattleUIManager {
    constructor(scene) {
        this.scene = scene; // BattleScene
        console.log("🔧 [BattleUIManager] Initialized");
        
        this.isDebugEnabled = false; 
        this.itemModal = null; 
        this.dialogContainer = null;

        // UI 요소 참조 저장을 위한 객체 (UIScene의 객체를 논리적으로 연결)
        this.uiButtons = {
            auto: null,
            squad: null,
            speed: null
        };

        // UIScene 실행 확인 및 실행
        if (!this.scene.scene.isActive('UIScene')) {
            this.scene.scene.launch('UIScene');
        }
    }

    create() {
        // UIScene이 확실히 로드된 후 실행하기 위해 약간의 딜레이
        this.scene.time.delayedCall(100, () => {
            const uiScene = this.scene.scene.get('UIScene');
            if (uiScene) {
                // UI Scene에 모달 초기화 (버튼 생성 로직은 제거됨)
                this.itemModal = new BattleItemModal(uiScene, this.scene);
            } else {
                console.error("❌ UIScene not found!");
            }
        });
    }

    // [제거] createInventoryButton 메서드를 삭제했습니다.
    // 이제 아이템 버튼 생성은 UIScene.js의 createFooter에서 통합 관리합니다.

    // Bridge Methods: UIScene의 메서드를 호출하도록 데이터 흐름 연결
    updateAutoButton(isAuto) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.updateAutoButton) {
            ui.updateAutoButton(isAuto);
        }
        this.emitUIEvent('auto', isAuto);
    }

    updateSquadButton(state) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.updateSquadButton) {
            ui.updateSquadButton(state);
        }
        this.emitUIEvent('squad', state);
    }

    updateSpeedButton(speed) {
        const ui = this.scene.scene.get('UIScene');
        if (ui && ui.updateSpeedButton) {
            ui.updateSpeedButton(speed);
        }
        this.emitUIEvent('speed', speed);
    }

    emitUIEvent(type, value) {
        this.scene.events.emit('updateUI', { type, value });
    }

    // --- 시스템 기능 유지를 위한 나머지 메서드 ---
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

    showDialogConfirm(text, options, onAction) {
        const uiScene = this.scene.scene.get('UIScene');
        if (!uiScene) return;

        if (this.dialogContainer) this.dialogContainer.destroy();

        const { width, height } = uiScene.scale;
        const blocker = uiScene.add.rectangle(width/2, height/2, width, height, 0x000000, 0.3).setInteractive();
        const dialogW = 500;
        const dialogH = 250;
        const bg = uiScene.add.rectangle(0, 0, dialogW, dialogH, 0x222222).setStrokeStyle(4, 0xffffff);
        const msgText = uiScene.add.text(0, -40, text, {
            fontSize: '20px', color: '#ffffff', align: 'center', wordWrap: { width: dialogW - 40 }
        }).setOrigin(0.5);

        this.dialogContainer = uiScene.add.container(width/2, height/2, [blocker, bg, msgText]);
        this.dialogContainer.setDepth(6000);

        const btnWidth = 180;
        const btnHeight = 50;
        const spacing = 20;
        const totalW = options.length * btnWidth + (options.length - 1) * spacing;
        let startX = -totalW / 2 + btnWidth / 2;

        options.forEach(opt => {
            const btnBg = uiScene.add.rectangle(startX, 60, btnWidth, btnHeight, 0x444444)
                .setInteractive({ useHandCursor: true })
                .setStrokeStyle(2, 0x888888);
            
            const btnTxt = uiScene.add.text(startX, 60, opt.text, {
                fontSize: '18px', fontStyle: 'bold', color: '#ffffff'
            }).setOrigin(0.5);

            btnBg.on('pointerdown', () => {
                this.closeDialog();
                if (onAction && opt.action) onAction(opt.action);
            });
            
            btnBg.on('pointerover', () => btnBg.setFillStyle(0x666666));
            btnBg.on('pointerout', () => btnBg.setFillStyle(0x444444));

            this.dialogContainer.add([btnBg, btnTxt]);
            startX += btnWidth + spacing;
        });
        
        this.dialogContainer.setScale(0);
        uiScene.tweens.add({ targets: this.dialogContainer, scale: 1, duration: 200, ease: 'Back.out' });
    }

    closeDialog() {
        if (this.dialogContainer) {
            this.dialogContainer.destroy();
            this.dialogContainer = null;
        }
    }
    
    updateScore(blue, red) {}
    cleanupBeforeBattle() {} 
    handleResize(w, h) {} 
}