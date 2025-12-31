import Phaser from 'phaser'; 

export default class InputManager {
    constructor(scene) {
        this.scene = scene;
        this.joyStick = null;
        this.orientationOverlay = null;
        this.isOrientationBad = false;
        
        // 스킬 사용을 위한 스페이스바 키 참조
        this.spaceKey = null;
    }

    setupControls() {
        // [Safety] 이미 키 설정이 되어있다면 중복 할당 방지 (필요 시 destroy 후 재설정 권장)
        if (this.scene.cursors) return;

        // PC Controls (유닛이 직접 참조하므로 Scene에 할당)
        this.scene.cursors = this.scene.input.keyboard.createCursorKeys();
        this.scene.wasd = this.scene.input.keyboard.addKeys({ up: 'W', left: 'A', down: 'S', right: 'D' });
        
        // [Fix] Spacebar는 BattleScene이 InputManager를 통해 참조하므로 this.spaceKey에 할당
        this.spaceKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        
        // Drag for setup phase
        this.scene.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            if (this.scene.isSetupPhase) {
                gameObject.x = dragX;
                gameObject.y = dragY;
                if (gameObject.body) {
                    gameObject.body.x = dragX - gameObject.body.width / 2;
                    gameObject.body.y = dragY - gameObject.body.height / 2;
                }
            }
        });
    }

    checkMobileAndSetup() {
        const isMobile = this.scene.sys.game.device.os.android || 
                         this.scene.sys.game.device.os.iOS || 
                         this.scene.sys.game.device.os.iPad || 
                         this.scene.sys.game.device.os.iPhone;
        
        this.scene.isMobile = isMobile;

        if (isMobile) {
            console.log("📱 Mobile Device Detected.");
            // 모바일에서는 줌을 좀 더 당겨서 잘 보이게 설정
            this.scene.cameras.main.setZoom(0.8);
            
            this.createOrientationOverlay();
            this.scene.scale.on('resize', this.handleResize, this);
            this.checkOrientation();
            this.setupJoystick();
        }
    }

    setupJoystick() {
        // [Safety] 플러그인이 없으면 중단
        if (!this.scene.plugins.get('rexVirtualJoystick')) return;

        // [Cleanup] 기존 조이스틱이 있다면 제거 후 재생성 (중복 방지)
        if (this.joyStick) {
            this.joyStick.destroy();
            this.joyStick = null;
        }

        this.joyStick = this.scene.plugins.get('rexVirtualJoystick').add(this.scene, {
            x: this.scene.cameras.main.width - 80,
            y: this.scene.cameras.main.height - 80,
            radius: 80,
            base: this.scene.add.circle(0, 0, 80, 0x888888, 0.5).setDepth(100),
            thumb: this.scene.add.circle(0, 0, 40, 0xcccccc, 0.8).setDepth(101),
            dir: '8dir',
            forceMin: 16,
            enable: true
        });
        
        this.joyStick.base.setScrollFactor(0);
        this.joyStick.thumb.setScrollFactor(0);
        
        // Unit.js가 참조할 수 있도록 Scene에 할당
        this.scene.joystickCursors = this.joyStick.createCursorKeys();
    }

    createOrientationOverlay() {
        if (this.orientationOverlay) return; // 이미 있으면 생성 안 함

        this.orientationOverlay = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(9999).setVisible(false);
        const bg = this.scene.add.rectangle(0, 0, 100, 100, 0x000000).setOrigin(0.5); // size will be updated
        const text = this.scene.add.text(0, 0, "Please Rotate Your Device\n↔️ Landscape Only", {
            fontSize: '40px', color: '#ffffff', align: 'center', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.orientationOverlay.add([bg, text]);
    }

    checkOrientation() {
        if (!this.orientationOverlay) return;
        const { width, height } = this.scene.scale;
        
        if (height > width) {
            // 세로 모드(Portrait) 감지 시 일시정지
            this.orientationOverlay.setVisible(true);
            const bg = this.orientationOverlay.list[0];
            const txt = this.orientationOverlay.list[1];
            if(bg) bg.setSize(width, height).setPosition(width/2, height/2);
            if(txt) txt.setPosition(width/2, height/2);
            
            if (this.scene.physics.world && !this.scene.physics.world.isPaused) {
                this.scene.physics.pause();
            }
            this.isOrientationBad = true;
        } else {
            // 가로 모드(Landscape) 복귀
            this.orientationOverlay.setVisible(false);
            if (this.isOrientationBad && !this.scene.isGameOver) {
                this.scene.physics.resume();
            }
            this.isOrientationBad = false;
        }
    }

    handleResize(gameSize) {
        const width = gameSize.width;
        const height = gameSize.height;

        // PC/Mobile Zoom Logic
        if (!this.scene.isMobile) {
            this.scene.cameras.main.setZoom(0.5); // PC Test Mode Zoom
        } else {
            // 모바일 줌 레벨 조정 (너무 작지 않게 0.8 정도 권장)
            this.scene.cameras.main.setZoom(0.8);
        }

        this.checkOrientation();

        // Reposition Joystick
        if (this.joyStick) {
            this.joyStick.setPosition(width - 80, height - 80);
        }
    }
    
    destroy() {
        // 1. 조이스틱 정리
        if (this.joyStick) {
            this.joyStick.destroy();
            this.joyStick = null;
        }

        // 2. Scene에 할당된 입력 참조 해제 (중요: 재시작 시 꼬임 방지)
        if (this.scene) {
            this.scene.cursors = null;
            this.scene.wasd = null;
            this.scene.joystickCursors = null;
            
            // 리사이즈 이벤트 리스너 해제
            this.scene.scale.off('resize', this.handleResize, this);
        }

        // 3. 내부 변수 정리
        this.spaceKey = null;
        if (this.orientationOverlay) {
            this.orientationOverlay.destroy();
            this.orientationOverlay = null;
        }
    }
}