import Phaser from 'phaser';
import ShopModal from '../ui/ShopModal';
import SystemModal from '../ui/SystemModal';
import DaisoModal from '../ui/DaisoModal'; // [New] Import

export default class StrategyUIManager {
    constructor(scene) {
        this.scene = scene;
        
        // UI 요소 참조 저장
        this.uiContainer = null;
        this.shopModal = null;
        this.systemModal = null;
        this.daisoModal = null; // [New]
        this.dynamicBtnContainer = null;
        
        // 텍스트 및 버튼 객체
        this.coinText = null;
        this.statusText = null;
        this.sysBtn = null;
        this.bgmBtn = null;
        this.endTurnBtnObj = null;
        this.shopBtnObj = null;
        this.undoBtnObj = null;

        // UI 카메라
        this.uiCamera = null;

        console.log("🔧 [StrategyUIManager] Initialized");
    }

    createUI() {
        // UI 카메라 설정
        this.uiCamera = this.scene.cameras.add(0, 0, this.scene.scale.width, this.scene.scale.height);
        this.uiCamera.ignore(this.scene.children.list); 

        this.uiContainer = this.scene.add.container(0, 0);
        this.uiContainer.setScrollFactor(0); 

        // 모달 및 컨테이너 초기화
        this.shopModal = new ShopModal(this.scene, this.uiContainer);
        this.systemModal = new SystemModal(this.scene, this.uiContainer);
        this.daisoModal = new DaisoModal(this.scene, this.uiContainer); // [New]
        this.dynamicBtnContainer = this.scene.add.container(0, 0);

        this.drawUIElements();
        
        this.uiContainer.add(this.dynamicBtnContainer);
        this.scene.cameras.main.ignore(this.uiContainer);
    }

    drawUIElements() {
        if (this.uiContainer.list.length > 0) {
            this.uiContainer.removeAll(true);
            this.shopModal = new ShopModal(this.scene, this.uiContainer);
            this.systemModal = new SystemModal(this.scene, this.uiContainer);
            this.daisoModal = new DaisoModal(this.scene, this.uiContainer); // [New]
            this.dynamicBtnContainer = this.scene.add.container(0, 0);
        } else {
            this.shopModal = new ShopModal(this.scene, this.uiContainer);
            this.systemModal = new SystemModal(this.scene, this.uiContainer);
            this.daisoModal = new DaisoModal(this.scene, this.uiContainer); // [New]
            this.dynamicBtnContainer = this.scene.add.container(0, 0);
        }

        const w = this.scene.scale.width;
        const h = this.scene.scale.height;
        const isMobile = w < 600; 

        const safeAreaTop = isMobile ? 40 : 0; 
        const barHeight = isMobile ? 60 : 50;
        
        const topBarH = barHeight + safeAreaTop;
        const contentY = safeAreaTop + (barHeight / 2);

        const fontSize = isMobile ? '13px' : '16px'; 

        // 상단 바 배경
        const topBarBg = this.scene.add.rectangle(0, 0, w, topBarH, 0x000000, 0.6).setOrigin(0, 0);
        
        // 코인 텍스트
        const coins = this.scene.registry.get('playerCoins');
        this.coinText = this.scene.add.text(isMobile ? 10 : 20, contentY, `💰 ${coins}냥`, { fontSize: isMobile ? '16px' : '18px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0, 0.5);
        
        const rightMargin = isMobile ? 15 : 20;
        const btnSpacing = isMobile ? 40 : 50;

        // 시스템 버튼
        this.sysBtn = this.scene.add.text(w - rightMargin, contentY, "⚙️", { fontSize: isMobile ? '20px' : '24px' })
            .setOrigin(1, 0.5)
            .setInteractive();
        
        this.sysBtn.on('pointerdown', () => {
            if (this.shopModal.isOpen) this.shopModal.toggle();
            if (this.daisoModal.isOpen) this.daisoModal.toggle();
            this.systemModal.toggle();
        });

        // BGM 버튼
        this.bgmBtn = this.scene.add.text(w - rightMargin - btnSpacing, contentY, "🔊", { fontSize: isMobile ? '20px' : '24px' })
            .setOrigin(1, 0.5)
            .setInteractive();
        
        this.bgmBtn.on('pointerdown', () => {
            const isMuted = this.scene.toggleBgmMute(); 
            this.bgmBtn.setText(isMuted ? "🔇" : "🔊");
        });

        // 상태 메시지 텍스트
        const currentStatusMsg = (this.statusText && this.statusText.active) ? this.statusText.text : '이동할 영토를 선택하세요.';
        const safeTextWidth = w - (isMobile ? 180 : 300); 
        this.statusText = this.scene.add.text(w / 2, contentY, currentStatusMsg, { fontSize: fontSize, color: '#ffffff', align: 'center', wordWrap: { width: safeTextWidth, useAdvancedWrap: true } }).setOrigin(0.5, 0.5);

        // 하단 버튼들
        const btnMargin = isMobile ? 50 : 60;
        
        // 턴 종료 버튼
        this.endTurnBtnObj = this.createStyledButton(w - (isMobile ? 85 : 100), h - btnMargin, '턴 종료', 0xcc0000, () => {
            if (this.scene.selectedTargetId !== null) this.scene.startBattle();
            else this.scene.handleTurnEnd();
        });
        
        // 부대 편성 (상점) 버튼
        this.shopBtnObj = this.createStyledButton(isMobile ? 100 : 100, h - btnMargin, '부대편성', 0x444444, () => {
            if (this.systemModal.isOpen) this.systemModal.toggle();
            if (this.daisoModal.isOpen) this.daisoModal.toggle();
            this.shopModal.toggle();
        });

        // 이동 취소 버튼
        this.undoBtnObj = this.createStyledButton(isMobile ? 100 : 100, h - btnMargin, '이동 취소', 0x666666, () => this.scene.undoMove());
        this.undoBtnObj.container.setVisible(false);

        if (isMobile) {
            this.endTurnBtnObj.container.setScale(0.85);
            this.shopBtnObj.container.setScale(0.85);
            this.undoBtnObj.container.setScale(0.85);
        }

        this.uiContainer.add([topBarBg, this.coinText, this.bgmBtn, this.sysBtn, this.statusText]);
        this.uiContainer.add([this.shopBtnObj.container, this.endTurnBtnObj.container, this.undoBtnObj.container]);
        this.uiContainer.add(this.dynamicBtnContainer);
        
        this.updateState();
    }

    createStyledButton(x, y, text, color, onClick) {
        const btnContainer = this.scene.add.container(x, y);
        const shadow = this.scene.add.rectangle(4, 4, 160, 50, 0x000000, 0.5).setOrigin(0.5);
        const bg = this.scene.add.rectangle(0, 0, 160, 50, color).setOrigin(0.5);
        bg.setStrokeStyle(2, 0xffffff, 0.8);
        const btnText = this.scene.add.text(0, 0, text, { fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        const hitArea = this.scene.add.rectangle(0, 0, 160, 50, 0x000000, 0).setOrigin(0.5).setInteractive({ useHandCursor: true });
        
        hitArea.on('pointerdown', () => {
            this.scene.tweens.add({ targets: btnContainer, scale: 0.95, duration: 50, yoyo: true, onComplete: onClick });
        });
        hitArea.on('pointerover', () => { bg.setStrokeStyle(3, 0xffff00, 1); });
        hitArea.on('pointerout', () => { bg.setStrokeStyle(2, 0xffffff, 0.8); });

        btnContainer.add([shadow, bg, btnText, hitArea]);
        return { container: btnContainer, textObj: btnText, bgObj: bg };
    }

    updateCoinText(amount) {
        if(this.coinText) {
            this.coinText.setText(`💰 ${amount}냥`);
        }
    }

    setStatusText(message, color = '#ffffff') {
        if (this.statusText) {
            this.statusText.setText(message);
            this.statusText.setColor(color);
        }
    }

    shakeStatusText() {
        if (this.statusText) {
            this.scene.tweens.add({ targets: this.statusText, alpha: 0.5, duration: 100, yoyo: true, repeat: 1 });
        }
    }

    // [New] 다이소 모달 토글 메서드
    toggleDaisoModal() {
        if (this.shopModal.isOpen) this.shopModal.toggle();
        if (this.systemModal.isOpen) this.systemModal.toggle();
        
        if (this.daisoModal) {
            this.daisoModal.toggle();
        }
    }

    updateState() {
        if (!this.undoBtnObj || !this.endTurnBtnObj || !this.shopBtnObj) return;
        
        const hasMoved = this.scene.hasMoved;
        const previousLeaderId = this.scene.previousLeaderId;
        const selectedTargetId = this.scene.selectedTargetId;
        
        const leaderPosition = this.scene.registry.get('leaderPosition');
        const mapNodes = this.scene.mapManager ? this.scene.mapManager.mapNodes : [];

        // 이동 취소 / 상점 버튼 토글
        if (hasMoved && previousLeaderId !== null) {
            this.undoBtnObj.container.setVisible(true); 
            this.shopBtnObj.container.setVisible(false); 
        } else {
            this.undoBtnObj.container.setVisible(false); 
            this.shopBtnObj.container.setVisible(true);
        }
        
        // 턴 종료 / 전투 시작 버튼 토글
        if (selectedTargetId !== null && selectedTargetId !== undefined) {
            this.endTurnBtnObj.textObj.setText("전투 시작"); 
            this.endTurnBtnObj.bgObj.setFillStyle(0xff0000); 
        } else {
            this.endTurnBtnObj.textObj.setText("턴 종료"); 
            this.endTurnBtnObj.bgObj.setFillStyle(0xcc0000); 
        }

        this.updateLocationMenus(leaderPosition, mapNodes);
    }

    updateLocationMenus(currentLeaderId, mapNodes) {
        if (!this.dynamicBtnContainer) return;
        this.dynamicBtnContainer.removeAll(true);
        
        if (!mapNodes) return;
        const currentNode = mapNodes.find(n => n.id === currentLeaderId);
        
        if (currentNode && currentNode.add_menu && Array.isArray(currentNode.add_menu)) {
            let xPos = 280; 
            const yPos = this.scene.scale.height - (this.scene.scale.width < 600 ? 50 : 60);
            const isMobile = this.scene.scale.width < 600;
            
            if (isMobile) {
                xPos = 190; 
            }

            currentNode.add_menu.forEach((menuName, index) => {
                if (menuName === "다이소") {
                    const btn = this.createStyledButton(xPos + (index * 120), yPos, "🛍️ 다이소", 0xff66cc, () => {
                        this.scene.openDaiso();
                    });
                    
                    if (isMobile) btn.container.setScale(0.85);
                    this.dynamicBtnContainer.add(btn.container);
                }
            });
        }
    }

    resize(gameSize) {
        if (this.uiCamera) {
            this.uiCamera.setViewport(0, 0, gameSize.width, gameSize.height);
        }
        this.drawUIElements();
    }

    showFloatingText(x, y, message, color) {
        const text = this.scene.add.text(x, y, message, {
            fontSize: '32px', color: color, stroke: '#000000', strokeThickness: 4, fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(3000);
        
        this.uiContainer.add(text);
        
        this.scene.tweens.add({
            targets: text, y: y - 100, alpha: 0, duration: 2000, ease: 'Power2',
            onComplete: () => text.destroy()
        });
    }

    ignoreObject(object) {
        if (this.uiCamera) {
            this.uiCamera.ignore(object);
        }
    }
}