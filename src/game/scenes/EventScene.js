// src/game/scenes/EventScene.js
import Phaser from 'phaser';

export default class EventScene extends Phaser.Scene {
    constructor() {
        super('EventScene');
    }

    init(data) {
        // 데이터 받기: { title, description, imageKey, choices, onResult }
        this.eventData = data;
    }

    create() {
        // 1. 배경 (반투명 검정 오버레이)
        const bg = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.8)
            .setOrigin(0);
        
        // 2. 컷씬 컨테이너 생성
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        const containerWidth = Math.min(600, this.scale.width - 40);
        const containerHeight = Math.min(800, this.scale.height - 40);

        // 패널 배경
        const panel = this.add.rectangle(centerX, centerY, containerWidth, containerHeight, 0x222222)
            .setStrokeStyle(4, 0xffffff);

        // 3. 컷씬 이미지 (상단)
        let imageY = centerY - containerHeight * 0.25;
        if (this.eventData.imageKey) {
            // 스프라이트 시트인 경우 첫 프레임 사용, 일반 이미지면 그냥 사용
            const img = this.add.sprite(centerX, imageY, this.eventData.imageKey);
            
            // 이미지 크기 조정 (컨테이너 너비의 80% 맞춤)
            const maxSize = Math.min(containerWidth * 0.6, 250);
            img.setDisplaySize(maxSize, maxSize);
            
            // 만약 애니메이션이 있다면 재생 (예: idle)
            const animKey = this.eventData.imageKey.replace('_token', '') + '_idle';
            if (this.anims.exists(animKey)) {
                img.play(animKey);
            }
        }

        // 4. 타이틀 텍스트
        const titleText = this.add.text(centerX, centerY - containerHeight * 0.45, this.eventData.title || "EVENT", {
            fontSize: '32px',
            fontStyle: 'bold',
            color: '#ffcc00',
            align: 'center'
        }).setOrigin(0.5);

        // 5. 설명 텍스트 (본문)
        const descText = this.add.text(centerX, centerY + 20, this.eventData.description || "", {
            fontSize: '20px',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: containerWidth - 60 }
        }).setOrigin(0.5);

        // 6. 선택지 버튼 생성 (하단)
        const choices = this.eventData.choices || [{ text: "확인", value: "ok" }];
        const buttonStartY = centerY + containerHeight * 0.3;
        const buttonSpacing = 70;

        choices.forEach((choice, index) => {
            this.createChoiceButton(centerX, buttonStartY + (index * buttonSpacing), choice.text, () => {
                this.handleChoice(choice.value);
            });
        });
    }

    createChoiceButton(x, y, text, callback) {
        const btnWidth = 200;
        const btnHeight = 50;
        
        const container = this.add.container(x, y);
        
        const bg = this.add.rectangle(0, 0, btnWidth, btnHeight, 0x444444)
            .setStrokeStyle(2, 0xaaaaaa);
        
        const label = this.add.text(0, 0, text, {
            fontSize: '18px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const hitArea = this.add.rectangle(0, 0, btnWidth, btnHeight, 0x000000, 0)
            .setInteractive({ useHandCursor: true });

        hitArea.on('pointerover', () => bg.setFillStyle(0x666666));
        hitArea.on('pointerout', () => bg.setFillStyle(0x444444));
        hitArea.on('pointerdown', () => {
            bg.setFillStyle(0x222222);
            this.tweens.add({
                targets: container,
                scale: 0.95,
                duration: 50,
                yoyo: true,
                onComplete: callback
            });
        });

        container.add([bg, label, hitArea]);
    }

    handleChoice(value) {
        // 결과 콜백 실행
        if (this.eventData.onResult) {
            this.eventData.onResult(value);
        }
        // 씬 종료 (팝업 닫기)
        this.scene.stop();
        // StrategyScene 입력 활성화 등 후처리
        const strategyScene = this.scene.get('StrategyScene');
        if (strategyScene) {
            strategyScene.input.enabled = true;
        }
    }
}