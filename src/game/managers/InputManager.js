import Phaser from 'phaser'; 

export default class InputManager {
    constructor(scene) {
        this.scene = scene;
        this.joyStick = null;
        // [Removed] orientationOverlay 및 isOrientationBad 제거
        
        this.spaceKey = null;

        // 모바일 제어 상태 변수
        this.prevPinchDistance = 0;
        this.isDraggingUnit = false;
    }

    setupControls() {
        if (this.scene.cursors) return;

        // 멀티터치 활성화 (기본 1개 + 추가 1개 = 총 2개)
        this.scene.input.addPointer(1);

        this.scene.cursors = this.scene.input.keyboard.createCursorKeys();
        this.scene.wasd = this.scene.input.keyboard.addKeys({ up: 'W', left: 'A', down: 'S', right: 'D' });
        
        this.spaceKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // 유닛 드래그 상태 추적 (카메라 이동과 겹침 방지)
        this.scene.input.on('dragstart', () => { this.isDraggingUnit = true; });
        this.scene.input.on('dragend', () => { this.isDraggingUnit = false; });
        
        // [PC Only] 마우스 휠 줌 (Zoom In/Out)
        this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            if (!this.scene.isMobile) {
                const currentZoom = this.scene.cameras.main.zoom;
                const zoomFactor = 0.001; 
                
                let newZoom = currentZoom - (deltaY * zoomFactor);
                newZoom = Phaser.Math.Clamp(newZoom, 0.3, 2.5);
                
                this.scene.cameras.main.setZoom(newZoom);
            }
        });

        // [PC & Mobile] 카메라 이동 및 줌 통합 핸들러
        this.scene.input.on('pointermove', (pointer) => {
            // 1. [PC] 마우스 휠 클릭(Middle Button)으로 화면 이동
            if (!this.scene.isMobile && pointer.isDown && pointer.middleButtonDown()) {
                const cam = this.scene.cameras.main;
                const dx = (pointer.position.x - pointer.prevPosition.x) / cam.zoom;
                const dy = (pointer.position.y - pointer.prevPosition.y) / cam.zoom;
                cam.scrollX -= dx;
                cam.scrollY -= dy;
            }

            // 2. [Mobile] 터치 제어
            if (this.scene.isMobile) {
                const p1 = this.scene.input.pointer1;
                const p2 = this.scene.input.pointer2;

                // A. 핀치 줌 (두 손가락)
                if (p1.isDown && p2.isDown) {
                    const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
                    
                    if (this.prevPinchDistance > 0) {
                        const diff = dist - this.prevPinchDistance;
                        const zoomFactor = 0.002; 
                        
                        let newZoom = this.scene.cameras.main.zoom + (diff * zoomFactor);
                        newZoom = Phaser.Math.Clamp(newZoom, 0.3, 2.5);
                        this.scene.cameras.main.setZoom(newZoom);
                    }
                    this.prevPinchDistance = dist;
                } 
                else {
                    this.prevPinchDistance = 0;

                    // B. 그라운드 팬 (한 손가락)
                    // 조건: 터치 중 + 유닛 드래그 아님 + 조이스틱 조작 아님
                    const isUsingJoystick = (this.joyStick && this.joyStick.pointer === pointer);
                    
                    if (pointer.isDown && !this.isDraggingUnit && !isUsingJoystick) {
                        const cam = this.scene.cameras.main;
                        const dx = (pointer.position.x - pointer.prevPosition.x) / cam.zoom;
                        const dy = (pointer.position.y - pointer.prevPosition.y) / cam.zoom;
                        cam.scrollX -= dx;
                        cam.scrollY -= dy;
                    }
                }
            }
        });

        // [Common] 유닛 드래그 배치 (Unit Placement)
        this.scene.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            if (this.scene.isSetupPhase) {
                let targetX = dragX;
                let targetY = dragY;

                if (this.scene.placementZone) {
                    const zone = this.scene.placementZone;
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
            
            // [Removed] createOrientationOverlay 및 checkOrientation 호출 제거
            this.scene.scale.on('resize', this.handleResize, this);
            this.setupJoystick();
        } else {
            // PC 초기 줌 설정
            // this.scene.cameras.main.setZoom(0.5); 
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

    // [Removed] createOrientationOverlay() 메서드 삭제
    // [Removed] checkOrientation() 메서드 삭제

    handleResize(gameSize) {
        const width = gameSize.width;
        const height = gameSize.height;

        if (this.scene.isMobile) {
            this.scene.cameras.main.setZoom(0.8);
        }

        // [Removed] checkOrientation 호출 제거

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
            
            this.scene.input.off('wheel'); 
            this.scene.input.off('pointermove'); 
            this.scene.input.off('drag');
            this.scene.input.off('dragstart');
            this.scene.input.off('dragend');
        }

        this.spaceKey = null;
        // [Removed] orientationOverlay 정리 코드 삭제
    }
}