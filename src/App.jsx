// src/App.jsx
import { Router, Route } from "@solidjs/router";
import { createResource } from "solid-js";
import PhaserGame from "./components/PhaserGame";
import DevPage from "./pages/DevPage";
import territories from "./game/data/TerritoryConfig.json";
import { db } from "./firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

/**
 * [Arcade Mode] 아케이드 모드 데이터 생성
 * 현재 영역 ID에 따라 맵과 적군 설정을 동적으로 생성
 * Firestore의 territoryArmies를 참고
 */
function generateArcadeModeMockData(firestoreTerritoryArmies = {}) {
  // localStorage에서 현재 영역 ID 가져오기 (기본값: 2)
  let currentTerritoryId = parseInt(localStorage.getItem('arcadeCurrentTerritory') || '2');
  let territoryData = territories.territories[currentTerritoryId.toString()];

  // 영역이 없으면 처음부터 다시 시작
  if (!territoryData) {
    console.log(`🎮 [ArcadeMode] Arcade Mode Complete! Restarting from Territory 2...`);
    localStorage.setItem('arcadeCurrentTerritory', '2');
    currentTerritoryId = 2;
    territoryData = territories.territories['2'];
  }

  const mapId = territoryData.mapId;
  const territoryName = territoryData.name;
  const difficulty = territoryData.difficulty || 1;

  // [Modified] Firestore territoryArmies를 먼저 확인, 없으면 TerritoryConfig의 enemies 사용
  let enemyConfig = [];
  
  // 1. Firestore에 설정된 적군이 있으면 사용
  if (firestoreTerritoryArmies && firestoreTerritoryArmies[currentTerritoryId.toString()]) {
    const fbEnemies = firestoreTerritoryArmies[currentTerritoryId.toString()];
    if (Array.isArray(fbEnemies) && fbEnemies.length > 0) {
      enemyConfig = fbEnemies;
      console.log(`🎮 [ArcadeMode] Using Firestore territoryArmies for Territory ${currentTerritoryId}`);
    }
  }
  
  // 2. Firestore에 없으면 TerritoryConfig의 enemies 사용
  if (enemyConfig.length === 0 && territoryData.enemies && Array.isArray(territoryData.enemies)) {
    enemyConfig = territoryData.enemies.map(enemy => ({
      count: 1,
      type: enemy.type || 'NormalDog'
    }));
    console.log(`🎮 [ArcadeMode] Using TerritoryConfig enemies for Territory ${currentTerritoryId}`);
  }
  
  // 3. 둘 다 없으면 기본 로직 (난이도 기반)
  if (enemyConfig.length === 0) {
    const enemyCount = Math.max(1, 2 + Math.floor((currentTerritoryId - 2) * 0.5) + difficulty);
    enemyConfig = [{ count: enemyCount, type: 'NormalDog' }];
    console.log(`🎮 [ArcadeMode] Using default difficulty-based enemy count for Territory ${currentTerritoryId}`);
  }

  console.log(`🎮 [ArcadeMode] Territory ${currentTerritoryId}: "${territoryName}" (${mapId}) - Enemy Config:`, enemyConfig);

  return {
    squad: [
      { unitId: 1, role: 'Leader', level: 1, x: 50, y: 50, stats: {} }
    ],
    config: {
      gameSettings: {
        startLevelIndex: -1, // 아케이드 모드에서는 arcadeMapId 사용하므로 무시됨
        initialCoins: 0,
        blueCount: 1,
        redCount: 0,
        spawnGap: 90,
        startY: 250
      },
      showDebugStats: false,
      roleDefinitions: {
        Leader: { hp: 200, attackPower: 25, moveSpeed: 90, defense: 2, attackCooldown: 500, skillCooldown: 30000, skillRange: 300, skillDuration: 10000, skillEffect: 10, killReward: 100, maintenance: 3, missChance: 0.02 },
        Normal: { hp: 140, attackPower: 15, moveSpeed: 70, defense: 0, attackCooldown: 500, killReward: 10, maintenance: 1, missChance: 0.02 },
        NormalDog: { hp: 140, attackPower: 15, moveSpeed: 70, defense: 0, attackCooldown: 500, killReward: 10, maintenance: 0, missChance: 0.02 }
      }
    },
    script: null,
    armyConfig: enemyConfig,
    // 아케이드 모드 커스텀 데이터
    isArcadeMode: true,
    arcadeTerritoryId: currentTerritoryId,
    arcadeMapId: mapId,
    arcadeTerritoryName: territoryName
  };
}

/**
 * [Arcade Mode] 기본 아케이드 모드 데이터
 */
function generateArcadeModeMockData_Default() {
  return {
    squad: [
      { unitId: 1, role: 'Leader', level: 1, x: 50, y: 50, stats: {} }
    ],
    config: {
      gameSettings: {
        startLevelIndex: -1, // 아케이드 모드에서는 arcadeMapId 사용하므로 무시됨
        initialCoins: 0,
        blueCount: 1,
        redCount: 0,
        spawnGap: 90,
        startY: 250
      },
      showDebugStats: false,
      roleDefinitions: {
        Leader: { hp: 200, attackPower: 25, moveSpeed: 90, defense: 2, attackCooldown: 500, skillCooldown: 30000, skillRange: 300, skillDuration: 10000, skillEffect: 10, killReward: 100, maintenance: 3, missChance: 0.02 },
        Normal: { hp: 140, attackPower: 15, moveSpeed: 70, defense: 0, attackCooldown: 500, killReward: 10, maintenance: 1, missChance: 0.02 },
        NormalDog: { hp: 140, attackPower: 15, moveSpeed: 70, defense: 0, attackCooldown: 500, killReward: 10, maintenance: 0, missChance: 0.02 }
      }
    },
    script: null,
    armyConfig: [
      { count: 3, type: 'NormalDog' }
    ],
    // 아케이드 모드 커스텀 데이터
    isArcadeMode: true,
    arcadeTerritoryId: 2,
    arcadeMapId: 'level1',
    arcadeTerritoryName: '길거리'
  };
}

// 아케이드 모드 라우트로 PhaserGame을 렌더링
// Firestore에서 territoryArmies를 불러온 후 게임 시작
const ArcadeMode = () => {
  // Firestore에서 territoryArmies를 비동기로 로드
  const [mockData] = createResource(async () => {
    try {
      console.log('🎮 [ArcadeMode] Loading territoryArmies from Firestore...');
      const docRef = doc(db, "settings", "tacticsConfig");
      const docSnap = await getDoc(docRef);
      
      let firestoreTerritoryArmies = {};
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.territoryArmies) {
          firestoreTerritoryArmies = data.territoryArmies;
          console.log('🎮 [ArcadeMode] territoryArmies loaded from Firestore:', firestoreTerritoryArmies);
        }
      }
      
      // Firestore 데이터를 포함해서 mockData 생성
      return generateArcadeModeMockData(firestoreTerritoryArmies);
    } catch (error) {
      console.error('❌ [ArcadeMode] Error loading territoryArmies:', error);
      // 에러 발생 시에도 기본값으로 게임 시작
      return generateArcadeModeMockData({});
    }
  });

  return <PhaserGame mockData={mockData() || generateArcadeModeMockData({})} />;
};

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