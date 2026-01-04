import Phaser from 'phaser'; 

export default class InputManager {
    constructor(scene) {
        this.scene = scene;
        this.joyStick = null;
        this.orientationOverlay = null;
        this.isOrientationBad = false;
        
        this.spaceKey = null;
    }

    setupControls() {
        if (this.scene.cursors) return;

        this.scene.cursors = this.scene.input.keyboard.createCursorKeys();
        this.scene.wasd = this.scene.input.keyboard.addKeys({ up: 'W', left: 'A', down: 'S', right: 'D' });
        
        this.spaceKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        
        // [Modified] Drag Logic with Placement Constraints
        this.scene.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            if (this.scene.isSetupPhase) {
                let targetX = dragX;
                let targetY = dragY;

                // [New] 배치 제한 구역 확인
                if (this.scene.placementZone) {
                    const zone = this.scene.placementZone;
                    // 유닛 크기의 절반만큼 여유를 두어 벽 밖으로 나가지 않게 함 (선택사항)
                    const padding = gameObject.width / 2 || 20; 

                    targetX = Phaser.Math.Clamp(dragX, zone.x + padding, zone.right - padding);
                    targetY = Phaser.Math.Clamp(dragY, zone.y + padding, zone.bottom - padding);
                }

                gameObject.x = targetX;
                gameObject.y = targetY;
                
                if (gameObject.body) {
                    gameObject.body.x = targetX - gameObject.body.width / 2;
                    gameObject.body.y = targetY - gameObject.body.height / 2;
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
            this.scene.cameras.main.setZoom(0.8);
            
            this.createOrientationOverlay();
            this.scene.scale.on('resize', this.handleResize, this);
            this.checkOrientation();
            this.setupJoystick();
        }
    }

    setupJoystick() {
        if (!this.scene.plugins.get('rexVirtualJoystick')) return;

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
        
        this.scene.joystickCursors = this.joyStick.createCursorKeys();
    }

    createOrientationOverlay() {
        if (this.orientationOverlay) return; 

        this.orientationOverlay = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(9999).setVisible(false);
        const bg = this.scene.add.rectangle(0, 0, 100, 100, 0x000000).setOrigin(0.5); 
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
            
            if (this.scene.physics.world && !this.scene.physics.world.isPaused) {
                this.scene.physics.pause();
            }
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

        if (!this.scene.isMobile) {
            this.scene.cameras.main.setZoom(0.5); 
        } else {
            this.scene.cameras.main.setZoom(0.8);
        }

        this.checkOrientation();

        if (this.joyStick) {
            this.joyStick.setPosition(width - 80, height - 80);
        }
    }
    
    destroy() {
        if (this.joyStick) {
            this.joyStick.destroy();
            this.joyStick = null;
        }

        if (this.scene) {
            this.scene.cursors = null;
            this.scene.wasd = null;
            this.scene.joystickCursors = null;
            this.scene.scale.off('resize', this.handleResize, this);
        }

        this.spaceKey = null;
        if (this.orientationOverlay) {
            this.orientationOverlay.destroy();
            this.orientationOverlay = null;
        }
    }
}