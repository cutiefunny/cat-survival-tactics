import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';

export const getGameConfig = (containerId) => {
    return {
        type: Phaser.AUTO,
        width: 1600,
        height: 1200,
        parent: containerId,
        backgroundColor: '#3a3a3a',
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
        scene: [BattleScene]
    };
};