import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';
import VirtualJoystickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';
import UIScene from './scenes/UIScene'; // [Check] UIScene Import

export const getGameConfig = (containerId) => {
    // [New] 모바일 디바이스 감지
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    return {
        type: Phaser.AUTO,
        // [New] 모바일이면 화면 크기에 맞춤, 데스크탑이면 고정 해상도
        width: isMobile ? window.innerWidth : 1600,
        height: isMobile ? window.innerHeight : 1200,
        parent: containerId,
        backgroundColor: '#3a3a3a',
        dom: {
            createContainer: true
        },
        scale: {
            // [Fix] RESIZE: 화면 꽉 채움 (비율 유지, 왜곡 없음) vs FIT: 고정 비율 (레터박스 가능성)
            mode: isMobile ? Phaser.Scale.RESIZE : Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        pixelArt: true,
        physics: {
            default: 'arcade',
            arcade: {
                debug: false,
                gravity: { y: 0 }
            }
        },
        plugins: {
            global: [{
                key: 'rexVirtualJoystick',
                plugin: VirtualJoystickPlugin,
                start: true
            }]
        },
        // [Check] BattleScene 먼저, 그 위에 UIScene이 오버레이되도록 순서 배치
        scene: [BattleScene, UIScene]
    };
};