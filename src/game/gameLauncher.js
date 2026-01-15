import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';
import UIScene from './scenes/UIScene';
import StrategyScene from './scenes/StrategyScene';
import LoadingScene from './scenes/LoadingScene'; // [New]

export function launchGame(containerId, mockData = null) {
    // [Modified] LoadingScene 추가
    const sceneList = mockData 
        ? [LoadingScene, BattleScene, UIScene] 
        : [StrategyScene, LoadingScene, BattleScene, UIScene];

    const config = {
        type: Phaser.AUTO,
        parent: containerId,
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        physics: {
            default: 'arcade',
            arcade: {
                debug: mockData?.config?.showDebugStats || false, 
                gravity: { y: 0 } 
            }
        },
        scene: sceneList,
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        callbacks: {
            postBoot: (game) => {
                if (mockData) {
                    game.registry.set('playerSquad', mockData.squad);
                    game.registry.set('playerCoins', mockData.config.gameSettings.initialCoins);

                    const startSceneKey = 'BattleScene';
                    game.scene.stop(startSceneKey);
                    game.scene.start(startSceneKey, {
                        levelIndex: mockData.config.gameSettings.startLevelIndex,
                        debugConfig: mockData.config 
                    });
                }
            }
        }
    };

    return new Phaser.Game(config);
}