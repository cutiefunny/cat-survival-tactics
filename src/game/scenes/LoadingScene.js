import Phaser from 'phaser';

export default class LoadingScene extends Phaser.Scene {
    constructor() {
        super('LoadingScene');
    }

    init(data) {
        this.targetScene = data?.targetScene;
        this.targetData = data?.targetData;
        // [설정] 최소 유지 시간 1초 (컷씬 연출용 시간 확보)
        this.minDuration = 1000;
        console.log('🎮 [LoadingScene] Init - targetScene:', this.targetScene);
        if (!this.targetScene) {
            console.error('❌ [LoadingScene] targetScene not provided!');
        }
    }

    preload() {
        // --- 버튼 이미지 프리로드 (상태별 이미지 포함) ---
        // 1. 시스템 및 인벤토리
        this.load.image('item', 'buttons/item.png');
        
        // 2. 자동/수동 전투 (동일 이미지 사용, 틴트로 구분)
        this.load.image('auto', 'buttons/auto.png');
        
        // 3. 부대 명령
        this.load.image('attack', 'buttons/attack.png');
        this.load.image('idle', 'buttons/idle.png');
        this.load.image('stop', 'buttons/stop.png');
        
        // 4. 배속 컨트롤
        this.load.image('1x', 'buttons/1x.png');
        this.load.image('2x', 'buttons/2x.png');
        this.load.image('3x', 'buttons/3x.png');

        // 로딩 진행바 시각화 (선택 사항)
        const { width, height } = this.scale;
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2 + 50, 320, 30);

        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 + 60, 300 * value, 10);
        });

        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
        });
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

        // [핵심] 최소 1초 대기 후 타겟 씬 시작
        console.log('🎮 [LoadingScene] Create - targetScene:', this.targetScene, 'minDuration:', this.minDuration);
        console.log('🎮 [LoadingScene] Setting up delayedCall...');
        this.time.delayedCall(this.minDuration, () => {
            console.log('🎮 [LoadingScene] DelayedCall fired!');
            if (this.targetScene) {
                console.log('🎮 [LoadingScene] Starting scene:', this.targetScene);
                try {
                    this.scene.start(this.targetScene, this.targetData);
                } catch (error) {
                    console.error('❌ [LoadingScene] Error starting scene:', error);
                }
            } else {
                console.error('❌ [LoadingScene] targetScene is undefined!');
            }
        });
    }
}