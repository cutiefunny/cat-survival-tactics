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
            this.scene.cameras.main.setZoom(0.5);
            
            this.createOrientationOverlay();
            this.scene.scale.on('resize', this.handleResize, this);
            this.checkOrientation();
            this.setupJoystick();
        }
    }

    setupJoystick() {
        if (this.scene.plugins.get('rexVirtualJoystick')) {
            this.joyStick = this.scene.plugins.get('rexVirtualJoystick').add(this.scene, {
                x: this.scene.cameras.main.width - 50,
                y: this.scene.cameras.main.height - 50,
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
    }

    createOrientationOverlay() {
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
            this.orientationOverlay.setVisible(true);
            const bg = this.orientationOverlay.list[0];
            const txt = this.orientationOverlay.list[1];
            if(bg) bg.setSize(width, height).setPosition(width/2, height/2);
            if(txt) txt.setPosition(width/2, height/2);
            
            this.scene.physics.pause();
            this.isOrientationBad = true;
        } else {
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
            this.scene.cameras.main.setZoom(1);
        }

        this.checkOrientation();

        // Reposition Joystick
        if (this.joyStick) {
            this.joyStick.setPosition(width - 120, height - 120);
        }
    }
    
    destroy() {
        if (this.joyStick) {
            this.joyStick.base.setVisible(false);
            this.joyStick.thumb.setVisible(false);
        }
    }
}