import Phaser from 'phaser';

export default class StrategyCameraManager {
    constructor(scene) {
        this.scene = scene;
        this.camera = scene.cameras.main;
        this.prevPinchDistance = 0;
        this.minZoom = 1;
    }

    /**
     * 카메라 레이아웃 업데이트
     */
    updateLayout() {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const isPC = this.scene.sys.game.device.os.desktop;
        const mapWidth = this.scene.mapManager.mapWidth || 1024;
        const mapHeight = this.scene.mapManager.mapHeight || 1024;

        // 최소 줌 계산
        const zoomFitWidth = screenWidth / mapWidth;
        const zoomFitHeight = screenHeight / mapHeight;
        this.minZoom = isPC ? zoomFitHeight : zoomFitWidth;

        // 현재 줌이 최소값보다 작으면 조정
        if (this.camera.zoom < this.minZoom || this.camera.zoom === 1) {
            this.camera.setZoom(this.minZoom);
        }

        // 카메라 바운드 설정
        const currentZoom = this.camera.zoom;
        const displayWidth = screenWidth / currentZoom;
        const displayHeight = screenHeight / currentZoom;
        const offsetX = Math.max(0, (displayWidth - mapWidth) / 2);
        const offsetY = Math.max(0, (displayHeight - mapHeight) / 2);

        this.camera.setBounds(
            -offsetX,
            -offsetY,
            Math.max(mapWidth, displayWidth),
            Math.max(mapHeight, displayHeight)
        );
    }

    /**
     * 카메라 컨트롤 설정
     */
    setupControls() {
        // 마우스 휠 줌
        this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            const newZoom = this.camera.zoom - deltaY * 0.001;
            const clampedZoom = Phaser.Math.Clamp(newZoom, this.minZoom, 3);
            this.camera.setZoom(clampedZoom);
            this.updateLayout();
        });

        // 드래그로 팬
        this.scene.input.on('pointermove', (pointer) => {
            // 핀치 줌 중에는 팬 비활성화
            if (this.scene.input.pointer1.isDown && this.scene.input.pointer2.isDown) return;

            if (pointer.isDown) {
                this.camera.scrollX -= (pointer.x - pointer.prevPosition.x) / this.camera.zoom;
                this.camera.scrollY -= (pointer.y - pointer.prevPosition.y) / this.camera.zoom;
            }
        });
    }

    /**
     * 핀치 줌 처리 (update에서 호출)
     */
    handlePinchZoom() {
        if (this.scene.input.pointer1.isDown && this.scene.input.pointer2.isDown) {
            const distance = Phaser.Math.Distance.Between(
                this.scene.input.pointer1.x,
                this.scene.input.pointer1.y,
                this.scene.input.pointer2.x,
                this.scene.input.pointer2.y
            );

            if (this.prevPinchDistance > 0) {
                const distanceDiff = (distance - this.prevPinchDistance) * 0.005;
                const newZoom = this.camera.zoom + distanceDiff;
                const clampedZoom = Phaser.Math.Clamp(newZoom, this.minZoom, 3);
                this.camera.setZoom(clampedZoom);
                this.updateLayout();
            }

            this.prevPinchDistance = distance;
        } else {
            this.prevPinchDistance = 0;
        }
    }

    /**
     * 리사이즈 처리
     */
    handleResize() {
        this.updateLayout();
    }
}
