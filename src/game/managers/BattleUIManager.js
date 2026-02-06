import Phaser from 'phaser';
import BattleItemModal from '../ui/BattleItemModal'; 

export default class BattleUIManager {
    constructor(scene) {
        this.scene = scene; // BattleScene
        console.log("🔧 [BattleUIManager] Initialized");
        
        this.isDebugEnabled = false; 
        this.itemModal = null; 
        this.dialogContainer = null;
        this._uiSceneCache = null; // UIScene 캐시
        this._debugUpdateTimer = 0; // 디버그 업데이트 타이머
        this._debugUpdateInterval = 500; // 디버그 업데이트 간격 (ms)

        // UIScene 실행 확인 및 실행
        if (!this.scene.scene.isActive('UIScene')) {
            this.scene.scene.launch('UIScene');
        }
    }

    // UIScene 캐시 및 조회 최적화
    getUIScene() {
        if (!this._uiSceneCache || !this._uiSceneCache.scene.isActive()) {
            this._uiSceneCache = this.scene.scene.get('UIScene');
        }
        return this._uiSceneCache;
    }

    create() {
        const uiScene = this.getUIScene();
        if (uiScene) {
            this.itemModal = new BattleItemModal(uiScene, this.scene);
        } else {
            console.error("❌ UIScene not found!");
        }
    }

    // [제거] createInventoryButton 메서드를 삭제했습니다.
    // 이제 아이템 버튼 생성은 UIScene.js의 createFooter에서 통합 관리합니다.

    // Bridge Methods: UIScene의 메서드를 호출하도록 데이터 흐름 연결
    updateAutoButton(isAuto) {
        const ui = this.getUIScene();
        if (ui?.updateAutoButton) {
            ui.updateAutoButton(isAuto);
        }
        this.emitUIEvent('auto', isAuto);
    }

    updateSquadButton(state) {
        const ui = this.getUIScene();
        if (ui?.updateSquadButton) {
            ui.updateSquadButton(state);
        }
        this.emitUIEvent('squad', state);
    }

    updateSpeedButton(speed) {
        const ui = this.getUIScene();
        if (ui?.updateSpeedButton) {
            ui.updateSpeedButton(speed);
        }
        this.emitUIEvent('speed', speed);
    }

    emitUIEvent(type, value) {
        this.scene.events.emit('updateUI', { type, value });
    }

    createDebugStats() { 
        this.isDebugEnabled = true;
        this.updateDebugStatsVisibility();
    }
    
    destroyDebugStats() {
        this.isDebugEnabled = false;
        const ui = this.getUIScene();
        if (ui?.debugStats) {
            ui.debugStats.setVisible(false);
        }
    }

    updateDebugStatsVisibility() {
        if (!this.isDebugEnabled) return;
        const ui = this.getUIScene();
        if (ui?.debugStats && !ui.debugStats.visible) {
            ui.showDebugStats();
        }
    }

    createStartButton(callback) {
        // UIScene이 완전히 준비될 때까지 약간 대기
        this.scene.time.delayedCall(100, () => {
            const ui = this.getUIScene();
            if (ui?.showStartButton) {
                ui.showStartButton(callback);
            } else {
                console.warn('❌ UIScene not ready for createStartButton');
            }
        });
    }
    
    updateCoins(amount) {
        const ui = this.getUIScene();
        if (ui?.updateCoins) ui.updateCoins(amount);
    }

    showStartAnimation() {
        const ui = this.getUIScene();
        if (ui?.showStartAnimation) ui.showStartAnimation();
    }

    playCoinAnimation(startX, startY, amount, onComplete) {
        const ui = this.getUIScene();
        if (ui?.playCoinAnimation) {
            ui.playCoinAnimation(startX, startY, amount, onComplete);
        } else {
            if (onComplete) onComplete();
        }
    }

    createGameOverUI(message, color, btnText, callback) {
        const ui = this.getUIScene();
        if (ui?.createGameOverUI) {
            ui.createGameOverUI(message, color, btnText, callback);
        }
    }

    createRetreatConfirmModal(onConfirm, onCancel) {
        const ui = this.getUIScene();
        if (ui?.showRetreatModal) {
            ui.showRetreatModal(onConfirm, onCancel);
        }
    }

    updateDebugStats(loop, delta) {
        if (!this.isDebugEnabled) return;
        
        // Throttle: 500ms마다만 업데이트
        this._debugUpdateTimer += delta || 16;
        if (this._debugUpdateTimer < this._debugUpdateInterval) return;
        this._debugUpdateTimer = 0;
        
        const ui = this.getUIScene();
        if (ui?.debugStats) {
            if (!ui.debugStats.visible) ui.showDebugStats();
            if (ui.updateDebugStats) {
                let memInfo = null;
                if (window.performance?.memory) {
                    memInfo = Math.round(window.performance.memory.usedJSHeapSize / 1024 / 1024);
                }
                ui.updateDebugStats(loop.actualFps, memInfo);
            }
        }
    }

    showDialogConfirm(text, options, onAction) {
        const uiScene = this.getUIScene();
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

    // 정리 메서드 추가 (메모리 누수 방지)
    destroy() {
        if (this.dialogContainer) {
            this.dialogContainer.destroy();
            this.dialogContainer = null;
        }
        if (this.itemModal) {
            this.itemModal = null;
        }
        this._uiSceneCache = null;
    }
}