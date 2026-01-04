import Phaser from 'phaser';

export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    create() {
        this.footerHeight = 80;
        
        // 버튼 컨테이너 참조
        this.autoBtn = null;
        this.squadBtn = null;
        this.speedBtn = null;
        this.startBtn = null;
        this.msgText = null;
        this.debugStats = null;
        
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

        this.createAutoButton();
        this.createSquadButton();
        this.createSpeedButton();
        
        this.repositionFooterElements();
    }

    createAutoButton() {
        this.autoBtn = this.add.container(0, 0);
        this.autoBtn.setSize(120, 50);

        const bg = this.add.rectangle(0, 0, 120, 50, 0x444444).setStrokeStyle(2, 0xffffff);
        const text = this.add.text(0, 0, '수동조작', { fontSize: '18px', fontStyle: 'bold', fill: '#ffffff' }).setOrigin(0.5);
        
        this.autoBtn.add([bg, text]);

        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.tweens.add({ targets: this.autoBtn, scale: 0.9, duration: 50, yoyo: true });
            this.scene.get('BattleScene').toggleAutoBattle();
        });
            
        this.footer.add(this.autoBtn);
    }

    createSquadButton() {
        this.squadBtn = this.add.container(0, 0);
        this.squadBtn.setSize(120, 50);

        const bg = this.add.rectangle(0, 0, 120, 50, 0x444444).setStrokeStyle(2, 0xffffff);
        const text = this.add.text(0, 0, '자율공격', { fontSize: '18px', fontStyle: 'bold', fill: '#ffffff' }).setOrigin(0.5);
        
        this.squadBtn.add([bg, text]);

        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.tweens.add({ targets: this.squadBtn, scale: 0.9, duration: 50, yoyo: true });
            this.scene.get('BattleScene').toggleSquadState();
        });

        this.footer.add(this.squadBtn);
    }

    createSpeedButton() {
        this.speedBtn = this.add.container(0, 0);
        this.speedBtn.setSize(120, 50);

        const bg = this.add.rectangle(0, 0, 120, 50, 0x444444).setStrokeStyle(2, 0xffffff);
        const text = this.add.text(0, 0, '1배속', { fontSize: '18px', fontStyle: 'bold', fill: '#ffffff' }).setOrigin(0.5);
        
        this.speedBtn.add([bg, text]);

        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.tweens.add({ targets: this.speedBtn, scale: 0.9, duration: 50, yoyo: true });
            this.scene.get('BattleScene').toggleGameSpeed();
        });

        this.footer.add(this.speedBtn);
    }

    showStartButton(callback) {
        if (this.startBtn) this.startBtn.destroy();

        const { width, height } = this.scale;
        
        // [Fix] 모바일 화면 크기에 맞춰 버튼 크기 조절
        const btnWidth = Math.min(220, width * 0.6);
        const btnHeight = Math.min(80, height * 0.15);
        const fontSize = Math.min(28, width * 0.08);

        this.startBtn = this.add.container(width / 2, height / 2).setDepth(2000);
        
        const bg = this.add.rectangle(0, 0, btnWidth, btnHeight, 0xffffff).setStrokeStyle(4, 0xffffff);
        const text = this.add.text(0, 0, 'BATTLE START', { 
            fontSize: `${fontSize}px`, fontStyle: 'bold', fill: '#000000' 
        }).setOrigin(0.5);
        
        this.startBtn.add([bg, text]);
        
        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.tweens.add({
                targets: this.startBtn, scale: 0.9, duration: 100, yoyo: true,
                onComplete: () => {
                    this.startBtn.setVisible(false);
                    if (callback) callback();
                }
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
            const { width } = this.scale;
            // [Fix] 시작 텍스트 크기 반응형
            const fontSize = Math.min(48, width * 0.12);
            this.msgText.setFontSize(`${fontSize}px`);
            
            this.msgText.setText("BATTLE START!");
            this.msgText.setColor("#ffcc00");
            this.msgText.setAlpha(1);
            this.msgText.setScale(0.5);
            
            this.tweens.add({
                targets: this.msgText, scale: 1.2, alpha: 0, duration: 1500, ease: 'Power2'
            });
        }
    }

    // [Fix] Game Over 모달 반응형 사이즈 적용
    createGameOverUI(message, color, restartCallback) {
        const { width, height } = this.scale;
        
        // 배경 (반투명 검정)
        const bg = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.7).setDepth(2999);
        // 배경 터치 시 아무일도 안일어나게 하여(인터랙션 차단) 뒤쪽 게임 화면 클릭 방지
        bg.setInteractive(); 

        // 폰트 사이즈 계산 (반응형)
        const isMobile = width < 600;
        const titleFontSize = isMobile ? Math.floor(width * 0.1) : 64; 
        const subFontSize = isMobile ? Math.floor(width * 0.05) : 32;

        // 1. 결과 텍스트 (승리/패배) - 화면 상단부 (40% 지점)
        const text = this.add.text(width/2, height * 0.35, message, {
            fontSize: `${titleFontSize}px`, 
            fontStyle: 'bold', 
            fill: color, 
            stroke: '#ffffff', 
            strokeThickness: isMobile ? 3 : 4,
            wordWrap: { width: width * 0.9 }
        }).setOrigin(0.5).setDepth(3000);

        // 2. 재시작 버튼 - 화면 중단부 (55% 지점)
        const restartBtn = this.add.text(width/2, height * 0.55, '🔄 Tap to Restart', {
            fontSize: `${subFontSize}px`, 
            fill: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(3000).setInteractive({ useHandCursor: true });

        restartBtn.on('pointerdown', () => {
            // 효과음이나 트윈 효과 추가 가능
            this.tweens.add({
                targets: restartBtn, scale: 0.9, duration: 50, yoyo: true,
                onComplete: () => {
                    this.scene.get('BattleScene').scene.restart();
                    this.scene.restart(); 
                }
            });
        });

        // 3. [New] 피드백 남기기 버튼 - 화면 하단부 (70% 지점)
        const feedbackBtn = this.add.text(width/2, height * 0.7, '💬 피드백 남기기', {
            fontSize: `${subFontSize * 0.9}px`, // 재시작 버튼보다 살짝 작게
            fill: '#00ffff', // 눈에 띄는 색상 (Cyan)
            fontStyle: 'bold',
            backgroundColor: '#00000088', // 가독성을 위한 배경
            padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setDepth(3000).setInteractive({ useHandCursor: true });

        feedbackBtn.on('pointerdown', () => {
            this.tweens.add({
                targets: feedbackBtn, scale: 0.9, duration: 50, yoyo: true,
                onComplete: () => {
                    // 새 탭에서 링크 열기
                    window.open('https://musclecat-studio.com/thread', '_blank');
                }
            });
        });
    }

    createDebugStats() {
        this.debugStats = this.add.text(10, 10, '', {
            font: '14px monospace', fill: '#00ff00', backgroundColor: '#000000aa'
        }).setDepth(9999);
    }

    updateDebugStats(fps) {
        if (this.debugStats) this.debugStats.setText(`FPS: ${fps.toFixed(1)}`);
    }

    updateAutoButton(isAuto) {
        if (!this.autoBtn) return;
        const bg = this.autoBtn.list[0];
        const text = this.autoBtn.list[1];
        if (isAuto) { 
            bg.setFillStyle(0x00aa00); 
            text.setText('자동전투'); 
        } else { 
            bg.setFillStyle(0x444444); 
            text.setText('수동조작'); 
        }
    }

    updateSquadButton(state) {
        if (!this.squadBtn) return;
        const bg = this.squadBtn.list[0];
        const text = this.squadBtn.list[1];
        if (state === 'FORMATION') { 
            bg.setFillStyle(0x0088ff); 
            text.setText('대형유지'); 
        } else { 
            bg.setFillStyle(0x444444); 
            text.setText('자율공격'); 
        }
    }

    updateSpeedButton(speed) {
        if (!this.speedBtn) return;
        const bg = this.speedBtn.list[0];
        const text = this.speedBtn.list[1];
        
        text.setText(`${speed}배속`);
        if (speed === 1) bg.setFillStyle(0x444444);
        else if (speed === 2) bg.setFillStyle(0xaa8800);
        else if (speed === 3) bg.setFillStyle(0xff4444);
    }

    repositionFooterElements() {
        if (!this.footer) return;
        const width = this.scale.width;
        const centerY = this.footerHeight / 2;

        // 버튼 3개 너비 = 120 * 3 = 360px
        // 화면이 360px보다 작으면 버튼을 축소(Scale Down)해야 함
        const totalBtnWidth = 360; 
        let scale = 1;
        
        if (width < totalBtnWidth) {
            scale = width / totalBtnWidth;
        }

        const btnWidth = 120 * scale;
        const startX = (width - (btnWidth * 3)) / 2 + (btnWidth / 2);

        if (this.autoBtn) {
            this.autoBtn.setScale(scale);
            this.autoBtn.setPosition(startX, centerY);
        }
        if (this.squadBtn) {
            this.squadBtn.setScale(scale);
            this.squadBtn.setPosition(startX + btnWidth, centerY);
        }
        if (this.speedBtn) {
            this.speedBtn.setScale(scale);
            this.speedBtn.setPosition(startX + btnWidth * 2, centerY);
        }

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