import Phaser from 'phaser';
import { getGameConfig } from './phaserConfig';

export function launchGame(containerId) {
    // 1. 컨테이너 CSS 강제 설정 (중앙 정렬)
    const container = document.getElementById(containerId);
    if (container) {
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.display = 'flex';
        container.style.justifyContent = 'center';
        container.style.alignItems = 'center';
        container.style.margin = '0';
        container.style.padding = '0';
        container.style.overflow = 'hidden';
    }

    // 2. Phaser 게임 인스턴스 생성
    const config = getGameConfig(containerId);
    return new Phaser.Game(config);
}