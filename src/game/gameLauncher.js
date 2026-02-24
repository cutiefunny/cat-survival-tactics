import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';
import UIScene from './scenes/UIScene';
import StrategyScene from './scenes/StrategyScene';
import LoadingScene from './scenes/LoadingScene'; // [New]
import EventScene from './scenes/EventScene'; // [New]

export function launchGame(containerId, mockData = null) {
    // [Modified] mockData 없을 때만 LoadingScene 포함
    const sceneList = mockData 
        ? [BattleScene, UIScene, EventScene] 
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
                    console.log('🎮 [GameLauncher] postBoot - mockData detected, starting BattleScene directly');
                    game.registry.set('playerSquad', mockData.squad);
                    game.registry.set('playerCoins', mockData.config.gameSettings.initialCoins);

                    try {
                        // [Modified] 아케이드 모드는 LoadingScene 없이 직접 BattleScene 시작
                        console.log('🎮 [GameLauncher] Starting BattleScene directly...');
                        game.scene.start('BattleScene', {
                            levelIndex: mockData.config.gameSettings.startLevelIndex,
                            debugConfig: mockData.config,
                            script: mockData.script || null,
                            armyConfig: mockData.armyConfig || null,
                            // [Arcade Mode] 아케이드 모드 데이터 전달
                            isArcadeMode: mockData.isArcadeMode || false,
                            arcadeTerritoryId: mockData.arcadeTerritoryId || null,
                            arcadeMapId: mockData.arcadeMapId || null,
                            arcadeTerritoryName: mockData.arcadeTerritoryName || null
                        });
                    } catch (error) {
                        console.error('❌ [GameLauncher] Error starting BattleScene:', error);
                    }
                }
            }
        }
    };

    return new Phaser.Game(config);
}