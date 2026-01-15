import Phaser from 'phaser';
import GameOverModal from '../ui/GameOverModal'; 

export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    create() {
        this.footerHeight = 80;
        
        this.autoBtn = null;
        this.squadBtn = null;
        this.speedBtn = null;
        this.startBtn = null;
        this.msgText = null;
        this.debugStats = null;
        
        this.gameOverModal = new GameOverModal(this);

        const battleScene = this.scene.get('BattleScene');
        if (battleScene) {
            battleScene.events.off('updateUI'); 
            battleScene.events.on('updateUI', this.handleUIUpdate, this);
        }
        
        this.createFooter();
        this.createGameMessages();
        this.createDebugStats();
        
        this.scale.on('resize', this.handleResize, this);
        this.handleResize(this.scale.gameSize);
    }

    createFooter() {
        const { width, height } = this.scale;
        
        this.footer = this.add.container(0, height - this.footerHeight);

        const bg = this.add.rectangle(width / 2, this.footerHeight / 2, width, this.footerHeight, 0x000000, 0.85);
        const border = this.add.rectangle(width / 2, 0, width, 2, 0xffffff, 0.3);
        
        this.footer.add([bg, border]);

        // [Refactored] 헬퍼 메서드를 사용하여 버튼 생성 코드 중복 제거
        this.autoBtn = this.createFooterButton('수동조작', () => {
            this.scene.get('BattleScene').toggleAutoBattle();
        });

        this.squadBtn = this.createFooterButton('자율공격', () => {
            this.scene.get('BattleScene').toggleSquadState();
        });

        this.speedBtn = this.createFooterButton('1배속', () => {
            this.scene.get('BattleScene').toggleGameSpeed();
        });
        
        this.footer.add([this.autoBtn, this.squadBtn, this.speedBtn]);
        this.repositionFooterElements();
    }

    // [New] 푸터 버튼 생성 헬퍼
    createFooterButton(defaultText, onClick) {
        const container = this.add.container(0, 0);
        container.setSize(120, 50);

        const bg = this.add.rectangle(0, 0, 120, 50, 0x444444)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(0, 0, defaultText, { 
            fontSize: '18px', 
            fontStyle: 'bold', 
            fill: '#ffffff' 
        }).setOrigin(0.5);

        container.add([bg, text]);

        bg.on('pointerdown', () => {
            this.tweens.add({ targets: container, scale: 0.9, duration: 50, yoyo: true });
            if (onClick) onClick();
        });

        return container;
    }

    showStartButton(callback) {
        if (this.startBtn) this.startBtn.destroy();
        const { width, height } = this.scale;
        const btnWidth = Math.min(220, width * 0.6);
        const btnHeight = Math.min(80, height * 0.15);
        const fontSize = Math.min(28, width * 0.08);
        this.startBtn = this.add.container(width / 2, height / 2).setDepth(2000);
        const bg = this.add.rectangle(0, 0, btnWidth, btnHeight, 0xffffff).setStrokeStyle(4, 0xffffff);
        const text = this.add.text(0, 0, 'BATTLE START', { fontSize: `${fontSize}px`, fontStyle: 'bold', fill: '#000000' }).setOrigin(0.5);
        this.startBtn.add([bg, text]);
        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.tweens.add({
                targets: this.startBtn, scale: 0.9, duration: 100, yoyo: true,
                onComplete: () => { this.startBtn.setVisible(false); if (callback) callback(); }
            });
        });
    }

    createGameMessages() {
        const { width, height } = this.scale;
        this.msgText = this.add.text(width / 2, height * 0.3, '', {
            fontSize: '48px', fontStyle: 'bold', stroke: '#000000', strokeThickness: 6
        }).setOrigin(0.5).setAlpha(0).setDepth(2000);
    }

    showStartAnimation() {
        if (this.msgText) {
            const { width, height } = this.scale;
            const fontSize = Math.min(48, width * 0.12);
            this.msgText.setFontSize(`${fontSize}px`);
            this.msgText.setText("BATTLE START!");
            this.msgText.setColor("#ffcc00");
            this.msgText.setAlpha(1);
            this.msgText.setScale(0.5);
            this.tweens.add({ targets: this.msgText, scale: 1.2, alpha: 0, duration: 1500, ease: 'Power2' });
        }
    }

    createGameOverUI(data, callback) {
        if (this.gameOverModal) {
            this.gameOverModal.show(data, callback);
        }
    }

    // [New] 후퇴 확인 모달 (UIScene 레이어에서 처리)
    showRetreatModal(onConfirm, onCancel) {
        const { width, height } = this.scale;
        
        // 배경 (클릭 차단)
        const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
            .setInteractive()
            .setDepth(3000);

        const modal = this.add.container(width / 2, height / 2).setDepth(3001);
        
        const panel = this.add.rectangle(0, 0, 400, 250, 0x222222)
            .setStrokeStyle(3, 0xffaa00);
        
        const titleText = this.add.text(0, -60, "전장에서 이탈하시겠습니까?", {
            fontSize: '22px', fontStyle: 'bold', color: '#ffffff'
        }).setOrigin(0.5);

        const descText = this.add.text(0, -10, "후퇴 시 모든 아군의\n피로도가 2 증가합니다.", {
            fontSize: '18px', color: '#cccccc', align: 'center'
        }).setOrigin(0.5);

        // 버튼 생성 헬퍼
        const createBtn = (x, y, text, color, cb) => {
            const btn = this.add.container(x, y);
            const bBg = this.add.rectangle(0, 0, 140, 50, color).setInteractive({ useHandCursor: true });
            const bText = this.add.text(0, 0, text, { fontSize: '20px', fontStyle: 'bold' }).setOrigin(0.5);
            bBg.setStrokeStyle(2, 0xffffff);
            btn.add([bBg, bText]);
            
            bBg.on('pointerdown', () => {
                // 트윈 효과 후 콜백 실행
                this.tweens.add({
                    targets: btn, scale: 0.95, duration: 50, yoyo: true,
                    onComplete: () => {
                        bg.destroy();
                        modal.destroy();
                        if (cb) cb();
                    }
                });
            });
            return btn;
        };

        const confirmBtn = createBtn(-90, 70, "후퇴", 0xcc4444, onConfirm);
        const cancelBtn = createBtn(90, 70, "취소", 0x444444, onCancel);

        modal.add([panel, titleText, descText, confirmBtn, cancelBtn]);
    }

    playCoinAnimation(startX, startY, amount, onComplete) {
        const coinCount = 10; 
        const targetX = this.scale.width - 50;   
        const targetY = 50; 
        
        if (amount > 0) {
            const amountText = this.add.text(startX, startY, `+${amount}냥`, { 
                fontSize: '64px', color: '#ffd700', stroke: '#000000', strokeThickness: 4, fontStyle: 'bold' 
            }).setOrigin(0.5).setDepth(4001);
            this.tweens.add({ targets: amountText, y: startY - 80, alpha: 0, duration: 1500, ease: 'Power2', onComplete: () => amountText.destroy() });
        }
        let completedCoins = 0;
        for (let i = 0; i < coinCount; i++) {
            const coin = this.add.text(startX, startY, '💰', { fontSize: '32px' }).setOrigin(0.5).setDepth(4000);
            const scatterX = Phaser.Math.Between(-60, 60);
            const scatterY = Phaser.Math.Between(-60, 60);
            this.tweens.add({
                targets: coin, x: startX + scatterX, y: startY + scatterY, scale: 1.2, duration: 300, ease: 'Power2',
                onComplete: () => {
                    this.tweens.add({
                        targets: coin, x: targetX, y: targetY, scale: 0.5, alpha: 0, duration: 800, ease: 'Back.in', delay: i * 50, 
                        onComplete: () => { coin.destroy(); completedCoins++; if (completedCoins === coinCount) { if (onComplete) onComplete(); } }
                    });
                }
            });
        }
    }

    createDebugStats() {
        this.debugStats = this.add.text(10, 10, '', {
            font: '14px monospace', fill: '#00ff00', backgroundColor: '#000000aa', padding: { x: 4, y: 4 }
        }).setDepth(9999).setVisible(false);
    }
    showDebugStats() { if (this.debugStats) this.debugStats.setVisible(true); }
    updateDebugStats(fps, mem) {
        if (this.debugStats && this.debugStats.visible) {
            let text = `FPS: ${Math.round(fps)}`;
            if (mem) { text += `\nMEM: ${mem} MB`; }
            this.debugStats.setText(text);
        }
    }
    updateAutoButton(isAuto) {
        if (!this.autoBtn) return;
        const bg = this.autoBtn.list[0]; const text = this.autoBtn.list[1];
        if (isAuto) { bg.setFillStyle(0x00aa00); text.setText('자동전투'); } 
        else { bg.setFillStyle(0x444444); text.setText('수동조작'); }
    }
    updateSquadButton(state) {
        if (!this.squadBtn) return;
        const bg = this.squadBtn.list[0]; const text = this.squadBtn.list[1];
        
        if (state === 'FORMATION') { 
            bg.setFillStyle(0x0088ff); 
            text.setText('대형유지'); 
        } else if (state === 'HOLD') {
            bg.setFillStyle(0x8844ff); 
            text.setText('홀드');
        } else { 
            bg.setFillStyle(0x444444); 
            text.setText('자율공격'); 
        }
    }
    updateSpeedButton(speed) {
        if (!this.speedBtn) return;
        const bg = this.speedBtn.list[0]; const text = this.speedBtn.list[1];
        text.setText(`${speed}배속`);
        if (speed === 1) bg.setFillStyle(0x444444); else if (speed === 2) bg.setFillStyle(0xaa8800); else if (speed === 3) bg.setFillStyle(0xff4444);
    }
    repositionFooterElements() {
        if (!this.footer) return;
        const width = this.scale.width;
        const centerY = this.footerHeight / 2;
        const totalBtnWidth = 360; 
        let scale = 1;
        if (width < totalBtnWidth) scale = width / totalBtnWidth;
        const btnWidth = 120 * scale;
        const startX = (width - (btnWidth * 3)) / 2 + (btnWidth / 2);
        
        if (this.autoBtn) { this.autoBtn.setScale(scale); this.autoBtn.setPosition(startX, centerY); }
        if (this.squadBtn) { this.squadBtn.setScale(scale); this.squadBtn.setPosition(startX + btnWidth, centerY); }
        if (this.speedBtn) { this.speedBtn.setScale(scale); this.speedBtn.setPosition(startX + btnWidth * 2, centerY); }
        
        const bg = this.footer.list[0];
        const border = this.footer.list[1];
        if (bg) { bg.setPosition(width/2, centerY); bg.setSize(width, this.footerHeight); }
        if (border) { border.setPosition(width/2, 0); border.setSize(width, 2); }
    }
    handleResize(gameSize) {
        const { width, height } = gameSize;
        if (this.footer) {
            this.footer.setPosition(0, height - this.footerHeight);
            this.repositionFooterElements();
        }
        if (this.startBtn) this.startBtn.setPosition(width/2, height/2);
        if (this.msgText) this.msgText.setPosition(width/2, height*0.3);
    }
    handleUIUpdate(data) {
        if (data.type === 'auto') this.updateAutoButton(data.value);
        if (data.type === 'squad') this.updateSquadButton(data.value);
        if (data.type === 'speed') this.updateSpeedButton(data.value);
    }
}