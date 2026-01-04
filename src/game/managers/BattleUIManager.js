import { addDoc, collection } from "firebase/firestore";
import { db } from "../../firebaseConfig";

export default class BattleUIManager {
    constructor(scene) {
        this.scene = scene;
        this.loadingText = null;
        this.debugText = null;
        this.startButton = null;
        this.infoText = null;
        this.battleText = null;
        this.autoBattleBtn = null;
        this.squadBtn = null; 
        this.speedBtn = null; // [New] 속도 버튼
        this.feedbackDOM = null;
    }

    createLoadingText() {
        this.loadingText = this.scene.add.text(this.scene.cameras.main.centerX, this.scene.cameras.main.centerY, 'Loading Tactics Config...', {
            fontSize: '40px', fill: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0);
    }

    destroyLoadingText() {
        if (this.loadingText) this.loadingText.destroy();
    }

    createDebugStats() {
        this.debugText = this.scene.add.text(this.scene.cameras.main.width - 10, this.scene.cameras.main.height - 10, '', {
            font: '14px monospace',
            fill: '#00ff00',
            backgroundColor: '#000000aa',
            padding: { x: 6, y: 4 },
            align: 'right'
        }).setOrigin(1, 1).setScrollFactor(0).setDepth(9999);
    }

    updateDebugStats(loop) {
        if (this.debugText) {
            const fps = loop.actualFps.toFixed(1);
            let mem = '';
            if (window.performance && window.performance.memory) {
                mem = `Mem: ${(window.performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`;
            }
            this.debugText.setText(`FPS: ${fps}\n${mem}`);
        }
    }

    createStartButton(callback) {
        const { width, height } = this.scene.scale;

        // [CHANGE] 버튼 스타일로 변경 및 크기 축소
        this.startBtn = this.scene.add.text(width / 2, height / 2, "CLICK TO START", {
            fontSize: '24px',          // 글자 크기 축소 (기존 대비 작게)
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#ffffff',
            backgroundColor: '#000000', // 검은 배경 (버튼 느낌)
            padding: { x: 20, y: 10 },  // 내부 여백
            stroke: '#ffffff',          // 테두리 효과
            strokeThickness: 2
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(1000); // 최상단 노출

        // 호버 효과 (마우스 올리면 노란색)
        this.startBtn.on('pointerover', () => this.startBtn.setStyle({ fill: '#ffd700', stroke: '#ffd700' }));
        this.startBtn.on('pointerout', () => this.startBtn.setStyle({ fill: '#ffffff', stroke: '#ffffff' }));

        // 클릭 이벤트
        this.startBtn.on('pointerdown', () => {
            // 클릭 시 살짝 눌리는 애니메이션
            this.scene.tweens.add({
                targets: this.startBtn,
                scaleX: 0.9, scaleY: 0.9,
                duration: 50,
                yoyo: true,
                onComplete: () => {
                    this.startBtn.destroy(); // 버튼 제거
                    this.startBtn = null;
                    callback(); // 게임 시작 콜백 실행
                }
            });
        });

        // 둥둥 떠있는 대기 애니메이션
        this.scene.tweens.add({
            targets: this.startBtn,
            scaleX: 1.05, scaleY: 1.05,
            duration: 800,
            yoyo: true,
            repeat: -1
        });
        
        // cleanupBeforeBattle에서 참조할 수 있도록 startText 대신 startBtn 사용 시 주의 (또는 둘 다 할당)
        this.startText = this.startBtn; 
    }

    createGameMessages() {
        this.infoText = this.scene.add.text(this.scene.cameras.main.centerX, 50, '', {
            fontSize: '24px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5).setVisible(false).setScrollFactor(0); 

        this.battleText = this.scene.add.text(this.scene.cameras.main.centerX, this.scene.cameras.main.centerY, 'FIGHT!', {
            fontSize: '80px', fill: '#ff0000', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 8
        }).setOrigin(0.5).setAlpha(0).setScrollFactor(0); 
    }

    createAutoBattleButton(callback) {
        const x = 100;
        const y = this.scene.cameras.main.height - 80;

        this.autoBattleBtn = this.scene.add.text(x, y, 'AUTO: OFF', {
            fontSize: '24px', fill: '#ffffff', backgroundColor: '#ff0000', padding: { x: 10, y: 8 }, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setInteractive().setDepth(200);

        this.autoBattleBtn.on('pointerdown', callback);
    }

    createSquadButton(callback) {
        const x = 280; 
        const y = this.scene.cameras.main.height - 80;

        this.squadBtn = this.scene.add.text(x, y, '전술: 자율', {
            fontSize: '24px', fill: '#ffffff', backgroundColor: '#4488ff', padding: { x: 10, y: 8 }, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setInteractive().setDepth(200);

        this.squadBtn.on('pointerdown', callback);
    }

    // [New] 속도 조절 버튼 생성
    createSpeedButton(callback) {
        const x = 460; // Squad 버튼(280) 우측 배치
        const y = this.scene.cameras.main.height - 80;

        this.speedBtn = this.scene.add.text(x, y, '속도: 1x', {
            fontSize: '24px', fill: '#ffffff', backgroundColor: '#666666', padding: { x: 10, y: 8 }, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setInteractive().setDepth(200);

        this.speedBtn.on('pointerdown', callback);
    }

    updateAutoButton(isAuto) {
        if (this.autoBattleBtn) {
            if (isAuto) {
                this.autoBattleBtn.setText('AUTO: ON');
                this.autoBattleBtn.setStyle({ backgroundColor: '#00aa00' });
            } else {
                this.autoBattleBtn.setText('AUTO: OFF');
                this.autoBattleBtn.setStyle({ backgroundColor: '#ff0000' });
            }
        }
    }

    updateSquadButton(state) {
        if (!this.squadBtn) return;
        
        switch (state) {
            case 'FREE':
                this.squadBtn.setText('전술: 자율');
                this.squadBtn.setStyle({ backgroundColor: '#4488ff' }); 
                break;
            case 'FORMATION':
                this.squadBtn.setText('전술: 대열');
                this.squadBtn.setStyle({ backgroundColor: '#aa44ff' }); 
                break;
            case 'FLEE':
                this.squadBtn.setText('전술: 도망');
                this.squadBtn.setStyle({ backgroundColor: '#ffaa00' }); 
                break;
        }
    }

    // [New] 속도 버튼 텍스트 업데이트
    updateSpeedButton(speed) {
        if (this.speedBtn) {
            this.speedBtn.setText(`속도: ${speed}x`);
            // 속도가 빠를수록 색상을 더 밝거나 강렬하게 변경 (선택사항)
            const colors = { 1: '#666666', 2: '#888800', 3: '#cc0000' };
            this.speedBtn.setStyle({ backgroundColor: colors[speed] || '#666666' });
        }
    }

    cleanupBeforeBattle() {
        if (this.startButton) this.startButton.destroy();
        this.infoText.setVisible(true);
        this.infoText.setText('Move Leader! Squad will follow.');
    }

    showStartAnimation() {
        this.infoText.setText("FIGHT!");
        this.battleText.setAlpha(1);
        this.scene.tweens.add({ targets: this.battleText, alpha: 0, duration: 1000, ease: 'Power2' });
    }

    updateScore(blueCount, redCount) {
        this.infoText.setText(`Blue: ${blueCount} vs Red: ${redCount}`);
    }

    createGameOverUI(message, color, restartCallback) {
        if (this.infoText) this.infoText.setVisible(false);
        if (this.autoBattleBtn) this.autoBattleBtn.setVisible(false);
        if (this.squadBtn) this.squadBtn.setVisible(false);
        if (this.speedBtn) this.speedBtn.setVisible(false); // 버튼 숨김

        const cx = this.scene.cameras.main.centerX;
        const cy = this.scene.cameras.main.centerY;

        this.scene.add.rectangle(cx, cy, this.scene.cameras.main.width, this.scene.cameras.main.height, 0x000000, 0.7)
            .setScrollFactor(0).setDepth(100);

        this.scene.add.rectangle(cx, cy, 600, 500, 0x222222)
            .setStrokeStyle(4, 0xffffff).setScrollFactor(0).setDepth(101);

        this.scene.add.text(cx, cy - 180, message, {
            fontSize: '50px', fill: color, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(102);

        const restartBtn = this.scene.add.text(cx, cy - 80, 'Restart Game', {
            fontSize: '32px', fill: '#ffffff', backgroundColor: '#00aa00', padding: { x: 20, y: 15 }
        }).setOrigin(0.5).setInteractive().setScrollFactor(0).setDepth(102);

        restartBtn.on('pointerdown', () => {
            if (this.feedbackDOM) this.feedbackDOM.destroy();
            restartCallback();
        });

        this.createFeedbackForm(cx, cy);
    }

    createFeedbackForm(cx, cy) {
        const div = document.createElement('div');
        div.style = "display: flex; flex-direction: column; align-items: center; gap: 10px;";
        div.innerHTML = `
            <textarea name="feedback" placeholder="Leave your feedback..." 
                style="font-size: 18px; padding: 10px; width: 400px; height: 120px; 
                border-radius: 5px; border: none; outline: none; resize: none; font-family: monospace;"></textarea>
            <button name="submitBtn" 
                style="font-size: 20px; padding: 10px 20px; background-color: #444444; color: white; border: 1px solid white; cursor: pointer; border-radius: 5px;">
                Submit Feedback
            </button>
        `;

        this.feedbackDOM = this.scene.add.dom(cx, cy + 100, div).setScrollFactor(0).setDepth(102);

        const textarea = div.querySelector('textarea');
        if(textarea) {
            textarea.addEventListener('keydown', (e) => e.stopPropagation());
            textarea.addEventListener('touchstart', (e) => e.target.focus());
        }
            
        this.feedbackDOM.addListener('click');
        this.feedbackDOM.on('click', async (event) => {
            if (event.target.name === 'submitBtn') {
                const input = div.querySelector('textarea[name="feedback"]');
                if (input && input.value.trim() !== "") {
                    try {
                        await addDoc(collection(db, "feedbacks"), {
                            message: input.value,
                            timestamp: new Date().toISOString()
                        });
                        console.log(`[Feedback Saved] ${input.value}`);
                        input.value = '';
                        input.placeholder = "Saved to DB! Thanks!";
                        event.target.innerText = "Sent!";
                        event.target.style.backgroundColor = "#00aa00";
                        event.target.disabled = true;
                    } catch (e) {
                        console.error("Error saving feedback:", e);
                        event.target.innerText = "Error!";
                        event.target.style.backgroundColor = "#ff0000";
                    }
                }
            }
        });
    }

    handleResize(width, height) {
        if (this.startButton) this.startButton.setPosition(width / 2, height - 150);
        if (this.infoText) this.infoText.setPosition(width / 2, 50);
        if (this.battleText) this.battleText.setPosition(width / 2, height / 2);
        if (this.debugText) this.debugText.setPosition(width - 10, height - 10);
        
        // [Modified] 버튼 3개 위치 업데이트
        if (this.autoBattleBtn) this.autoBattleBtn.setPosition(100, height - 80);
        if (this.squadBtn) this.squadBtn.setPosition(280, height - 80);
        if (this.speedBtn) this.speedBtn.setPosition(460, height - 80);
        
        if (this.feedbackDOM) this.feedbackDOM.setPosition(width / 2, height / 2 + 100);
    }
}