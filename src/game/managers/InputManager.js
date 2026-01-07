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

        // [New] 입력 상태 저장소 (드래그와 키보드 입력을 분리하여 저장 후 병합)
        this.dragState = { up: false, down: false, left: false, right: false };

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

        // [New] PC 단축키 설정 (Q, E, R)
        this.scene.input.keyboard.on('keydown-Q', () => {
            if (this.scene.toggleAutoBattle) this.scene.toggleAutoBattle();
        });
        this.scene.input.keyboard.on('keydown-E', () => {
            if (this.scene.toggleSquadState) this.scene.toggleSquadState();
        });
        this.scene.input.keyboard.on('keydown-R', () => {
            if (this.scene.toggleGameSpeed) this.scene.toggleGameSpeed();
        });

        // 이벤트 리스너 등록
        this.scene.input.on('pointerdown', (pointer) => this.handlePointerDown(pointer));
        this.scene.input.on('pointermove', (pointer) => this.handlePointerMove(pointer));
        this.scene.input.on('pointerup', (pointer) => this.handlePointerUp(pointer));
        
        // [New] 매 프레임 입력 상태 업데이트 (WASD + 드래그 통합)
        this.scene.events.on('update', this.processInputs, this);

        // [Fix] 배치 단계 드래그 이벤트
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
            // PC 모드거나 마우스 휠이 있는 경우 줌 동작 허용
            if (!this.scene.isMobile || pointer.type === 'mouse') {
                const currentZoom = this.scene.cameras.main.zoom;
                let newZoom = currentZoom - (deltaY * 0.001);
                newZoom = Phaser.Math.Clamp(newZoom, 0.3, 2.5);
                this.scene.cameras.main.setZoom(newZoom);
            }
        });
    }

    // [New] 입력 통합 처리 메서드 (Update Loop에서 호출)
    processInputs() {
        if (!this.scene.wasd) return;

        // 드래그 입력(dragState)과 WASD 입력(Key)을 OR 연산으로 통합
        this.virtualCursors.up.isDown = this.dragState.up || this.scene.wasd.up.isDown;
        this.virtualCursors.down.isDown = this.dragState.down || this.scene.wasd.down.isDown;
        this.virtualCursors.left.isDown = this.dragState.left || this.scene.wasd.left.isDown;
        this.virtualCursors.right.isDown = this.dragState.right || this.scene.wasd.right.isDown;
    }

    // [로직 1] 터치/클릭 시작: 유닛을 누르면 제어권 획득
    handlePointerDown(pointer) {
        // [Modified] PC여도 마우스 좌클릭이면 허용 (모바일 체크 제거)
        // pointer.button === 0 : 마우스 좌클릭 (터치는 보통 0)
        
        // [Fix] 전투 중이라면 배치 드래그 상태 강제 해제
        if (!this.scene.isSetupPhase) {
            this.isDraggingUnit = false;
        }

        if (this.isDraggingUnit) return; 

        // 플레이어 유닛 터치 판정
        if (this.scene.playerUnit && this.scene.playerUnit.active) {
            const unit = this.scene.playerUnit;
            
            // 유닛 중심점과 터치 포인트 사이의 거리 계산
            const dist = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, unit.x, unit.y);
            const hitThreshold = 80; 

            // 범위 내 클릭 시 조작 시작
            if (dist <= hitThreshold) {
                this.isControllingUnit = true;
                this.controlPointerId = pointer.id;
                this.dragOrigin = { x: pointer.x, y: pointer.y }; 

                // 조작 시작 시 카메라가 유닛을 다시 따라가도록 설정
                this.scene.cameras.main.startFollow(unit, true, 0.1, 0.1);
            }
        }
    }

    // [로직 2] 드래그: 기준점(dragOrigin) 대비 이동 방향 계산
    handlePointerMove(pointer) {
        // 1. [PC] 마우스 휠 클릭(Middle Button)으로 카메라 패닝
        const isMiddleBtn = (pointer.button === 1) || (pointer.middleButtonDown && pointer.middleButtonDown());
        if (pointer.isDown && isMiddleBtn) {
            this.panCamera(pointer);
            return;
        }

        // 2. [Mobile] 핀치 줌 (멀티터치)
        if (this.scene.isMobile && this.scene.input.pointer1.isDown && this.scene.input.pointer2.isDown) {
             this.handlePinchZoom(this.scene.input.pointer1, this.scene.input.pointer2);
             return;
        }
        this.prevPinchDistance = 0;

        // 3. [Common] 유닛 조작 (PC 좌클릭 드래그 or 모바일 터치 드래그)
        if (this.isControllingUnit && pointer.id === this.controlPointerId) {
            this.updateUnitMovement(pointer);
        }
        // 4. [Mobile] 배경 드래그 시 카메라 패닝 (유닛 조작 아닐 때)
        else if (this.scene.isMobile && pointer.isDown && !this.isDraggingUnit && !this.isControllingUnit) {
            this.panCamera(pointer);
        }
    }

    // [로직 3] 터치/클릭 종료
    handlePointerUp(pointer) {
        if (this.isControllingUnit && pointer.id === this.controlPointerId) {
            this.stopUnitMovement();
        }
    }

    updateUnitMovement(pointer) {
        const dx = pointer.x - this.dragOrigin.x;
        const dy = pointer.y - this.dragOrigin.y;
        const threshold = 15; // 민감도

        // [Modified] 직접 virtualCursors를 덮어쓰지 않고 dragStatus만 업데이트
        // (processInputs에서 WASD와 합쳐짐)
        this.dragState.left = dx < -threshold;
        this.dragState.right = dx > threshold;
        this.dragState.up = dy < -threshold;
        this.dragState.down = dy > threshold;
    }

    stopUnitMovement() {
        this.isControllingUnit = false;
        this.controlPointerId = -1;
        
        // 드래그 상태 초기화
        this.dragState.left = false;
        this.dragState.right = false;
        this.dragState.up = false;
        this.dragState.down = false;
        
        // 즉시 반영을 위해 processInputs 호출 (선택사항)
        this.processInputs();
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
            // PC에서도 편의를 위해 약간 줌아웃 할 수 있음 (선택사항)
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
            
            // [New] 이벤트 리스너 해제
            this.scene.events.off('update', this.processInputs, this);
            if (this.scene.input.keyboard) {
                this.scene.input.keyboard.off('keydown-Q');
                this.scene.input.keyboard.off('keydown-E');
                this.scene.input.keyboard.off('keydown-R');
            }

            this.scene.cursors = null;
            this.scene.wasd = null;
            this.scene.joystickCursors = null; 
            this.scene.scale.off('resize', this.handleResize, this);
        }
        this.spaceKey = null;
    }
}