// src/App.jsx
import { Router, Route } from "@solidjs/router"; // [변경] Routes 제거, Router 추가
import PhaserGame from "./components/PhaserGame";
import DevPage from "./pages/DevPage";

// 아케이드 모드 (Level 2)용 Mock 데이터
const arcadeModeMockData = {
  squad: [
    { unitId: 1, role: 'Leader', level: 1, x: 50, y: 50, stats: {} },
    { unitId: 2, role: 'Normal', level: 1, x: 70, y: 50, stats: {} }
  ],
  config: {
    gameSettings: {
      startLevelIndex: 2, // level2
      initialCoins: 0
    },
    showDebugStats: false
  },
  script: null,
  armyConfig: [
    { count: 3, type: 'NormalDog' }
  ]
};

// 아케이드 모드 라우트로 PhaserGame을 렌더링
const ArcadeMode = () => <PhaserGame mockData={arcadeModeMockData} />;

function App() {
  return (
    // [변경] <Routes> 태그를 <Router>로 변경
    <Router>
      <Route path="/" component={PhaserGame} />
      <Route path="/dev" component={DevPage} />
      <Route path="/sangsu" component={ArcadeMode} />
    </Router>
  );
}

export default App;