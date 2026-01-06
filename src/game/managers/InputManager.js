import Phaser from 'phaser'; 

export default class InputManager {
    constructor(scene) {
        this.scene = scene;
        this.spaceKey = null;

        // 모바일 제어 상태 변수
        this.prevPinchDistance = 0;
        this.isDraggingUnit = false; // 배치 단계 드래그 상태 확인용

        // [New] 유닛 조작 상태 변수 (가상 조이스틱)
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

        // 이벤트 리스너 등록 (메서드 분리)
        this.scene.input.on('pointerdown', (pointer) => this.handlePointerDown(pointer));
        this.scene.input.on('pointermove', (pointer) => this.handlePointerMove(pointer));
        this.scene.input.on('pointerup', (pointer) => this.handlePointerUp(pointer));
        
        // [Fix] 배치 단계 드래그 이벤트 (전투 중에는 무시하도록 처리)
        this.scene.input.on('dragstart', () => { 
            if (this.scene.isSetupPhase) {
                this.isDraggingUnit = true; 
            }
        });
        this.scene.input.on('dragend', () => { 
            this.isDraggingUnit = false; 
        });
        this.scene.input.on('drag', (pointer, gameObject, dragX, dragY) => this.handlePlacementDrag(pointer, gameObject, dragX, dragY));

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

    // [로직 1] 터치 시작: 유닛을 누르면 제어권 획득
    handlePointerDown(pointer) {
        if (!this.scene.isMobile) return;
        
        // [Fix] 전투 중이라면 배치 드래그 상태 강제 해제 (안전장치)
        if (!this.scene.isSetupPhase) {
            this.isDraggingUnit = false;
        }

        // [Debug] 터치 시작 로그
        // console.log(`[Input] Pointer Down: ID=${pointer.id}, Phase=${this.scene.isSetupPhase ? 'SETUP' : 'BATTLE'}, IsDragging=${this.isDraggingUnit}`);

        if (this.isDraggingUnit) return; 

        // 플레이어 유닛 터치 판정
        if (this.scene.playerUnit && this.scene.playerUnit.active) {
            const unit = this.scene.playerUnit;
            
            // [Improvement] 사각형 Bounds 대신 거리(Radius) 기반 체크로 변경
            // 유닛 중심점과 터치 포인트 사이의 거리 계산 (Zoom 고려하여 World 좌표 사용)
            const dist = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, unit.x, unit.y);
            const hitThreshold = 80; // 터치 인식 반경 (픽셀 단위, 넉넉하게 설정)

            if (dist <= hitThreshold) {
                this.isControllingUnit = true;
                this.controlPointerId = pointer.id;
                this.dragOrigin = { x: pointer.x, y: pointer.y }; // 화면 터치 지점을 기준점으로 설정

                console.log(`✅ [Input] Control STARTED. Dist: ${Math.floor(dist)}px (Threshold: ${hitThreshold})`);

                // 조작 시작 시 카메라가 유닛을 다시 따라가도록 설정
                this.scene.cameras.main.startFollow(unit, true, 0.1, 0.1);
            } else {
                console.log(`❌ [Input] Missed Unit. Dist: ${Math.floor(dist)}px > ${hitThreshold}`);
            }
        } else {
            console.log(`⚠️ [Input] No Active Player Unit`);
        }
    }

    // [로직 2] 드래그: 기준점(dragOrigin) 대비 이동 방향 계산
    handlePointerMove(pointer) {
        // 1. [PC] 마우스 휠 클릭 이동
        const isMiddleBtn = (pointer.button === 1) || (pointer.middleButtonDown && pointer.middleButtonDown());
        if (!this.scene.isMobile && pointer.isDown && isMiddleBtn) {
            this.panCamera(pointer);
            return;
        }

        // 2. [Mobile] 터치 제어
        if (this.scene.isMobile) {
            const p1 = this.scene.input.pointer1;
            const p2 = this.scene.input.pointer2;

            // A) 멀티터치 -> 핀치 줌
            if (p1.isDown && p2.isDown) {
                this.handlePinchZoom(p1, p2);
                return;
            } 
            this.prevPinchDistance = 0;

            // B) 유닛 조작 중 (드래그로 이동 방향 결정)
            if (this.isControllingUnit && pointer.id === this.controlPointerId) {
                this.updateUnitMovement(pointer);
            }
            // C) 카메라 패닝 (유닛 조작 중이 아닐 때만)
            else if (pointer.isDown && !this.isDraggingUnit && !this.isControllingUnit) {
                this.panCamera(pointer);
            }
        }
    }

    // [로직 3] 터치 종료: 이동 멈춤
    handlePointerUp(pointer) {
        if (this.isControllingUnit && pointer.id === this.controlPointerId) {
            console.log(`🛑 [Input] Control ENDED. PointerID: ${pointer.id}`);
            this.stopUnitMovement();
        }
    }

    updateUnitMovement(pointer) {
        const dx = pointer.x - this.dragOrigin.x;
        const dy = pointer.y - this.dragOrigin.y;
        const threshold = 15; // 민감도 (픽셀)

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

    stopUnitMovement() {
        this.isControllingUnit = false;
        this.controlPointerId = -1;
        this.virtualCursors.left.isDown = false;
        this.virtualCursors.right.isDown = false;
        this.virtualCursors.up.isDown = false;
        this.virtualCursors.down.isDown = false;
    }

    panCamera(pointer) {
        this.scene.cameras.main.stopFollow();
        const cam = this.scene.cameras.main;
        cam.scrollX -= (pointer.position.x - pointer.prevPosition.x) / cam.zoom;
        cam.scrollY -= (pointer.position.y - pointer.prevPosition.y) / cam.zoom;
    }

    handlePinchZoom(p1, p2) {
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.prevPinchDistance > 0) {
            const diff = dist - this.prevPinchDistance;
            const newZoom = Phaser.Math.Clamp(this.scene.cameras.main.zoom + (diff * 0.002), 0.3, 2.5);
            this.scene.cameras.main.setZoom(newZoom);
        }
        this.prevPinchDistance = dist;
    }

    handlePlacementDrag(pointer, gameObject, dragX, dragY) {
        // [Fix] isSetupPhase 체크 강화
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
        } else {
            console.log("💻 PC Device Detected.");
        }
    }

    handleResize(gameSize) {
        // 모바일 리사이즈 대응
    }
    
    destroy() {
        if (this.scene) {
            this.scene.input.off('wheel'); 
            this.scene.input.off('pointermove'); 
            this.scene.input.off('drag');
            this.scene.input.off('dragstart');
            this.scene.input.off('dragend');
            this.scene.input.off('pointerdown'); 
            this.scene.input.off('pointerup');
            
            this.scene.cursors = null;
            this.scene.wasd = null;
            this.scene.joystickCursors = null; 
            this.scene.scale.off('resize', this.handleResize, this);
        }
        this.spaceKey = null;
    }
}