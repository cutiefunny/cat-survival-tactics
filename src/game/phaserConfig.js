// src/game/phaserConfig.js
import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';
import StrategyScene from './scenes/StrategyScene'; // StrategyScene 명시적 임포트 확인 필요
import UIScene from './scenes/UIScene'; 
import EventScene from './scenes/EventScene'; // [New] EventScene 추가
import VirtualJoystickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';

export const getGameConfig = (containerId) => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    return {
        type: Phaser.AUTO,
        width: isMobile ? window.innerWidth : 1600,
        height: isMobile ? window.innerHeight : 1200,
        parent: containerId,
        backgroundColor: '#3a3a3a',
        dom: {
            createContainer: true
        },
        scale: {
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
        // [Modified] EventScene 추가
        scene: [StrategyScene, BattleScene, UIScene, EventScene]
    };
};