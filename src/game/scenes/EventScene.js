import Phaser from 'phaser';
import { getRandomUnitName } from '../data/UnitData'; // [New] 이름 생성을 위해 필요

export default class EventScene extends Phaser.Scene {
    constructor() {
        super('EventScene');
    }

    init(data) {
        // [설정] 컷씬 생략 설정 확인 (localStorage 사용)
        const isSkipEnabled = localStorage.getItem('setting_skip_cutscenes') === 'true';
        
        this.eventConfig = data || {};
        
        // 데이터에 스크립트가 있으면 사용하고, 없으면 오프닝으로 간주
        if (data && data.script && data.script.length > 0) {
            this.currentScript = data.script;
        } else {
            // 전달된 스크립트가 없으면 오프닝 시퀀스 로드
            this.currentScript = this.getOpeningSequence();
        }

        this.viewMode = (data && data.mode) ? data.mode : 'scene';
        this.parentSceneKey = (data && data.parentScene) ? data.parentScene : null;
        this.nextSceneKey = (data && data.nextScene) ? data.nextScene : 'StrategyScene';
        this.nextSceneData = (data && data.nextSceneData) ? data.nextSceneData : {};
        
        // 스킵 활성화 시 플래그 설정 (오프닝인 경우에만 적용)
        const isOpeningSequence = (!data || !data.script);
        this.shouldSkipImmediately = isSkipEnabled && isOpeningSequence;

        console.log(`🎬 [EventScene] Init - Mode: ${this.viewMode}, IsOpening: ${isOpeningSequence}`);
    }

    preload() {
        // 기본 리소스 로딩
        for (let i = 1; i <= 5; i++) {
            if (!this.textures.exists(`opening${i}`)) {
                this.load.image(`opening${i}`, `cutscenes/opening${i}.png`);
            }
        }
        
        if (!this.cache.audio.exists('intermission')) {
            this.load.audio('intermission', 'sounds/intermission.mp3');
        }

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
        if (this.shouldSkipImmediately) {
            console.log("⏩ [EventScene] Skipping due to user setting.");
            this.endEvent();
            return;
        }

        this.scene.bringToTop();

        // 오버레이 모드가 아니고 오디오가 없다면 BGM 재생
        if (this.viewMode === 'scene' && !this.sound.get('intermission')) {
            this.bgm = this.sound.add('intermission', { loop: true, volume: 0.5 });
            this.bgm.play();
        }

        this.input.on('pointerdown', this.handleInput, this);
        this.input.keyboard.on('keydown', this.handleInput, this);

        this.uiContainer = this.add.container(0, 0).setDepth(100);
        this.uiContainer.setScrollFactor(0); 

        // 선택지 버튼을 담을 컨테이너 추가
        this.choiceContainer = this.add.container(0, 0).setDepth(200);
        this.choiceContainer.setScrollFactor(0);
        this.choiceContainer.setVisible(false);

        this.videoContainer = this.add.container(0, 0).setDepth(150);
        this.videoContainer.setScrollFactor(0);
        this.videoContainer.setVisible(false);

        this.createUIElements();
        this.createVideoElements();

        this.updateLayout();
        this.scale.on('resize', this.updateLayout, this);

        this.currentCutIndex = 0;
        this.isTyping = false;
        this.isWaitingForChoice = false; 
        this.fullText = "";
        this.typingTimer = null;

        if (this.currentScript && this.currentScript.length > 0) {
            this.showCut(0);
        } else {
            console.warn("⚠️ [EventScene] No script provided.");
            this.endEvent();
        }
    }

    update(time, delta) {
        if (this.videoContainer && this.videoContainer.visible) {
            this.resizeVideoLayout1to1();
        }
    }

    createUIElements() {
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
        this.videoDim = this.add.rectangle(0, 0, 100, 100, 0x000000, 0.7).setOrigin(0.5);
        this.videoContainer.add(this.videoDim);

        this.videoFrame = this.add.rectangle(0, 0, 100, 100, 0x222222, 1).setOrigin(0.5);
        this.videoFrame.setStrokeStyle(4, 0xffffff);
        this.videoContainer.add(this.videoFrame);

        this.videoObject = this.add.video(0, 0); 
        this.videoObject.setOrigin(0.5); 
        this.videoContainer.add(this.videoObject);

        this.videoText = this.add.text(0, 0, '', {
            fontFamily: 'NeoDunggeunmo', fontSize: '24px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: 600 }
        }).setOrigin(0.5, 0);
        this.videoContainer.add(this.videoText);

        this.videoGuideText = this.add.text(0, 0, "▼ 화면을 터치하면 다음으로 넘어갑니다", {
            fontFamily: 'Arial', fontSize: '16px', color: '#cccccc'
        }).setOrigin(0.5);
        this.videoContainer.add(this.videoGuideText);
    }

    updateLayout() {
        const { width, height } = this.scale;
        const isOverlay = (this.viewMode === 'overlay');
        const isMobile = width <= 640;

        if (isOverlay) {
            this.cameras.main.setBackgroundColor('rgba(0,0,0,0.5)'); 
        } else {
            this.cameras.main.setBackgroundColor('#ffffff');
            if (this.bgImage.visible) {
                this.fitImageToScreen(this.bgImage);
            }
        }

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

        if (isOverlay) {
            this.skipBtn.setPosition(width - marginX, boxY + boxHeight + 10);
        } else {
            this.skipBtn.setPosition(width - 30, 30);
        }
        
        this.choiceContainer.setPosition(width / 2, boxY - 20);

        this.videoDim.setPosition(width / 2, height / 2);
        this.videoDim.setDisplaySize(width, height);
        this.videoContainer.setPosition(width / 2, height / 2);
        
        if (this.currentScript && this.currentScript[this.currentCutIndex]) {
            const data = this.currentScript[this.currentCutIndex];
            const type = data.type || 'dialog';
            
            // Notice 처리 시 텍스트 위치 리셋
            if (type === 'notice' || type === 'recruit_unit' || type === 'unlock_unit') {
                this.speakerText.setX(this.baseTextX);
                this.storyText.setX(this.baseTextX);
            } else if (type !== 'mov') {
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

    resizeVideoLayout1to1() {
        const { width, height } = this.scale;
        const isMobile = width <= 640;
        
        let targetSize;
        if (isMobile) {
            targetSize = Math.min(350, width - 40, height - 160); 
        } else {
            targetSize = Math.min(600, width - 100, height - 160);
        }

        if (this.videoFrame) {
            this.videoFrame.setDisplaySize(targetSize + 20, targetSize + 20);
        }

        if (this.videoObject) {
            this.videoObject.setDisplaySize(targetSize, targetSize);
            this.videoObject.setPosition(0, 0); 
        }

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

        if (this.videoObject && this.videoObject.isPlaying()) {
            this.videoObject.stop();
        }

        if (type === 'mov') {
            const storageKey = `tutorial_played_${data.file}`;
            if (localStorage.getItem(storageKey)) {
                console.log(`⏩ Skipping played tutorial: ${data.file}`);
                this.currentCutIndex++;
                this.showCut(this.currentCutIndex);
                return;
            }
            localStorage.setItem(storageKey, 'true');

            this.uiContainer.setVisible(false);
            if (this.bgImage) this.bgImage.setVisible(false);
            
            this.videoContainer.setVisible(true);
            this.resizeVideoLayout1to1();

            this.videoText.setText(data.text || '');
            this.isTyping = false;
            this.isWaitingForChoice = false;

            this.time.delayedCall(100, () => {
                if (this.videoContainer.visible) {
                    this.videoObject.changeSource(data.file);
                    this.videoObject.setLoop(true); 
                    this.videoObject.play();
                    this.resizeVideoLayout1to1();
                }
            });

        } else {
            this.videoContainer.setVisible(false);
            this.uiContainer.setVisible(true);

            // [Modified] 시스템 메시지 타입 판별
            const isNotice = (type === 'notice' || type === 'recruit_unit' || type === 'unlock_unit');

            // [New] 특수 이벤트 처리 (즉시 적용)
            if (type === 'recruit_unit') {
                this.recruitUnit(data);
            } else if (type === 'unlock_unit') {
                this.unlockUnit(data);
            }

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
            } else if (this.viewMode === 'overlay') {
                if (this.bgImage) this.bgImage.setVisible(false);
            }
            
            // 아바타 및 화자 텍스트 처리
            if (!isNotice && data.avatar) {
                this.avatarImage.setVisible(true);
                if (this.textures.exists(data.avatar)) {
                    this.avatarImage.setTexture(data.avatar, 0); 
                }
                this.speakerText.setX(this.avatarTextX);
                this.storyText.setX(this.avatarTextX);
                this.speakerText.setText(data.speaker || '');
            } else {
                // 아바타가 없거나 Notice인 경우
                this.avatarImage.setVisible(false);
                this.speakerText.setX(this.baseTextX);
                this.storyText.setX(this.baseTextX);
                
                // Notice면 화자 이름 비우기
                this.speakerText.setText('');
            }
            
            this.fullText = data.text || '';
            this.storyText.setText('');
            
            this.isTyping = true;
            this.startTyping(this.fullText);

            // 선택지(Choices) 처리
            this.choiceContainer.removeAll(true);
            this.choiceContainer.setVisible(false);
            this.isWaitingForChoice = false;

            if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
                this.isWaitingForChoice = true;
                this.createChoices(data.choices);
            }

            // 카메라 이동 (Overlay 모드)
            if (this.viewMode === 'overlay' && this.parentSceneKey) {
                const parent = this.scene.get(this.parentSceneKey);
                if (parent && typeof parent.getCameraTarget === 'function') {
                    // Notice일 때는 화자 이동 안함
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

    // [New] 동료 영입 로직
    recruitUnit(data) {
        // data.role이 지정되어 있으면 해당 유닛을 추가, 없으면 효과만 발생
        if (data.role) {
            const squad = this.registry.get('playerSquad') || [];
            const newMember = { 
                role: data.role, 
                level: 1, 
                xp: 0, 
                fatigue: 0, 
                name: data.name || getRandomUnitName(data.role)
            };
            squad.push(newMember);
            this.registry.set('playerSquad', squad);
            console.log(`🎉 [Event] Recruited: ${newMember.role} (${newMember.name})`);
        }
    }

    // [New] 유닛 해금 로직
    unlockUnit(data) {
        if (data.unit && Array.isArray(data.unit)) {
            const unlocked = this.registry.get('unlockedRoles') || ['Normal'];
            let changed = false;
            data.unit.forEach(role => {
                if (!unlocked.includes(role)) {
                    unlocked.push(role);
                    changed = true;
                    console.log(`🔓 [Event] Unlocked Role: ${role}`);
                }
            });
            if (changed) {
                this.registry.set('unlockedRoles', unlocked);
            }
        }
    }

    createChoices(choices) {
        this.choiceContainer.setVisible(true);
        let yOffset = 0;
        const btnHeight = 50;
        const btnWidth = 300;
        const spacing = 15;

        choices.slice().reverse().forEach((choice, index) => {
            const btn = this.add.container(0, -yOffset);
            
            const bg = this.add.rectangle(0, 0, btnWidth, btnHeight, 0x000000, 0.9)
                .setStrokeStyle(2, 0xffffff);
            
            const text = this.add.text(0, 0, choice.text, {
                fontSize: '20px', fontFamily: 'NeoDunggeunmo', color: '#ffffff'
            }).setOrigin(0.5);

            const hitArea = this.add.rectangle(0, 0, btnWidth, btnHeight).setInteractive({ useHandCursor: true });
            
            hitArea.on('pointerover', () => bg.setStrokeStyle(2, 0xffff00));
            hitArea.on('pointerout', () => bg.setStrokeStyle(2, 0xffffff));
            hitArea.on('pointerdown', () => this.handleChoice(choice.value));

            btn.add([bg, text, hitArea]);
            this.choiceContainer.add(btn);

            yOffset += (btnHeight + spacing);
        });
    }

    handleChoice(value) {
        this.completeTyping();
        
        if (this.eventConfig.onResult) {
            this.eventConfig.onResult(value);
        }

        this.endEvent();
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

        if (this.isWaitingForChoice) {
            if (this.isTyping) {
                this.completeTyping(); 
            }
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