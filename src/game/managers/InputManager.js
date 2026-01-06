import Phaser from 'phaser'; 

export default class InputManager {
    constructor(scene) {
        this.scene = scene;
        this.spaceKey = null;

        // 모바일 제어 상태 변수
        this.prevPinchDistance = 0;
        this.isDraggingUnit = false; // 배치 단계 드래그

        // [New] 유닛 조작 상태 변수 (가상 조이스틱 대체)
        this.isControllingUnit = false;
        this.controlPointerId = -1;
        this.dragOrigin = { x: 0, y: 0 };

        // [New] 가상 커서 (Unit.js 호환용 - 조이스틱 신호 시뮬레이션)
        this.virtualCursors = {
            up: { isDown: false },
            down: { isDown: false },
            left: { isDown: false },
            right: { isDown: false }
        };
        // Unit.js가 참조하는 joystickCursors를 가상 커서로 연결
        this.scene.joystickCursors = this.virtualCursors;
    }

    setupControls() {
        if (this.scene.cursors) return;

        console.log("🎮 InputManager: Controls Setup Initialized");

        // 멀티터치 지원 (핀치 줌 등)
        this.scene.input.addPointer(2);

        this.scene.cursors = this.scene.input.keyboard.createCursorKeys();
        this.scene.wasd = this.scene.input.keyboard.addKeys({ up: 'W', left: 'A', down: 'S', right: 'D' });
        
        this.spaceKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // =========================================================
        // [New] 1. 유닛 터치 감지 (이동 시작)
        // =========================================================
        this.scene.input.on('pointerdown', (pointer) => {
            if (!this.scene.isMobile) return;
            if (this.isDraggingUnit) return; // 배치 중이면 무시

            // 플레이어 유닛 터치 판정
            if (this.scene.playerUnit && this.scene.playerUnit.active) {
                const unit = this.scene.playerUnit;
                const bounds = unit.getBounds();
                
                // 터치 영역 확장 (편의성)
                const hitPadding = 40; 
                
                // 월드 좌표 기준 히트 테스트
                if (pointer.worldX >= bounds.x - hitPadding && 
                    pointer.worldX <= bounds.right + hitPadding &&
                    pointer.worldY >= bounds.y - hitPadding && 
                    pointer.worldY <= bounds.bottom + hitPadding) {
                    
                    this.isControllingUnit = true;
                    this.controlPointerId = pointer.id;
                    this.dragOrigin = { x: pointer.x, y: pointer.y }; // 화면 좌표 기준 드래그 시작점

                    // 조작 시작 시 카메라가 유닛을 다시 따라가도록 설정
                    this.scene.cameras.main.startFollow(unit, true, 0.1, 0.1);
                }
            }
        });

        // =========================================================
        // [New] 2. 포인터 이동 (유닛 이동 or 카메라 조작)
        // =========================================================
        this.scene.input.on('pointermove', (pointer) => {
            // 1. [PC] 마우스 휠 클릭 이동
            const isMiddleBtn = (pointer.button === 1) || (pointer.middleButtonDown && pointer.middleButtonDown());
            if (!this.scene.isMobile && pointer.isDown && isMiddleBtn) {
                this.scene.cameras.main.stopFollow();
                const cam = this.scene.cameras.main;
                cam.scrollX -= (pointer.position.x - pointer.prevPosition.x) / cam.zoom;
                cam.scrollY -= (pointer.position.y - pointer.prevPosition.y) / cam.zoom;
            }

            // 2. [Mobile] 터치 제어
            if (this.scene.isMobile) {
                const p1 = this.scene.input.pointer1;
                const p2 = this.scene.input.pointer2;

                // A) 멀티터치 -> 핀치 줌
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

                    // B) 유닛 조작 중 (드래그로 이동 방향 결정)
                    if (this.isControllingUnit && pointer.id === this.controlPointerId) {
                        this.updateUnitMovement(pointer);
                    }
                    // C) 카메라 패닝 (유닛 조작 중이 아닐 때만)
                    else if (pointer.isDown && !this.isDraggingUnit && !this.isControllingUnit) {
                        this.scene.cameras.main.stopFollow(); // 시점 고정 (유닛 추적 해제)
                        const cam = this.scene.cameras.main;
                        cam.scrollX -= (pointer.position.x - pointer.prevPosition.x) / cam.zoom;
                        cam.scrollY -= (pointer.position.y - pointer.prevPosition.y) / cam.zoom;
                    }
                }
            }
        });

        // =========================================================
        // [New] 3. 터치 종료 (이동 멈춤)
        // =========================================================
        this.scene.input.on('pointerup', (pointer) => {
            if (this.isControllingUnit && pointer.id === this.controlPointerId) {
                this.stopUnitMovement();
            }
        });

        // 유닛 배치 드래그 (Setup Phase)
        this.scene.input.on('dragstart', () => { this.isDraggingUnit = true; });
        this.scene.input.on('dragend', () => { this.isDraggingUnit = false; });
        
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

        // PC 휠 줌
        this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            if (!this.scene.isMobile) {
                const currentZoom = this.scene.cameras.main.zoom;
                let newZoom = currentZoom - (deltaY * 0.001);
                newZoom = Phaser.Math.Clamp(newZoom, 0.3, 2.5);
                this.scene.cameras.main.setZoom(newZoom);
            }
        });
    }

    // [New] 드래그 거리에 따른 가상 커서 업데이트 (Unit.js가 읽을 수 있도록)
    updateUnitMovement(pointer) {
        const dx = pointer.x - this.dragOrigin.x;
        const dy = pointer.y - this.dragOrigin.y;
        const threshold = 15; // 민감도

        // 초기화
        this.virtualCursors.left.isDown = false;
        this.virtualCursors.right.isDown = false;
        this.virtualCursors.up.isDown = false;
        this.virtualCursors.down.isDown = false;

        // 방향 판정
        if (dx < -threshold) this.virtualCursors.left.isDown = true;
        else if (dx > threshold) this.virtualCursors.right.isDown = true;
        
        if (dy < -threshold) this.virtualCursors.up.isDown = true;
        else if (dy > threshold) this.virtualCursors.down.isDown = true;
    }

    // [New] 조작 종료 처리
    stopUnitMovement() {
        this.isControllingUnit = false;
        this.controlPointerId = -1;
        this.virtualCursors.left.isDown = false;
        this.virtualCursors.right.isDown = false;
        this.virtualCursors.up.isDown = false;
        this.virtualCursors.down.isDown = false;
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
            this.scene.scale.on('resize', this.handleResize, this);
            // setupJoystick 제거됨
        } else {
            console.log("💻 PC Device Detected.");
        }
    }

    handleResize(gameSize) {
        // 모바일 줌 초기화 로직 제거 (사용자 줌 유지)
    }
    
    destroy() {
        if (this.scene) {
            this.scene.cursors = null;
            this.scene.wasd = null;
            this.scene.joystickCursors = null; // 참조 해제
            this.scene.scale.off('resize', this.handleResize, this);
            
            this.scene.input.off('wheel'); 
            this.scene.input.off('pointermove'); 
            this.scene.input.off('drag');
            this.scene.input.off('dragstart');
            this.scene.input.off('dragend');
            this.scene.input.off('pointerdown'); 
            this.scene.input.off('pointerup');
        }

        this.spaceKey = null;
    }
}