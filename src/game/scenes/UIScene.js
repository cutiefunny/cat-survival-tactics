import Phaser from 'phaser';
import GameOverModal from '../ui/GameOverModal'; 

export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    create() {
        this.footerHeight = 80;
        
        // 버튼 및 UI 요소 참조 초기화
        this.autoBtn = null;
        this.squadBtn = null;
        this.itemBtn = null; // 아이템 버튼 참조 추가
        this.speedBtn = null;
        this.startBtn = null;
        this.msgText = null;
        this.debugStats = null;
        this._battleSceneCache = null; // BattleScene 캐시
        
        this.gameOverModal = new GameOverModal(this);

        // BattleScene으로부터 UI 업데이트 이벤트 수신 설정
        const battleScene = this.scene.get('BattleScene');
        this._battleSceneCache = battleScene; // 캐시 저장
        if (battleScene) {
            battleScene.events.off('updateUI'); 
            battleScene.events.on('updateUI', this.handleUIUpdate, this);
        }
        
        this.createFooter();
        this.createGameMessages();
        this.createDebugStats();
        
        // 리사이즈 이벤트 대응
        this.scale.on('resize', this.handleResize, this);
        this.handleResize(this.scale.gameSize);
    }

    getBattleScene() {
        if (!this._battleSceneCache || !this._battleSceneCache.scene.isActive()) {
            this._battleSceneCache = this.scene.get('BattleScene');
        }
        return this._battleSceneCache;
    }

    createFooter() {
        const { width, height } = this.scale;
        
        // 하단 바 컨테이너 생성
        this.footer = this.add.container(0, height - this.footerHeight);

        // 배경 및 상단 경계선 (검은색 배경으로 복구)
        const bg = this.add.rectangle(width / 2, this.footerHeight / 2, width, this.footerHeight, 0xffffff, 0.85);
        const border = this.add.rectangle(width / 2, 0, width, 2, 0xffffff, 0.3);
        
        // 1. 자동전투 버튼
        this.autoBtn = this.add.image(0, this.footerHeight / 2, 'auto')
            .setInteractive({ useHandCursor: true })
            .setTint(0x808080);
        
        this.autoBtn.on('pointerdown', () => {
            const battleScene = this.getBattleScene();
            if (battleScene) {
                this.addClickEffect(this.autoBtn);
                battleScene.toggleAutoBattle();
            }
        });

        // 2. 부대 명령 버튼
        this.squadBtn = this.add.image(0, this.footerHeight / 2, 'attack')
            .setInteractive({ useHandCursor: true });
        
        this.squadBtn.on('pointerdown', () => {
            const battleScene = this.getBattleScene();
            if (battleScene) {
                this.addClickEffect(this.squadBtn);
                battleScene.toggleSquadState();
            }
        });

        // 3. 아이템 버튼 (새로 추가된 세 번째 버튼)
        this.itemBtn = this.add.image(0, this.footerHeight / 2, 'item')
            .setInteractive({ useHandCursor: true });
        
        this.itemBtn.on('pointerdown', () => {
            const battleScene = this.getBattleScene();
            if (battleScene && battleScene.uiManager && battleScene.uiManager.itemModal) {
                this.addClickEffect(this.itemBtn);
                battleScene.uiManager.itemModal.toggle();
            }
        });

        // 4. 배속 버튼 (네 번째 자리로 이동)
        this.speedBtn = this.add.image(0, this.footerHeight / 2, '1x')
            .setInteractive({ useHandCursor: true });
        
        this.speedBtn.on('pointerdown', () => {
            const battleScene = this.getBattleScene();
            if (battleScene) {
                this.addClickEffect(this.speedBtn);
                battleScene.toggleGameSpeed();
            }
        });
        
        // 컨테이너에 모든 요소 추가
        this.footer.add([bg, border, this.autoBtn, this.squadBtn, this.itemBtn, this.speedBtn]);
        this.repositionFooterElements();
    }

    addClickEffect(target) {
        this.tweens.add({
            targets: target,
            scale: 0.9,
            duration: 50,
            yoyo: true
        });
    }

    repositionFooterElements() {
        if (!this.footer) return;
        const width = this.scale.width;
        const buttonCount = 4; // 버튼 개수 4개로 증가
        const spacing = width / (buttonCount + 1);
        const centerY = this.footerHeight / 2;

        // 버튼 위치 균등 분할 배치 (1~4번)
        if (this.autoBtn) this.autoBtn.setX(spacing);
        if (this.squadBtn) this.squadBtn.setX(spacing * 2);
        if (this.itemBtn) this.itemBtn.setX(spacing * 3);
        if (this.speedBtn) this.speedBtn.setX(spacing * 4);

        const bg = this.footer.list[0];
        const border = this.footer.list[1];
        if (bg) { 
            bg.setPosition(width/2, centerY); 
            bg.setSize(width, this.footerHeight); 
        }
        if (border) { 
            border.setPosition(width/2, 0); 
            border.setSize(width, 2); 
        }
    }

    handleUIUpdate(data) {
        const { type, value } = data;
        switch (type) {
            case 'auto':
                this.updateAutoButton(value);
                break;
            case 'squad':
                this.updateSquadButton(value);
                break;
            case 'speed':
                this.updateSpeedButton(value);
                break;
        }
    }

    updateAutoButton(isAuto) {
        if (!this.autoBtn) return;
        this.autoBtn.setTint(isAuto ? 0x80ff80 : 0x808080);
    }

    updateSquadButton(state) {
        if (!this.squadBtn) return;
        const lowerState = state.toLowerCase();
        let key = 'attack';
        if (lowerState === 'formation' || lowerState === 'idle') key = 'idle';
        else if (lowerState === 'hold' || lowerState === 'stop') key = 'stop';
        this.squadBtn.setTexture(key);
    }

    updateSpeedButton(speed) {
        if (!this.speedBtn) return;
        this.speedBtn.setTexture(`${speed}x`);
    }

    showStartButton(callback) {
        if (!this.add || !this.scale || !this.tweens) {
            console.warn('UIScene not ready for showStartButton');
            return;
        }
        if (this.startBtn) this.startBtn.destroy();
        const { width, height } = this.scale;
        this.startBtn = this.add.container(width / 2, height / 2).setDepth(2000);
        if (!this.startBtn) return;
        const bg = this.add.rectangle(0, 0, 220, 80, 0xffffff).setStrokeStyle(4, 0xffffff).setInteractive({ useHandCursor: true });
        const text = this.add.text(0, 0, 'BATTLE START', { fontSize: '28px', fontStyle: 'bold', fill: '#000000' }).setOrigin(0.5);
        if (!bg || !text) return;
        this.startBtn.add([bg, text]);
        bg.on('pointerdown', () => {
            if (!this.tweens || !this.startBtn) return;
            this.tweens.add({
                targets: this.startBtn, scale: 0.9, duration: 100, yoyo: true,
                onComplete: () => { 
                    if (this.startBtn) this.startBtn.setVisible(false); 
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
            this.msgText.setText("BATTLE START!").setColor("#ffcc00").setAlpha(1).setScale(0.5);
            this.tweens.add({ targets: this.msgText, scale: 1.2, alpha: 0, duration: 1500, ease: 'Power2' });
        }
    }

    createGameOverUI(data, callback) {
        if (this.gameOverModal) {
            this.gameOverModal.show(data, callback);
        }
    }

    showRetreatModal(onConfirm, onCancel) {
        const { width, height } = this.scale;
        const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6).setInteractive().setDepth(3000);
        const modal = this.add.container(width / 2, height / 2).setDepth(3001);
        const panel = this.add.rectangle(0, 0, 400, 250, 0x222222).setStrokeStyle(3, 0xffaa00);
        const title = this.add.text(0, -60, "전장에서 이탈하시겠습니까?", { fontSize: '22px', fontStyle: 'bold' }).setOrigin(0.5);
        
        const createBtn = (x, y, txt, clr, cb) => {
            const btn = this.add.container(x, y);
            const bBg = this.add.rectangle(0, 0, 140, 50, clr).setInteractive({ useHandCursor: true }).setStrokeStyle(2, 0xffffff);
            const bTxt = this.add.text(0, 0, txt, { fontSize: '20px' }).setOrigin(0.5);
            btn.add([bBg, bTxt]);
            bBg.on('pointerdown', () => { 
                bg.destroy(); 
                modal.destroy(); 
                if (cb) cb(); 
            });
            return btn;
        };
        modal.add([panel, title, createBtn(-90, 70, "후퇴", 0xcc4444, onConfirm), createBtn(90, 70, "취소", 0x444444, onCancel)]);
    }

    playCoinAnimation(startX, startY, amount, onComplete) {
        if (amount > 0) {
            const txt = this.add.text(startX, startY, `+${amount}냥`, { fontSize: '64px', color: '#ffd700' }).setOrigin(0.5).setDepth(4001);
            this.tweens.add({ targets: txt, y: startY - 80, alpha: 0, duration: 1500, onComplete: () => txt.destroy() });
        }
        if (onComplete) onComplete();
    }

    createDebugStats() { 
        this.debugStats = this.add.text(10, 10, '', { 
            font: '14px monospace', fill: '#00ff00', backgroundColor: '#000000aa' 
        }).setDepth(9999).setVisible(false); 
    }
    
    showDebugStats() { if (this.debugStats) this.debugStats.setVisible(true); }
    
    updateDebugStats(fps, mem) { 
        if (this.debugStats && this.debugStats.visible) {
            this.debugStats.setText(`FPS: ${Math.round(fps)}${mem ? `\nMEM: ${mem} MB` : ''}`); 
        }
    }

    handleResize(gameSize) {
        const { width, height } = gameSize;
        if (this.footer) {
            this.footer.setPosition(0, height - this.footerHeight);
            this.repositionFooterElements();
        }
        if (this.startBtn) this.startBtn.setPosition(width/2, height/2);
    }
}