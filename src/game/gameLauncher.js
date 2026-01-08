import Phaser from 'phaser';
import BattleScene from './scenes/BattleScene';
import UIScene from './scenes/UIScene';
import StrategyScene from './scenes/StrategyScene';

// [Fix] export default -> export function으로 변경 (기존 import 방식 유지)
export function launchGame(containerId) {
    const config = {
        type: Phaser.AUTO,
        parent: containerId,
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        physics: {
            default: 'arcade',
            arcade: {
                debug: false, 
                gravity: { y: 0 } 
            }
        },
        // [New] StrategyScene을 가장 앞에 배치하여 시작 씬으로 설정
        scene: [StrategyScene, BattleScene, UIScene], 
        
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH
        }
    };

    return new Phaser.Game(config);
}