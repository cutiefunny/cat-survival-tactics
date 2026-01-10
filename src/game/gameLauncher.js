import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';
import UIScene from './scenes/UIScene';
import StrategyScene from './scenes/StrategyScene';

export function launchGame(containerId, mockData = null) {
    // 모의전투 여부에 따라 씬 목록 구성 (모의전투 시 StrategyScene 제외)
    const sceneList = mockData ? [BattleScene, UIScene] : [StrategyScene, BattleScene, UIScene];

    const config = {
        type: Phaser.AUTO,
        parent: containerId,
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        physics: {
            default: 'arcade',
            arcade: {
                debug: mockData?.config?.showDebugStats || false, // Dev 설정에 따라 디버그 모드
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
                // 모의전투일 경우, 시작하자마자 데이터 주입 및 씬 재시작
                if (mockData) {
                    // 1. 레지스트리에 플레이어 스쿼드(Blue Team) 설정
                    game.registry.set('playerSquad', mockData.squad);
                    game.registry.set('playerCoins', mockData.config.gameSettings.initialCoins);

                    // 2. BattleScene을 강제로 재시작하며 설정(Config) 전달
                    const startSceneKey = 'BattleScene';
                    game.scene.stop(startSceneKey);
                    game.scene.start(startSceneKey, {
                        levelIndex: mockData.config.gameSettings.startLevelIndex,
                        debugConfig: mockData.config // DB 대신 사용할 설정 객체
                    });
                }
            }
        }
    };

    return new Phaser.Game(config);
}