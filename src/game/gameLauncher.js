import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';
import UIScene from './scenes/UIScene';
import StrategyScene from './scenes/StrategyScene';
import LoadingScene from './scenes/LoadingScene'; // [New]
import EventScene from './scenes/EventScene'; // [New]

export function launchGame(containerId, mockData = null) {
    // [Modified] Mock 모드에서는 BattleScene을 첫 씬으로 시작 (EventScene 자동 재생 방지)
    const sceneList = mockData 
        ? [BattleScene, UIScene, EventScene, LoadingScene] 
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

                    // [Modified] Mock 모드는 항상 BattleScene으로 시작하되, 스크립트 데이터는 전달 유지
                    const startSceneKey = 'BattleScene';
                    game.scene.stop(startSceneKey);
                    game.scene.start(startSceneKey, {
                        levelIndex: mockData.config.gameSettings.startLevelIndex,
                        debugConfig: mockData.config,
                        script: mockData.script || null,
                        armyConfig: mockData.armyConfig || null
                    });
                }
            }
        }
    };

    return new Phaser.Game(config);
}