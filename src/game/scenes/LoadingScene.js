import Phaser from 'phaser';

export default class LoadingScene extends Phaser.Scene {
    constructor() {
        super('LoadingScene');
    }

    init(data) {
        this.targetScene = data.targetScene;
        this.targetData = data.targetData;
        // [설정] 최소 유지 시간 1초 (컷씬 연출용 시간 확보)
        this.minDuration = 1000; 
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

        // 3. 텍스트 깜빡임 효과
        this.tweens.add({
            targets: loadingText,
            alpha: 0.3,
            duration: 800,
            yoyo: true,
            repeat: -1
        });

        // 4. 스피너 (로딩 중임을 알리는 회전 UI)
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

        // [핵심] 최소 2초 대기 후 타겟 씬 시작
        this.time.delayedCall(this.minDuration, () => {
            if (this.targetScene) {
                this.scene.start(this.targetScene, this.targetData);
            }
        });
    }
}