import { onMount, onCleanup } from "solid-js";
import { launchGame } from "../game/gameLauncher";

export default function PhaserGame() {
  let gameInstance = null;
  const gameContainerId = "phaser-game-container";

  onMount(() => {
    // 컴포넌트가 마운트되면 게임 실행
    gameInstance = launchGame(gameContainerId);
  });

  onCleanup(() => {
    // 컴포넌트가 사라지면 게임 인스턴스 파괴 (메모리 누수 방지)
    if (gameInstance) {
      gameInstance.destroy(true);
      gameInstance = null;
    }
  });

  return (
    <div 
      id={gameContainerId} 
      style={{
        display: "flex", 
        "justify-content": "center", 
        "align-items": "center", 
        height: "100vh",
        "background-color": "#2d2d2d"
      }}
    >
      {/* Phaser Canvas가 여기 생성됩니다 */}
    </div>
  );
}