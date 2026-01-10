import { onMount, onCleanup } from "solid-js";
import { launchGame } from "../game/gameLauncher";

export default function PhaserGame(props) {
  let gameInstance = null;
  const gameContainerId = "phaser-game-container";

  onMount(() => {
    // props.mockData가 있으면 함께 전달
    gameInstance = launchGame(gameContainerId, props.mockData);
  });

  onCleanup(() => {
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
        height: "100%", // 부모 컨테이너에 맞춤
        width: "100%",
        "background-color": "#2d2d2d"
      }}
    >
      {/* Phaser Canvas가 여기 생성됩니다 */}
    </div>
  );
}