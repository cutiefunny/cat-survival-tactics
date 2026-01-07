import Phaser from 'phaser';

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
        this.shopContainer = null;
        this.coinText = null;
        
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

    // [Modified] 상점 UI 생성
    createShopUI(unitData, currentCoins, onBuyCallback) {
        if (this.shopContainer) this.shopContainer.destroy();

        const { width } = this.scale;
        const isMobile = width < 600; 
        const panelHeight = isMobile ? 60 : 80; 
        
        this.shopContainer = this.add.container(0, 0);
        
        const bg = this.add.rectangle(width/2, panelHeight/2, width, panelHeight, 0x000000, 0.7);
        const border = this.add.rectangle(width/2, panelHeight, width, 2, 0xffcc00, 0.5);
        this.shopContainer.add([bg, border]);

        const fontSize = isMobile ? '16px' : '24px';
        const coinString = isMobile ? `${currentCoins}냥` : `💰 ${currentCoins}냥`;
        
        this.coinText = this.add.text(0, panelHeight/2, coinString, {
            fontSize: fontSize, fontStyle: 'bold', fill: '#ffdd00', stroke: '#000000', strokeThickness: 3
        }).setOrigin(1, 0.5); 
        this.shopContainer.add(this.coinText);

        const btnW = isMobile ? 40 : 80;   
        const btnH = isMobile ? 40 : 50;
        
        unitData.forEach((unit, index) => {
            const btn = this.add.container(0, panelHeight / 2);
            
            const btnBg = this.add.rectangle(0, 0, btnW, btnH, 0x333333).setStrokeStyle(1, 0xaaaaaa);
            
            const nameSize = isMobile ? '10px' : '12px';
            const costSize = isMobile ? '11px' : '14px';
            
            const nameText = this.add.text(0, isMobile ? -8 : -10, unit.name, { fontSize: nameSize, fill: '#ffffff' }).setOrigin(0.5);
            const costText = this.add.text(0, isMobile ? 8 : 10, `${unit.cost}냥`, { fontSize: costSize, fill: '#ffff00', fontStyle: 'bold' }).setOrigin(0.5);
            
            btn.add([btnBg, nameText, costText]);
            
            btnBg.setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this.tweens.add({ targets: btn, scale: 0.9, duration: 50, yoyo: true });
                    if(onBuyCallback) onBuyCallback(unit.role, unit.cost);
                });

            this.shopContainer.add(btn);
        });
        
        this.repositionShopElements();
    }

    repositionShopElements() {
        if (!this.shopContainer || !this.shopContainer.visible) return;
        const { width } = this.scale;
        const isMobile = width < 600;
        
        let scale = 1;
        if (width >= 600 && width < 800) {
            scale = width / 800;
        } else if (width < 600) {
            if (width < 360) scale = width / 360; 
            else scale = 1; 
        }
        this.shopContainer.setScale(scale);

        const effectiveWidth = width / scale;
        const bg = this.shopContainer.list[0];
        const border = this.shopContainer.list[1];
        const panelHeight = bg ? bg.height : (isMobile ? 60 : 80);

        if (bg) {
            bg.setPosition(effectiveWidth / 2, panelHeight/2);
            bg.setSize(effectiveWidth, panelHeight);
        }
        if (border) {
            border.setPosition(effectiveWidth / 2, panelHeight);
            border.setSize(effectiveWidth, 2);
        }

        if (this.coinText) {
            const padding = isMobile ? 10 : 20;
            this.coinText.setPosition(effectiveWidth - padding, panelHeight / 2);
        }

        const buttons = this.shopContainer.list.slice(3);
        if (buttons.length > 0) {
            const btnW = isMobile ? 40 : 80;
            const btnGap = isMobile ? 45 : 90; 
            
            let startX;

            if (isMobile) {
                startX = 10 + (btnW / 2);
            } else {
                const totalGroupWidth = (buttons.length - 1) * btnGap;
                startX = (effectiveWidth / 2) - (totalGroupWidth / 2);
            }

            buttons.forEach((btn, index) => {
                btn.setPosition(startX + (index * btnGap), panelHeight / 2);
                const btnBg = btn.list[0];
                const btnH = isMobile ? 40 : 50;
                if (btnBg) {
                    btnBg.setSize(btnW, btnH);
                }
            });
        }
    }

    updateCoins(amount) {
        if (this.coinText) {
            const isMobile = this.scale.width < 600;
            const coinString = isMobile ? `${amount}냥` : `💰 ${amount}냥`;
            this.coinText.setText(coinString);
            this.tweens.add({ targets: this.coinText, scale: 1.2, duration: 100, yoyo: true });
        }
    }

    hideShopUI() {
        if (this.shopContainer) {
            this.tweens.add({
                targets: this.shopContainer,
                y: -100,
                alpha: 0,
                duration: 500,
                onComplete: () => {
                    this.shopContainer.setVisible(false);
                }
            });
        }
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

    createGameOverUI(data, callback) {
        const { width, height } = this.scale;
        const isWin = data.isWin;
        const title = data.title;
        const color = data.color;
        const btnText = data.btnText;
        const stats = data.stats || {}; 

        const overlay = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.85).setDepth(2999).setInteractive();

        const panelWidth = Math.min(400, width * 0.9);
        const panelHeight = Math.min(600, height * 0.9); 
        const panel = this.add.container(width/2, height/2).setDepth(3000);

        const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x222222).setStrokeStyle(4, 0xffffff);
        panel.add(bg);

        const titleText = this.add.text(0, -panelHeight * 0.4, title, {
            fontSize: '48px', fontStyle: 'bold', fill: color, stroke: '#ffffff', strokeThickness: 4
        }).setOrigin(0.5);
        panel.add(titleText);

        if (isWin && stats.score !== undefined) {
            const startY = -panelHeight * 0.25;
            const gapY = 40; 
            const labelStyle = { fontSize: '20px', fill: '#aaaaaa' };
            const valStyle = { fontSize: '20px', fill: '#ffffff', fontStyle: 'bold' };

            const timeStr = `${Math.floor(stats.time / 60)}m ${stats.time % 60}s`;
            const l1 = this.add.text(-panelWidth*0.4, startY, "클리어 시간", labelStyle).setOrigin(0, 0.5);
            const v1 = this.add.text(panelWidth*0.4, startY, timeStr, valStyle).setOrigin(1, 0.5);
            
            const l2 = this.add.text(-panelWidth*0.4, startY + gapY, "생존 유닛", labelStyle).setOrigin(0, 0.5);
            const v2 = this.add.text(panelWidth*0.4, startY + gapY, `${stats.survivors}`, valStyle).setOrigin(1, 0.5);

            panel.add([l1, v1, l2, v2]);

            const line = this.add.rectangle(0, startY + gapY*1.8, panelWidth * 0.8, 2, 0x555555);
            panel.add(line);

            const scoreLabel = this.add.text(0, startY + gapY*3, "TOTAL SCORE", { fontSize: '16px', fill: '#888888' }).setOrigin(0.5);
            const scoreVal = this.add.text(0, startY + gapY*4, `${stats.score}`, { fontSize: '36px', fill: '#ffff00', fontStyle: 'bold' }).setOrigin(0.5);
            
            const rankText = this.add.text(0, startY + gapY*6, `RANK ${stats.rank}`, { 
                fontSize: '48px', fill: stats.rank === 'S' ? '#ff00ff' : (stats.rank === 'A' ? '#00ff00' : '#ffffff'), 
                fontStyle: 'bold', stroke: '#000000', strokeThickness: 6 
            }).setOrigin(0.5);
            
            this.tweens.add({
                targets: rankText, scale: { from: 2, to: 1 }, alpha: { from: 0, to: 1 }, duration: 500, ease: 'Bounce'
            });

            panel.add([scoreLabel, scoreVal, rankText]);
        }

        const btnY = panelHeight * 0.3; 
        const btnBg = this.add.rectangle(0, btnY, 200, 50, 0x4444ff).setStrokeStyle(2, 0xffffff);
        const btnTxt = this.add.text(0, btnY, btnText, { fontSize: '22px', fontStyle: 'bold' }).setOrigin(0.5);
        
        const btnContainer = this.add.container(0, 0, [btnBg, btnTxt]);
        
        btnBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.tweens.add({
                targets: btnContainer, scale: 0.9, duration: 50, yoyo: true,
                onComplete: () => {
                    if (isWin && btnText.includes("Next")) {
                        // [Fix] BattleScene에서 호출하던 로직을 여기서 처리하도록 변경
                        if (callback) callback();
                    } else {
                        if (callback) callback();
                        this.scene.restart();
                    }
                }
            });
        });
        
        panel.add(btnContainer);

        const feedbackY = btnY + 70; 
        const fbBg = this.add.rectangle(0, feedbackY, 200, 40, 0x333333).setStrokeStyle(1, 0xaaaaaa);
        const fbTxt = this.add.text(0, feedbackY, "피드백 남기기", { fontSize: '16px', fill: '#ffffff' }).setOrigin(0.5);
        
        const fbContainer = this.add.container(0, 0, [fbBg, fbTxt]);
        
        fbBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.tweens.add({ targets: fbContainer, scale: 0.9, duration: 50, yoyo: true });
            window.open('https://musclecat-studio.com/thread', '_blank');
        });

        panel.add(fbContainer);

        panel.setScale(0);
        this.tweens.add({
            targets: panel, scale: 1, duration: 400, ease: 'Back.out'
        });
    }

    // [New] 코인 획득 애니메이션 (우측 상단 UI 방향)
    playCoinAnimation(startX, startY, amount, onComplete) {
        const coinCount = 10; 
        
        // 목표 지점: 우측 상단 UI의 코인 텍스트 위치 (대략적인 값, scale 고려)
        const targetX = this.scale.width - 50;   
        const targetY = 50; 
        
        // 1. 획득 금액 텍스트 (화면 중앙 시작)
        if (amount > 0) {
            const amountText = this.add.text(startX, startY, `+${amount}냥`, { 
                fontSize: '64px', color: '#ffd700', stroke: '#000000', strokeThickness: 4, fontStyle: 'bold' 
            }).setOrigin(0.5).setDepth(4001);

            this.tweens.add({
                targets: amountText,
                y: startY - 80,
                alpha: 0,
                duration: 1500,
                ease: 'Power2',
                onComplete: () => amountText.destroy()
            });
        }

        let completedCoins = 0;

        for (let i = 0; i < coinCount; i++) {
            const coin = this.add.text(startX, startY, '💰', { fontSize: '32px' }).setOrigin(0.5).setDepth(4000);
            
            // 흩뿌려지는 효과
            const scatterX = Phaser.Math.Between(-60, 60);
            const scatterY = Phaser.Math.Between(-60, 60);

            this.tweens.add({
                targets: coin,
                x: startX + scatterX,
                y: startY + scatterY,
                scale: 1.2,
                duration: 300,
                ease: 'Power2',
                onComplete: () => {
                    // 우측 상단으로 날아가기
                    this.tweens.add({
                        targets: coin,
                        x: targetX,
                        y: targetY,
                        scale: 0.5,
                        alpha: 0,
                        duration: 800,
                        ease: 'Back.in',
                        delay: i * 50, 
                        onComplete: () => {
                            coin.destroy();
                            completedCoins++;
                            if (completedCoins === coinCount) {
                                if (onComplete) onComplete();
                            }
                        }
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

    showDebugStats() {
        if (this.debugStats) this.debugStats.setVisible(true);
    }

    updateDebugStats(fps, mem) {
        if (this.debugStats && this.debugStats.visible) {
            let text = `FPS: ${Math.round(fps)}`;
            if (mem) {
                text += `\nMEM: ${mem} MB`;
            }
            this.debugStats.setText(text);
        }
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
        
        if (this.shopContainer && this.shopContainer.visible) {
             this.repositionShopElements();
        }
    }

    handleUIUpdate(data) {
        if (data.type === 'auto') this.updateAutoButton(data.value);
        if (data.type === 'squad') this.updateSquadButton(data.value);
        if (data.type === 'speed') this.updateSpeedButton(data.value);
    }
}