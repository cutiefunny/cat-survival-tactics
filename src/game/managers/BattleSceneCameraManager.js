export default class BattleSceneCameraManager {
    constructor(scene) {
        this.scene = scene;
        this.camera = scene.cameras.main;
    }

    /**
     * 맵에 카메라를 맞춤 (줌 및 센터링)
     */
    fitToMap() {
        if (!this.scene.mapWidth || !this.scene.mapHeight) return;

        const isPC = this.scene.sys.game.device.os.desktop;

        // PC는 1:1 줌으로 고정
        if (isPC) {
            this.camera.setZoom(1);
            this.camera.centerOn(this.scene.mapWidth / 2, this.scene.mapHeight / 2);
            return;
        }

        // 모바일: 화면에 맞게 줌 조정
        const { width, height } = this.scene.scale;
        const footerHeight = 80;
        const availableHeight = height - footerHeight;
        
        const zoomX = width / this.scene.mapWidth;
        const zoomY = availableHeight / this.scene.mapHeight;
        let targetZoom = Math.max(zoomX, zoomY);
        
        // [Arcade Mode] forceArcadeZoom이 설정되어 있으면 그것을 사용
        if (this.scene.forceArcadeZoom) {
            targetZoom = this.scene.forceArcadeZoom;
            console.log(`🎮 [Camera] Using forced arcade zoom: ${targetZoom}`);
        }

        this.camera.setZoom(targetZoom);
        this.camera.setBounds(0, 0, this.scene.mapWidth, this.scene.mapHeight);
        
        // 맵 중앙 정렬
        const mapCenterX = this.scene.mapWidth / 2;
        const mapCenterY = this.scene.mapHeight / 2;
        this.camera.centerOn(mapCenterX, mapCenterY);

        // Footer 오프셋 조정
        const screenCenterY = height / 2;
        const safeCenterY = availableHeight / 2;
        const offset = (screenCenterY - safeCenterY) / targetZoom;
        this.camera.scrollY -= offset;
    }

    /**
     * 카메라 바운드 업데이트
     */
    updateBounds(width, height) {
        if (!this.scene.mapWidth) return;
        this.camera.setBounds(0, 0, this.scene.mapWidth, this.scene.mapHeight);
    }

    /**
     * 플레이어 유닛을 따라가도록 설정
     */
    followPlayer(playerUnit) {
        if (!playerUnit || !playerUnit.active) return;
        if (this.scene.sys.game.device.os.desktop) return; // PC는 따라가지 않음

        this.camera.startFollow(playerUnit, true, 0.1, 0.1);
        
        const { width, height } = this.scene.scale;
        this.camera.setDeadzone(width * 0.4, height * 0.4);
    }

    /**
     * 카메라 따라가기 중지
     */
    stopFollow() {
        this.camera.stopFollow();
    }

    /**
     * 카메라 데드존 업데이트 (리사이즈 시)
     */
    updateDeadzone(width, height) {
        if (this.camera.deadzone) {
            this.camera.setDeadzone(width * 0.4, height * 0.4);
        }
    }

    /**
     * 특정 위치로 카메라 센터링
     */
    centerOn(x, y) {
        this.camera.centerOn(x, y);
    }

    /**
     * 카메라 줌 설정
     */
    setZoom(zoom) {
        this.camera.setZoom(zoom);
    }

    /**
     * 현재 카메라 줌 가져오기
     */
    getZoom() {
        return this.camera.zoom;
    }

    /**
     * 리사이즈 처리
     */
    handleResize(width, height) {
        this.updateBounds(width, height);
        this.updateDeadzone(width, height);
    }
}
