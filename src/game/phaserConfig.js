import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';
// [New] 가상 조이스틱 플러그인 Import
import VirtualJoystickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';

export const getGameConfig = (containerId) => {
    return {
        type: Phaser.AUTO,
        width: 1600,
        height: 1200,
        parent: containerId,
        backgroundColor: '#3a3a3a',
        dom: {
            createContainer: true
        },
        scale: {
            mode: Phaser.Scale.FIT,
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
        // [New] 플러그인 등록
        plugins: {
            global: [{
                key: 'rexVirtualJoystick',
                plugin: VirtualJoystickPlugin,
                start: true
            }]
        },
        scene: [BattleScene]
    };
};