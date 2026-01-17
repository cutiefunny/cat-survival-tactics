import Phaser from 'phaser';

export default class EventScene extends Phaser.Scene {
    constructor() {
        super('EventScene');
    }

    preload() {
        // 오프닝에 사용할 이미지 5장 로드
        // (/src/assets/cutscenes/ 폴더에 이미지가 있다고 가정)
        for (let i = 1; i <= 5; i++) {
            this.load.image(`opening${i}`, `cutscenes/opening${i}.png`);
        }
        this.load.audio('intermission', 'sounds/intermission.mp3');
    }

    create() {
        this.bgm = this.sound.add('intermission', { loop: true, volume: 0.5 });
        this.bgm.play();
        // 오프닝 스토리보드 데이터 설정
        this.openingSequence = [
            {
                image: 'opening1',
                text: "상수동은 원래 거대 고양이 김냐냐씨의 영역이었다.\n그가 이끄는 상수동 고양이회는 지역을 평화롭게 다스렸다.",
            },
            {
                image: 'opening2',
                text: "어느 날부터 구역 내에 들개들이 점점 늘어나기 시작했지만\n상수동의 길냥이들은 크게 신경 쓰지 않았다.\n상수동은 강력한 김냐냐씨의 영역이었으니까.",
            },
            {
                image: 'opening3',
                text: "그러던 어느 날,\n영역의 급식소를 순찰하던 김냐냐씨는",
            },
            {
                image: 'opening4',
                text: "상수동 고양이회의 2인자 '탱크'의 계략에 빠져\n영역 최남단의 유니타워에 고립 되고 말았다!",
            },
            {
                image: 'opening5',
                text: "그 사이 상수동 전체는 들개들에게 점령 되었고\n레드로드 서쪽은 배신의 대가로 탱크가 다스리게 되었다.\n",
            },
            {
                image: 'opening5',
                text: "이제, 전략가인 당신의 시간이다!\n흩어진 길냥이들을 규합하고 영토를 수복하라!\n",
            }
        ];

        this.currentCutIndex = 0;
        this.isTyping = false;
        this.fullText = "";
        this.typingTimer = null;

        const { width, height } = this.scale;

        // 카메라 기본 배경을 흰색으로 설정 (이미지의 투명 부분이 흰색으로 보이게 함)
        this.cameras.main.setBackgroundColor('#ffffff');

        // 흰색 배경 박스 (이미지 뒤에 놓음)
        this.bgFill = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0xffffff)
            .setOrigin(0)
            .setDepth(0);

        // 배경 이미지 객체 (위에 표시)
        this.bgImage = this.add.image(this.cameras.main.centerX, this.cameras.main.centerY, 'opening1')
            .setOrigin(0.5, 0.6)
            .setDepth(1);

        // 화면에 맞게 늘리되 최대 가로 너비 1000px로 제한
        this.fitImageToScreen(this.bgImage);
        const maxWidth = 1000;
        if (this.bgImage.displayWidth > maxWidth) {
            const capScale = maxWidth / this.bgImage.width;
            this.bgImage.setScale(capScale);
        }

        // 텍스트 배경 박스 (가독성 향상)
        this.textBox = this.add.rectangle(0, 0, 1280, 200, 0x000000, 0.7)
            .setOrigin(0);
        
        // 텍스트 객체
        const isMobile = (this.scale && this.scale.width && this.scale.width <= 640) ||
                 (this.sys && this.sys.game && this.sys.game.device && (this.sys.game.device.os && (this.sys.game.device.os.android || this.sys.game.device.os.iOS)));
        this.storyText = this.add.text(0, 0, '', {
            fontFamily: 'NeoDunggeunmo',
            fontSize: isMobile ? '14px' : '32px',
            color: '#000000',
            strokeThickness: 4,
            lineSpacing: 10
        });

        // 6. [NEW] Skip 버튼 (우측 상단)
        const skipBtn = this.add.text(width - 30, 30, "SKIP ≫", {
            fontSize: '24px',
            fontStyle: 'bold',
            color: '#ffffff',
            backgroundColor: '#00000088',
            padding: { x: 15, y: 10 }
        })
        .setOrigin(1, 0) // 우측 상단 기준점
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(100); // 항상 최상단 노출

        // Skip 버튼 클릭 이벤트
        skipBtn.on('pointerdown', () => {
            console.log("Skipping Cutscene...");
            this.endOpening();
        });

        // Skip 버튼 호버 효과
        skipBtn.on('pointerover', () => skipBtn.setStyle({ backgroundColor: '#44444488' }));
        skipBtn.on('pointerout', () => skipBtn.setStyle({ backgroundColor: '#00000088' }));

        // 입력 리스너 등록 (마우스/터치 + 키보드)
        this.input.on('pointerdown', this.handleInput, this);
        this.input.keyboard.on('keydown', this.handleInput, this);

        // 첫 번째 컷 시작
        this.showCut(0);
    }

    // 이미지를 화면 크기에 꽉 차게 조절 (비율 유지 or 채우기 선택)
    fitImageToScreen(image) {
        const screenWidth = this.cameras.main.width;
        const screenHeight = this.cameras.main.height;
        const maxWidth = 1000; // 최대 가로 너비 픽셀

        // 화면에 맞게 비율 유지(Contain 모드)
        const scaleX = screenWidth / image.width;
        const scaleY = screenHeight / image.height;
        let scale = Math.min(scaleX, scaleY);

        // 최대 가로 너비 제한 적용
        if (image.width * scale > maxWidth) {
            scale = maxWidth / image.width;
        }

        image.setScale(scale);

        // 화면 중앙에 배치 (이미지의 origin에 따라 위치가 조정됨)
        image.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);
    }

    showCut(index) {
        if (index >= this.openingSequence.length) {
            this.endOpening();
            return;
        }

        const data = this.openingSequence[index];

        // 이미지 변경 및 페이드 인 효과
        this.bgImage.setTexture(data.image);
        this.bgImage.setAlpha(0);
        this.tweens.add({
            targets: this.bgImage,
            alpha: 1,
            duration: 500
        });
        this.fitImageToScreen(this.bgImage);

        // 텍스트 박스 및 텍스트 위치 설정
        // 텍스트 위치에 맞춰 박스 위치도 조정하거나, 박스는 하단 고정하고 텍스트만 움직이게 할 수 있음.
        // 여기서는 텍스트 위치를 기준으로 박스를 그리는 대신, 텍스트 가독성을 위한 배경을 깔아줍니다.
        const padding = 20;
        // 가로 가운데 정렬을 기본으로 사용하되, data.x가 명시되면 그 값을 사용
        const x = (typeof data.x === 'number') ? data.x : this.cameras.main.centerX;
        const y = (typeof data.y === 'number') ? data.y : this.cameras.main.height - 150;
        // 텍스트를 가로 가운데 정렬하려면 origin.x를 0.5로 설정
        this.storyText.setOrigin(0.5, 0.5);
        // 이후에 호출되는 setPosition(data.x, data.y)가 올바르게 동작하도록 덮어쓰기
        this.storyText.setPosition(x, y);
        
        // 텍스트 배경 박스 위치 및 크기 조정 (텍스트 주변을 감싸도록)
        // 일단 텍스트가 타이핑되기 전이라 크기를 알 수 없으므로, 
        // 타이핑 효과에서는 박스 크기를 동적으로 조절하거나 고정된 UI를 사용하는 것이 좋습니다.
        // 여기서는 심플하게 텍스트 위치 주변에 박스를 배치합니다.
        this.textBox.setOrigin(0.5, 0);
        this.textBox.setPosition(x, y);
        this.textBox.setSize(100, 100); // 임시 크기, 타이핑 하면서 갱신 필요 없으면 고정 크기 사용
        this.textBox.setVisible(false); // 타이핑 시작 시 켜기

        // 타이핑 시작
        this.fullText = data.text;
        this.storyText.setText('');
        this.isTyping = true;
        
        // 배경 박스 켜기 (텍스트 길이에 대략 맞춰서)
        // 줄바꿈이 포함된 텍스트의 대략적 크기 계산
        // const lines = this.fullText.split('\n').length;
        // const widthEst = 600; // 대략적인 너비
        // const heightEst = lines * 40 + 40;
        // this.textBox.setSize(widthEst, heightEst);
        // this.textBox.setVisible(true);

        this.startTyping(this.fullText);
    }

    startTyping(text) {
        if (this.typingTimer) this.typingTimer.remove();

        let currentIndex = 0;
        const length = text.length;

        this.typingTimer = this.time.addEvent({
            delay: 50, // 타이핑 속도 (ms)
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
        
        // 텍스트 완성을 알리는 깜빡임 아이콘 등을 추가할 수 있음
    }

    handleInput() {
        if (this.isTyping) {
            // 타이핑 중이면 즉시 완성
            this.completeTyping();
        } else {
            // 타이핑이 끝났으면 다음 컷으로
            this.currentCutIndex++;
            this.showCut(this.currentCutIndex);
        }
    }

    endOpening() {
        // 모든 컷이 끝나면 다음 씬으로 전환
        // 보통 로딩 씬으로 넘어가서 본 게임 에셋을 로드하거나,
        // 이미 로드되어 있다면 메인 메뉴/게임 씬으로 이동
        console.log("Opening Finished. Moving to StrategyScene.");
        
        // 페이드 아웃 후 씬 전환
        this.cameras.main.fade(1000, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.start('StrategyScene'); // 다음에 실행될 씬 이름
        });
    }
}