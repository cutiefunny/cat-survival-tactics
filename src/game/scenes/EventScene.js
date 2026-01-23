import Phaser from 'phaser';

export default class EventScene extends Phaser.Scene {
    constructor() {
        super('EventScene');
    }

    init(data) {
        this.eventConfig = data || {};
        
        if (data && data.script && data.script.length > 0) {
            this.currentScript = data.script;
        } else {
            this.currentScript = this.getOpeningSequence();
        }

        this.viewMode = (data && data.mode) ? data.mode : 'scene';
        this.parentSceneKey = (data && data.parentScene) ? data.parentScene : null;
        this.nextSceneKey = (data && data.nextScene) ? data.nextScene : 'StrategyScene';
        this.nextSceneData = (data && data.nextSceneData) ? data.nextSceneData : {};
        
        console.log(`🎬 [EventScene] Init - Mode: ${this.viewMode}, Script Len: ${this.currentScript.length}`);
    }

    preload() {
        // 1. 이미지 로드
        for (let i = 1; i <= 5; i++) {
            if (!this.textures.exists(`opening${i}`)) {
                this.load.image(`opening${i}`, `cutscenes/opening${i}.png`);
            }
        }
        
        // 2. BGM 로드
        if (!this.cache.audio.exists('intermission')) {
            this.load.audio('intermission', 'sounds/intermission.mp3');
        }

        // 3. 비디오 로드
        if (this.currentScript) {
            this.currentScript.forEach(step => {
                if (step.type === 'mov' && step.file) {
                    if (!this.cache.video.exists(step.file)) {
                        this.load.video(step.file, `mov/${step.file}.mp4`);
                    }
                }
            });
        }
    }

    create() {
        this.scene.bringToTop();

        if (this.viewMode === 'scene' && !this.sound.get('intermission')) {
            this.bgm = this.sound.add('intermission', { loop: true, volume: 0.5 });
            this.bgm.play();
        }

        this.input.on('pointerdown', this.handleInput, this);
        this.input.keyboard.on('keydown', this.handleInput, this);

        // --- UI 컨테이너 ---
        this.uiContainer = this.add.container(0, 0).setDepth(100);
        this.uiContainer.setScrollFactor(0); 

        // --- 비디오 컨테이너 ---
        this.videoContainer = this.add.container(0, 0).setDepth(150);
        this.videoContainer.setScrollFactor(0);
        this.videoContainer.setVisible(false);

        this.createUIElements();
        this.createVideoElements();

        this.updateLayout();
        this.scale.on('resize', this.updateLayout, this);

        this.currentCutIndex = 0;
        this.isTyping = false;
        this.fullText = "";
        this.typingTimer = null;

        if (this.currentScript && this.currentScript.length > 0) {
            this.showCut(0);
        } else {
            this.endEvent();
        }
    }

    // [New] 매 프레임 호출되는 업데이트 루프
    update(time, delta) {
        // 비디오 컨테이너가 보일 때만 실행 (비디오 모드)
        if (this.videoContainer.visible) {
            // 지속적으로 크기와 위치를 강제 동기화하여 
            // 영상 로딩 직후 크기가 튀는 현상을 방지
            this.resizeVideoLayout1to1();
        }
    }

    createUIElements() {
        // 다이얼로그 UI
        this.bgImage = this.add.image(0, 0, 'opening1').setOrigin(0.5).setDepth(0).setVisible(false);
        this.textBox = this.add.rectangle(0, 0, 100, 100, 0x000000, 0.8).setOrigin(0);
        this.uiContainer.add(this.textBox);

        this.avatarImage = this.add.image(0, 0, 'leader', 0).setOrigin(0.5).setVisible(false);
        this.uiContainer.add(this.avatarImage);

        this.speakerText = this.add.text(0, 0, '', {
            fontFamily: 'NeoDunggeunmo', fontSize: '28px', color: '#FFD700', stroke: '#000000', strokeThickness: 4
        });
        this.uiContainer.add(this.speakerText);

        this.storyText = this.add.text(0, 0, '', {
            fontFamily: 'NeoDunggeunmo', fontSize: '24px', color: '#ffffff', stroke: '#000000', strokeThickness: 2, lineSpacing: 8
        });
        this.uiContainer.add(this.storyText);

        this.skipBtn = this.add.text(0, 0, "SKIP ≫", {
            fontSize: '24px', fontStyle: 'bold', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 15, y: 10 }
        })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(200);

        this.skipBtn.on('pointerdown', () => this.endEvent());
    }

    createVideoElements() {
        // 1. 비디오 배경 (Dim)
        this.videoDim = this.add.rectangle(0, 0, 100, 100, 0x000000, 0.7).setOrigin(0.5);
        this.videoContainer.add(this.videoDim);

        // 2. 비디오 프레임 (테두리)
        this.videoFrame = this.add.rectangle(0, 0, 100, 100, 0x222222, 1).setOrigin(0.5);
        this.videoFrame.setStrokeStyle(4, 0xffffff);
        this.videoContainer.add(this.videoFrame);

        // 3. 비디오 객체
        this.videoObject = this.add.video(0, 0); 
        this.videoObject.setOrigin(0.5); // [중요] 중심점 중앙 정렬
        this.videoContainer.add(this.videoObject);

        // 4. 설명 텍스트
        this.videoText = this.add.text(0, 0, '', {
            fontFamily: 'NeoDunggeunmo', fontSize: '24px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: 600 }
        }).setOrigin(0.5, 0);
        this.videoContainer.add(this.videoText);

        // 5. 안내 텍스트
        this.videoGuideText = this.add.text(0, 0, "▼ 화면을 터치하면 다음으로 넘어갑니다", {
            fontFamily: 'Arial', fontSize: '16px', color: '#cccccc'
        }).setOrigin(0.5);
        this.videoContainer.add(this.videoGuideText);
    }

    updateLayout() {
        const { width, height } = this.scale;
        const isOverlay = (this.viewMode === 'overlay');
        const isMobile = width <= 640;

        // 배경색
        if (isOverlay) {
            this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
        } else {
            this.cameras.main.setBackgroundColor('#ffffff');
            if (this.bgImage.visible) {
                this.fitImageToScreen(this.bgImage);
            }
        }

        // 다이얼로그 레이아웃
        const boxHeight = isOverlay ? 160 : 200;
        const marginY = isOverlay ? 30 : 0; 
        const boxY = isOverlay ? marginY : (height - boxHeight);
        const marginX = isOverlay ? (isMobile ? 10 : 40) : 0;
        const boxWidth = width - (marginX * 2);
        const boxX = marginX;

        this.textBox.setPosition(boxX, boxY);
        this.textBox.setDisplaySize(boxWidth, boxHeight);
        
        const padding = 20;
        const avatarSize = 100;
        this.avatarImage.setPosition(boxX + padding + avatarSize / 2, boxY + boxHeight / 2);
        
        this.baseTextX = boxX + padding;
        this.avatarTextX = boxX + padding + avatarSize + padding;
        const textY = boxY + 25;

        this.speakerText.setPosition(this.baseTextX, textY); 
        this.storyText.setPosition(this.baseTextX, textY + 40); 
        this.storyText.setStyle({ wordWrap: { width: boxWidth - 100 } });

        // Skip 버튼
        if (isOverlay) {
            this.skipBtn.setPosition(width - marginX, boxY + boxHeight + 10);
        } else {
            this.skipBtn.setPosition(width - 30, 30);
        }

        // 비디오 레이아웃 갱신
        this.videoDim.setPosition(width / 2, height / 2);
        this.videoDim.setDisplaySize(width, height);
        this.videoContainer.setPosition(width / 2, height / 2);
        
        // * update()에서 계속 호출하므로 여기서는 텍스트 위치 정도만 갱신해도 됨
        if (this.currentScript && this.currentScript[this.currentCutIndex]) {
            const data = this.currentScript[this.currentCutIndex];
            if (data.type !== 'mov') {
                if (data.avatar) {
                    this.speakerText.setX(this.avatarTextX);
                    this.storyText.setX(this.avatarTextX);
                } else {
                    this.speakerText.setX(this.baseTextX);
                    this.storyText.setX(this.baseTextX);
                }
            }
        }
    }

    // 1:1 레이아웃 계산 (비디오 객체 포함)
    resizeVideoLayout1to1() {
        const { width, height } = this.scale;
        const isMobile = width <= 640;
        
        let targetSize;

        if (isMobile) {
            // 모바일: 가로 최대 350px
            targetSize = Math.min(350, width - 40, height - 160); 
        } else {
            // PC: 최대 600px
            targetSize = Math.min(600, width - 100, height - 160);
        }

        // 프레임 크기 적용
        if (this.videoFrame) {
            this.videoFrame.setDisplaySize(targetSize + 20, targetSize + 20);
        }

        // 비디오 크기 및 위치 적용
        // update 루프에서 계속 호출되므로, 비디오가 재생 시작되어 크기가 변해도 바로 다시 잡아줌
        if (this.videoObject) {
            this.videoObject.setDisplaySize(targetSize, targetSize);
            this.videoObject.setPosition(0, 0); // 컨테이너 중앙
        }

        // 텍스트 위치 조정
        if (this.videoText && this.videoGuideText) {
            const textWidth = Math.max(300, targetSize);
            this.videoText.setStyle({ wordWrap: { width: textWidth } });
            this.videoText.setPosition(0, targetSize / 2 + 20);
            this.videoGuideText.setPosition(0, targetSize / 2 + 80);
        }
    }

    showCut(index) {
        if (index >= this.currentScript.length) {
            this.endEvent();
            return;
        }

        const data = this.currentScript[index];
        const type = data.type || 'dialog';

        // 이전 비디오 정지
        if (this.videoObject && this.videoObject.isPlaying()) {
            this.videoObject.stop();
        }

        if (type === 'mov') {
            // [비디오 모드]
            this.uiContainer.setVisible(false);
            if (this.bgImage) this.bgImage.setVisible(false);
            
            // 1. 프레임 표시
            this.videoContainer.setVisible(true);
            
            // 2. 초기 레이아웃 잡기
            this.resizeVideoLayout1to1();

            this.videoText.setText(data.text || '');
            this.isTyping = false;

            // 3. 딜레이 후 비디오 재생 (프레임이 먼저 보이도록)
            this.time.delayedCall(100, () => {
                if (this.videoContainer.visible) {
                    this.videoObject.changeSource(data.file);
                    this.videoObject.play(true);
                    
                    // 여기서 다시 잡아주지만, update()에서도 계속 잡아주므로 안전함
                    this.resizeVideoLayout1to1();
                }
            });

        } else {
            // [다이얼로그 모드]
            this.videoContainer.setVisible(false);
            this.uiContainer.setVisible(true);

            if (type === 'image') {
                if (this.bgImage && data.image) {
                    this.bgImage.setVisible(true);
                    if (this.bgImage.texture.key !== data.image) {
                        this.bgImage.setTexture(data.image);
                        this.bgImage.setAlpha(0);
                        this.tweens.add({ targets: this.bgImage, alpha: 1, duration: 500 });
                    }
                    this.fitImageToScreen(this.bgImage);
                }
            }
            
            if (data.avatar) {
                this.avatarImage.setVisible(true);
                this.avatarImage.setTexture(data.avatar, 0); 
                this.speakerText.setX(this.avatarTextX);
                this.storyText.setX(this.avatarTextX);
            } else {
                this.avatarImage.setVisible(false);
                this.speakerText.setX(this.baseTextX);
                this.storyText.setX(this.baseTextX);
            }
            
            this.speakerText.setText(data.speaker || '');
            this.fullText = data.text || '';
            this.storyText.setText('');
            
            this.isTyping = true;
            this.startTyping(this.fullText);

            if (this.viewMode === 'overlay' && this.parentSceneKey) {
                const parent = this.scene.get(this.parentSceneKey);
                if (parent && typeof parent.getCameraTarget === 'function') {
                    const target = parent.getCameraTarget(data.speaker);
                    if (target) {
                        const cam = parent.cameras.main;
                        const targetScrollX = target.x - (cam.width / 2) / cam.zoom;
                        const targetScrollY = target.y - (cam.height / 2) / cam.zoom;
                        this.tweens.add({
                            targets: cam, scrollX: targetScrollX, scrollY: targetScrollY, duration: 1000, ease: 'Cubic.easeOut'
                        });
                    }
                }
            }
        }
    }

    startTyping(text) {
        if (this.typingTimer) this.typingTimer.remove();
        let currentIndex = 0;
        const length = text.length;

        this.typingTimer = this.time.addEvent({
            delay: 40, 
            callback: () => {
                this.storyText.text += text[currentIndex];
                currentIndex++;
                if (currentIndex >= length) this.completeTyping();
            },
            loop: true
        });
    }

    completeTyping() {
        if (this.typingTimer) {
            this.typingTimer.remove();
            this.typingTimer = null;
        }
        this.storyText.setText(this.fullText);
        this.isTyping = false;
    }

    handleInput() {
        if (this.videoContainer.visible) {
            this.currentCutIndex++;
            this.showCut(this.currentCutIndex);
            return;
        }

        if (this.isTyping) {
            this.completeTyping();
        } else {
            this.currentCutIndex++;
            this.showCut(this.currentCutIndex);
        }
    }

    fitImageToScreen(image) {
        if (!image) return;
        const { width, height } = this.scale;
        const scaleX = width / image.width;
        const scaleY = height / image.height;
        let scale = Math.min(scaleX, scaleY);
        const maxWidth = 1000;
        if (image.width * scale > maxWidth) scale = maxWidth / image.width;
        image.setScale(scale);
        image.setPosition(width / 2, height / 2);
    }

    endEvent() {
        console.log("🎬 [EventScene] Finished.");
        this.scale.off('resize', this.updateLayout, this);
        if (this.videoObject) this.videoObject.stop();

        if (this.viewMode === 'overlay') {
            if (this.parentSceneKey) this.scene.resume(this.parentSceneKey);
            this.scene.stop();
        } else {
            this.cameras.main.fade(1000, 0, 0, 0);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                if (this.bgm) this.bgm.stop();
                this.scene.start(this.nextSceneKey, this.nextSceneData);
            });
        }
    }
    
    getOpeningSequence() {
        return [
            { type: 'image', image: 'opening1', text: "상수동은 원래 거대 고양이 김냐냐씨의 영역이었다.\n그가 이끄는 상수동 고양이회는 지역을 평화롭게 다스렸다." },
            { type: 'image', image: 'opening2', text: "어느 날부터 구역 내에 들개들이 점점 늘어나기 시작했지만\n상수동의 길냥이들은 크게 신경 쓰지 않았다.\n상수동은 강력한 김냐냐씨의 영역이었으니까." },
            { type: 'image', image: 'opening3', text: "그러던 어느 날,\n영역의 급식소를 순찰하던 김냐냐씨는" },
            { type: 'image', image: 'opening4', text: "상수동 고양이회의 2인자 '탱크'의 계략에 빠져\n영역 최남단의 유니타워에 고립 되고 말았다!" },
            { type: 'image', image: 'opening5', text: "그 사이 상수동 전체는 들개들에게 점령 되었고\n레드로드 서쪽은 배신의 대가로 탱크가 다스리게 되었다.\n" },
            { type: 'image', image: 'opening5', text: "이제, 전략가인 당신의 시간이다!\n흩어진 길냥이들을 규합하고 영토를 수복하라!\n" }
        ];
    }
}