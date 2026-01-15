import Phaser from 'phaser';

export default class LoadingScene extends Phaser.Scene {
    constructor() {
        super('LoadingScene');
    }

    init(data) {
        // 전달받은 목표 씬과 데이터 저장
        this.targetScene = data.targetScene;
        this.targetData = data.targetData;
    }

    create() {
        const { width, height } = this.scale;

        // 1. 배경 (검은색)
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000).setOrigin(0.5);

        // 2. 로딩 텍스트
        const loadingText = this.add.text(width / 2, height / 2, '전투 지역으로 이동 중...', {
            fontSize: '28px',
            fontFamily: 'Arial',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // 3. 깜빡이는 애니메이션 (시각적 피드백)
        this.tweens.add({
            targets: loadingText,
            alpha: 0.3,
            duration: 800,
            yoyo: true,
            repeat: -1
        });

        // 4. 간단한 스피너 (원형 회전)
        const spinner = this.add.graphics();
        spinner.lineStyle(4, 0x4488ff, 1);
        spinner.beginPath();
        spinner.arc(0, 0, 30, 0, Phaser.Math.DegToRad(270), false);
        spinner.strokePath();
        spinner.setPosition(width / 2, height / 2 - 60);
        
        this.tweens.add({
            targets: spinner,
            angle: 360,
            duration: 1000,
            repeat: -1,
            ease: 'Linear'
        });

        // [핵심] 화면이 한 번 렌더링될 시간을 준 뒤(100ms), 무거운 씬을 시작함
        this.time.delayedCall(100, () => {
            if (this.targetScene) {
                this.scene.start(this.targetScene, this.targetData);
            }
        });
    }
}