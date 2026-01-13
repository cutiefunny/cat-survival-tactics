export default class GameOverModal {
    constructor(scene) {
        this.scene = scene;
        this.overlay = null;
        this.panel = null;
    }

    show(data, callback) {
        this.destroy();

        const { width, height } = this.scene.scale;
        const isWin = data.isWin;
        const title = data.title;
        const color = data.color;
        const btnText = data.btnText;
        const stats = data.stats || {}; 

        // 1. 배경 오버레이
        this.overlay = this.scene.add.rectangle(width/2, height/2, width, height, 0x000000, 0.85)
            .setDepth(2999)
            .setInteractive();

        // 2. 패널
        const panelWidth = Math.min(450, width * 0.95);
        const panelHeight = Math.min(600, height * 0.9); 
        this.panel = this.scene.add.container(width/2, height/2).setDepth(3000);

        const bg = this.scene.add.rectangle(0, 0, panelWidth, panelHeight, 0x222222)
            .setStrokeStyle(4, isWin ? 0xffd700 : 0xff4444);
        this.panel.add(bg);

        // 타이틀
        const titleText = this.scene.add.text(0, -panelHeight/2 + 50, title, { 
            fontSize: '42px', fontStyle: 'bold', fill: color, stroke: '#ffffff', strokeThickness: 4 
        }).setOrigin(0.5);
        this.panel.add(titleText);

        let currentY = -panelHeight/2 + 100;
        const gapY = 30;

        // [New] 1. 획득 코인 표시
        if (isWin && stats.rewardCoins > 0) {
            const coinText = this.scene.add.text(0, currentY, `💰 획득: +${stats.rewardCoins}냥`, { 
                fontSize: '28px', color: '#ffff00', fontStyle: 'bold' 
            }).setOrigin(0.5);
            this.panel.add(coinText);
            currentY += 50;
        }

        // [New] 2. 레벨업 아군 목록
        if (stats.leveledUpUnits && stats.leveledUpUnits.length > 0) {
            const lvTitle = this.scene.add.text(0, currentY, "- LEVEL UP! -", { 
                fontSize: '20px', color: '#00ff00', fontStyle: 'bold' 
            }).setOrigin(0.5);
            this.panel.add(lvTitle);
            currentY += 30;

            stats.leveledUpUnits.forEach(u => {
                const txt = this.scene.add.text(0, currentY, `${u.name} (${u.role}): Lv.${u.oldLevel} ➡ Lv.${u.newLevel}`, { 
                    fontSize: '18px', color: '#ccffcc' 
                }).setOrigin(0.5);
                this.panel.add(txt);
                currentY += 25;
            });
            currentY += 15;
        }

        // [New] 3. 사망 아군 목록
        if (stats.deadUnits && stats.deadUnits.length > 0) {
            const deadTitle = this.scene.add.text(0, currentY, "- KIA (전사) -", { 
                fontSize: '20px', color: '#ff4444', fontStyle: 'bold' 
            }).setOrigin(0.5);
            this.panel.add(deadTitle);
            currentY += 30;

            stats.deadUnits.forEach(u => {
                const txt = this.scene.add.text(0, currentY, `💀 ${u.name} (${u.role})`, { 
                    fontSize: '18px', color: '#aaaaaa' 
                }).setOrigin(0.5);
                this.panel.add(txt);
                currentY += 25;
            });
            currentY += 15;
        }

        // 버튼 영역
        const btnY = panelHeight/2 - 60; 
        const btnBg = this.scene.add.rectangle(0, btnY, 220, 50, 0x4444ff).setStrokeStyle(2, 0xffffff);
        const btnTxt = this.scene.add.text(0, btnY, btnText, { fontSize: '24px', fontStyle: 'bold' }).setOrigin(0.5);
        const btnContainer = this.scene.add.container(0, 0, [btnBg, btnTxt]);

        btnBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.scene.tweens.add({
                targets: btnContainer, scale: 0.9, duration: 50, yoyo: true,
                onComplete: () => {
                    this.destroy();
                    if (callback) callback(); 
                    else if (!btnText.includes("Next")) {
                        this.scene.scene.get('BattleScene').restart();
                    }
                }
            });
        });
        this.panel.add(btnContainer);

        // 등장 애니메이션
        this.panel.setScale(0);
        this.scene.tweens.add({ targets: this.panel, scale: 1, duration: 400, ease: 'Back.out' });
    }

    destroy() {
        if (this.panel) {
            this.panel.destroy();
            this.panel = null;
        }
        if (this.overlay) {
            this.overlay.destroy();
            this.overlay = null;
        }
    }
}