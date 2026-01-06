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

    // [Modified] 스킬 항목 제거 및 레이아웃 조정
    createGameOverUI(data, callback) {
        const { width, height } = this.scale;
        const isWin = data.isWin;
        const title = data.title;
        const color = data.color;
        const btnText = data.btnText;
        const stats = data.stats || {}; 

        const overlay = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.85).setDepth(2999).setInteractive();

        const panelWidth = Math.min(400, width * 0.9);
        const panelHeight = Math.min(500, height * 0.8);
        const panel = this.add.container(width/2, height/2).setDepth(3000);

        const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x222222).setStrokeStyle(4, 0xffffff);
        panel.add(bg);

        const titleText = this.add.text(0, -panelHeight * 0.4, title, {
            fontSize: '48px', fontStyle: 'bold', fill: color, stroke: '#ffffff', strokeThickness: 4
        }).setOrigin(0.5);
        panel.add(titleText);

        if (isWin && stats.score !== undefined) {
            const startY = -panelHeight * 0.2;
            const gapY = 50; // 간격을 약간 넓힘
            const labelStyle = { fontSize: '20px', fill: '#aaaaaa' };
            const valStyle = { fontSize: '20px', fill: '#ffffff', fontStyle: 'bold' };

            // 1. 클리어 시간
            const timeStr = `${Math.floor(stats.time / 60)}m ${stats.time % 60}s`;
            const l1 = this.add.text(-panelWidth*0.4, startY, "클리어 시간", labelStyle).setOrigin(0, 0.5);
            const v1 = this.add.text(panelWidth*0.4, startY, timeStr, valStyle).setOrigin(1, 0.5);
            
            // 2. 생존 유닛
            const l2 = this.add.text(-panelWidth*0.4, startY + gapY, "생존 유닛", labelStyle).setOrigin(0, 0.5);
            const v2 = this.add.text(panelWidth*0.4, startY + gapY, `${stats.survivors}`, valStyle).setOrigin(1, 0.5);

            panel.add([l1, v1, l2, v2]);

            // 구분선
            const line = this.add.rectangle(0, startY + gapY*1.8, panelWidth * 0.8, 2, 0x555555);
            panel.add(line);

            // 3. 최종 점수 & 랭크
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

        const btnY = panelHeight * 0.4;
        const btnBg = this.add.rectangle(0, btnY, 200, 60, 0x4444ff).setStrokeStyle(2, 0xffffff);
        const btnTxt = this.add.text(0, btnY, btnText, { fontSize: '24px', fontStyle: 'bold' }).setOrigin(0.5);
        
        const btnContainer = this.add.container(0, 0, [btnBg, btnTxt]);
        btnBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.tweens.add({
                targets: btnContainer, scale: 0.9, duration: 50, yoyo: true,
                onComplete: () => {
                    if (callback) callback();
                    this.scene.restart();
                }
            });
        });
        
        panel.add(btnContainer);

        panel.setScale(0);
        this.tweens.add({
            targets: panel, scale: 1, duration: 400, ease: 'Back.out'
        });
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
    }

    handleUIUpdate(data) {
        if (data.type === 'auto') this.updateAutoButton(data.value);
        if (data.type === 'squad') this.updateSquadButton(data.value);
        if (data.type === 'speed') this.updateSpeedButton(data.value);
    }
}