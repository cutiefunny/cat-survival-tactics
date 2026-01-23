import Phaser from 'phaser';

export default class EventScene extends Phaser.Scene {
    constructor() {
        super('EventScene');
    }

    init(data) {
        this.eventConfig = data || {};
        
        // 스크립트 데이터 설정 (없으면 오프닝 로드)
        if (data && data.script && data.script.length > 0) {
            this.currentScript = data.script;
        } else {
            this.currentScript = this.getOpeningSequence();
        }

        this.viewMode = (data && data.mode) ? data.mode : 'scene'; // 'scene' | 'overlay'
        this.parentSceneKey = (data && data.parentScene) ? data.parentScene : null;
        this.nextSceneKey = (data && data.nextScene) ? data.nextScene : 'StrategyScene';
        this.nextSceneData = (data && data.nextSceneData) ? data.nextSceneData : {};
        
        console.log(`🎬 [EventScene] Init - Mode: ${this.viewMode}, Script Len: ${this.currentScript.length}`);
    }

    preload() {
        // 기본 오프닝 이미지 로드
        for (let i = 1; i <= 5; i++) {
            if (!this.textures.exists(`opening${i}`)) {
                this.load.image(`opening${i}`, `cutscenes/opening${i}.png`);
            }
        }
        
        // BGM 로드
        if (!this.cache.audio.exists('intermission')) {
            this.load.audio('intermission', 'sounds/intermission.mp3');
        }
    }

    create() {
        // 씬을 최상단으로 이동 (다른 씬에 가려지지 않게 함)
        this.scene.bringToTop();

        // BGM 재생
        if (this.viewMode === 'scene' && !this.sound.get('intermission')) {
            this.bgm = this.sound.add('intermission', { loop: true, volume: 0.5 });
            this.bgm.play();
        }

        // 입력 리스너
        this.input.on('pointerdown', this.handleInput, this);
        this.input.keyboard.on('keydown', this.handleInput, this);

        // UI 컨테이너 생성 및 화면 고정 설정
        this.uiContainer = this.add.container(0, 0).setDepth(100);
        this.uiContainer.setScrollFactor(0); 

        // 요소 생성 (초기화)
        this.createUIElements();

        // 초기 레이아웃 설정
        this.updateLayout();

        // 화면 크기 변경 감지
        this.scale.on('resize', this.updateLayout, this);

        // 상태 변수 초기화
        this.currentCutIndex = 0;
        this.isTyping = false;
        this.fullText = "";
        this.typingTimer = null;

        // 첫 컷 실행
        if (this.currentScript && this.currentScript.length > 0) {
            this.showCut(0);
        } else {
            this.endEvent();
        }
    }

    createUIElements() {
        // 1. 배경 이미지 (Scene 모드용)
        this.bgImage = this.add.image(0, 0, 'opening1')
            .setOrigin(0.5, 0.5)
            .setDepth(0)
            .setVisible(false);

        // 2. 텍스트 박스 배경
        this.textBox = this.add.rectangle(0, 0, 100, 100, 0x000000, 0.8).setOrigin(0);
        this.uiContainer.add(this.textBox);

        // 3. 아바타 이미지
        this.avatarImage = this.add.image(0, 0, 'leader', 0)
            .setOrigin(0.5)
            .setVisible(false);
        this.uiContainer.add(this.avatarImage);

        // 4. 화자 이름
        this.speakerText = this.add.text(0, 0, '', {
            fontFamily: 'NeoDunggeunmo',
            fontSize: '28px',
            color: '#FFD700',
            stroke: '#000000',
            strokeThickness: 4
        });
        this.uiContainer.add(this.speakerText);

        // 5. 본문 텍스트
        this.storyText = this.add.text(0, 0, '', {
            fontFamily: 'NeoDunggeunmo',
            fontSize: '24px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
            lineSpacing: 8
        });
        this.uiContainer.add(this.storyText);

        // 6. Skip 버튼
        this.skipBtn = this.add.text(0, 0, "SKIP ≫", {
            fontSize: '24px',
            fontStyle: 'bold',
            color: '#ffffff',
            backgroundColor: '#00000088',
            padding: { x: 15, y: 10 }
        })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(200);

        this.skipBtn.on('pointerdown', () => this.endEvent());
    }

    updateLayout() {
        const { width, height } = this.scale;
        const isOverlay = (this.viewMode === 'overlay');
        const isMobile = width <= 640;

        // 배경 설정
        if (isOverlay) {
            this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
        } else {
            this.cameras.main.setBackgroundColor('#ffffff');
            if (this.bgImage.visible) {
                this.bgImage.setPosition(width / 2, height / 2);
                this.fitImageToScreen(this.bgImage);
            }
        }

        // 박스 레이아웃 계산
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
        
        const avatarX = boxX + padding + avatarSize / 2;
        const avatarY = boxY + boxHeight / 2;
        this.avatarImage.setPosition(avatarX, avatarY);
        
        this.baseTextX = boxX + padding;
        this.avatarTextX = boxX + padding + avatarSize + padding;

        const textY = boxY + 25;

        const nameSize = isMobile ? '24px' : '28px';
        const textSize = isMobile ? '20px' : '26px';

        this.speakerText.setStyle({ fontSize: nameSize });
        this.speakerText.setPosition(this.baseTextX, textY); 

        this.storyText.setStyle({ 
            fontSize: textSize,
            wordWrap: { width: boxWidth - (isOverlay ? 140 : 80) } 
        });
        this.storyText.setPosition(this.baseTextX, textY + 40); 

        if (isOverlay) {
            this.skipBtn.setPosition(width - marginX, boxY + boxHeight + 10);
        } else {
            this.skipBtn.setPosition(width - 30, 30);
        }
        
        if (this.currentScript && this.currentScript[this.currentCutIndex]) {
            const data = this.currentScript[this.currentCutIndex];
            if (data.avatar) {
                this.speakerText.setX(this.avatarTextX);
                this.storyText.setX(this.avatarTextX);
            } else {
                this.speakerText.setX(this.baseTextX);
                this.storyText.setX(this.baseTextX);
            }
        }
    }

    showCut(index) {
        if (index >= this.currentScript.length) {
            this.endEvent();
            return;
        }

        const data = this.currentScript[index];
        const type = data.type || 'dialog';

        // 1. 이미지 처리
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
        } else {
             // 다이얼로그 모드: 오버레이면 배경 이미지 숨김 필요 시 추가
        }
        
        // 2. 아바타 처리
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

        // [New] 3. 카메라 이동 처리 (오버레이 모드)
        if (this.viewMode === 'overlay' && this.parentSceneKey) {
            const parent = this.scene.get(this.parentSceneKey);
            if (parent && typeof parent.getCameraTarget === 'function') {
                const target = parent.getCameraTarget(data.speaker);
                if (target) {
                    const cam = parent.cameras.main;
                    // 타겟 좌표가 화면 중앙에 오도록 scroll 값 계산
                    // scrollX = 타겟X - (화면너비 / 2) / 줌
                    const targetScrollX = target.x - (cam.width / 2) / cam.zoom;
                    const targetScrollY = target.y - (cam.height / 2) / cam.zoom;

                    // 부모 씬의 카메라는 씬이 일시정지 상태여도 tween으로 움직일 수 있습니다.
                    this.tweens.add({
                        targets: cam,
                        scrollX: targetScrollX,
                        scrollY: targetScrollY,
                        duration: 1000,
                        ease: 'Cubic.easeOut'
                    });
                }
            }
        }
        
        // 4. 텍스트 설정
        this.speakerText.setText(data.speaker || '');
        this.fullText = data.text || '';
        this.storyText.setText('');
        
        // 타이핑 시작
        this.isTyping = true;
        this.startTyping(this.fullText);
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
                if (currentIndex >= length) {
                    this.completeTyping();
                }
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

        if (this.viewMode === 'overlay') {
            if (this.parentSceneKey) {
                this.scene.resume(this.parentSceneKey);
            }
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