import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';
import UIScene from './scenes/UIScene';
import StrategyScene from './scenes/StrategyScene';
import LoadingScene from './scenes/LoadingScene'; // [New]
import EventScene from './scenes/EventScene'; // [New]

export function launchGame(containerId, mockData = null) {
    // [Modified] EventScene를 항상 포함하도록 수정 (Mock 모드에서 스크립트 실행을 위해)
    const sceneList = mockData 
        ? [EventScene, LoadingScene, BattleScene, UIScene] 
        : [EventScene, StrategyScene, LoadingScene, BattleScene, UIScene];

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

                    // [Modified] 스크립트가 있으면 EventScene을 시작, 없으면 바로 BattleScene으로
                    if (mockData.script && mockData.script.length > 0) {
                        const startSceneKey = 'EventScene';
                        game.scene.stop(startSceneKey);
                        game.scene.start(startSceneKey, {
                            script: mockData.script,
                            nextScene: 'BattleScene',
                            nextSceneData: {
                                levelIndex: mockData.config.gameSettings.startLevelIndex,
                                debugConfig: mockData.config 
                            }
                        });
                    } else {
                        const startSceneKey = 'BattleScene';
                        game.scene.stop(startSceneKey);
                        game.scene.start(startSceneKey, {
                            levelIndex: mockData.config.gameSettings.startLevelIndex,
                            debugConfig: mockData.config 
                        });
                    }
                }
            }
        }
    };

    return new Phaser.Game(config);
}