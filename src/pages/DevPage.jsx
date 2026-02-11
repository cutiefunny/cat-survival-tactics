import { createSignal, onMount, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, deleteDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useNavigate } from "@solidjs/router";
import { LEVEL_KEYS, LEVEL_DATA } from "../game/managers/LevelManager";
import PhaserGame from "../components/PhaserGame"; 

// [설정] 역할별 기본 스탯 정의
const DEFAULT_ROLE_DEFS = {
  Leader: { hp: 200, attackPower: 25, moveSpeed: 90, defense: 2, attackCooldown: 500, skillCooldown: 30000, skillRange: 300, skillDuration: 10000, skillEffect: 10, killReward: 100, maintenance: 3, missChance: 0.02 },
  Runner: { hp: 100, attackPower: 12, moveSpeed: 140, defense: 0, attackCooldown: 400, killReward: 15, maintenance: 2, missChance: 0.02 },
  Dealer: { hp: 90, attackPower: 40, moveSpeed: 70, defense: 0, attackCooldown: 600, killReward: 20, maintenance: 2, missChance: 0.02 },
  Tanker: { hp: 400, attackPower: 10, moveSpeed: 40, defense: 5, attackCooldown: 800, skillCooldown: 10000, skillRange: 200, killReward: 30, maintenance: 2, missChance: 0.02 },
  Shooter: { hp: 80, attackPower: 30, moveSpeed: 110, defense: 0, attackRange: 250, attackCooldown: 500, killReward: 20, maintenance: 4, missChance: 0.02 },
  Healer: { hp: 100, attackPower: 15, moveSpeed: 110, defense: 0, attackCooldown: 2000, skillCooldown: 3000, skillRange: 200, aggroStackLimit: 10, killReward: 25, maintenance: 5, missChance: 0.02 },
  Raccoon: { hp: 150, attackPower: 20, moveSpeed: 100, defense: 0, attackCooldown: 400, skillCooldown: 8000, killReward: 20, maintenance: 2, missChance: 0.02 },
  Wawa: { hp: 150, attackPower: 20, moveSpeed: 100, defense: 0, attackCooldown: 400, skillCooldown: 8000, killReward: 20, maintenance: 2, missChance: 0.02 },
  Normal: { hp: 140, attackPower: 15, moveSpeed: 70, defense: 0, attackCooldown: 500, killReward: 10, maintenance: 1, missChance: 0.02 },
  NormalDog: { hp: 140, attackPower: 15, moveSpeed: 70, defense: 0, attackCooldown: 500, killReward: 10, maintenance: 0, missChance: 0.02 }
};

// [설정] 기본 유닛 가격
const DEFAULT_UNIT_COSTS = {
    'Tanker': 10, 'Shooter': 20, 'Healer': 25, 'Raccoon': 10, 'Wawa': 10, 'Runner': 10, 'Normal': 5
};

const DEFAULT_CONFIG = {
  showDebugStats: false, 
  gameSettings: { 
      blueCount: 6, redCount: 6, spawnGap: 90, startY: 250, startLevelIndex: 0, 
      initialCoins: 50, 
      territoryIncome: 2, 
      reinforcementInterval: 3, 
      fatiguePenaltyRate: 0.05, 
      growthHp: 10, 
      growthAtk: 1  
  },
  aiSettings: {
    common: { thinkTimeMin: 150, thinkTimeVar: 100, fleeHpThreshold: 0.2, hpRegenRate: 0.01 },
    runner: { ambushDistance: 60, fleeDuration: 1500 },
    dealer: { safeDistance: 150, followDistance: 50 },
    shooter: { attackRange: 250, kiteDistance: 200 } 
  },
  roleDefinitions: DEFAULT_ROLE_DEFS,
  unitCosts: DEFAULT_UNIT_COSTS,
  redTeamRoles: [],
  blueTeamRoles: [],
  territoryArmies: {} 
};

const DevPage = () => {
  const navigate = useNavigate();
  const [config, setConfig] = createStore(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  const [status, setStatus] = createSignal("Loading...");
  const [feedbacks, setFeedbacks] = createSignal([]);
  const [newArmyNodeId, setNewArmyNodeId] = createSignal("");
  
  const [showMockBattle, setShowMockBattle] = createSignal(false);
  const [mockData, setMockData] = createSignal(null);

  onMount(async () => {
    try {
      const docRef = doc(db, "settings", "tacticsConfig");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const merged = { ...DEFAULT_CONFIG, ...data };
        
        if (data.gameSettings) merged.gameSettings = { ...DEFAULT_CONFIG.gameSettings, ...data.gameSettings };
        if (data.aiSettings) {
             merged.aiSettings = { ...DEFAULT_CONFIG.aiSettings, ...data.aiSettings };
             if (data.aiSettings.common) {
                 merged.aiSettings.common = { ...DEFAULT_CONFIG.aiSettings.common, ...data.aiSettings.common };
             }
        }
        if (data.unitCosts) merged.unitCosts = { ...DEFAULT_UNIT_COSTS, ...data.unitCosts };
        
        // [Modified] Territory Armies 데이터 구조 마이그레이션 (단일 객체 -> 배열)
        if (data.territoryArmies) {
            const rawArmies = { ...DEFAULT_CONFIG.territoryArmies, ...data.territoryArmies };
            const migratedArmies = {};
            Object.keys(rawArmies).forEach(key => {
                const army = rawArmies[key];
                if (Array.isArray(army)) {
                    migratedArmies[key] = army;
                } else if (army && typeof army === 'object') {
                    // 기존 데이터가 단일 객체라면 배열로 감쌈
                    migratedArmies[key] = [army];
                }
            });
            merged.territoryArmies = migratedArmies;
        }

        if (data.roleDefinitions) {
            Object.keys(DEFAULT_ROLE_DEFS).forEach(role => {
                if(merged.roleDefinitions[role]) {
                    merged.roleDefinitions[role] = { ...DEFAULT_ROLE_DEFS[role], ...merged.roleDefinitions[role] };
                } else {
                    merged.roleDefinitions[role] = DEFAULT_ROLE_DEFS[role];
                }
            });
        } else {
            merged.roleDefinitions = DEFAULT_ROLE_DEFS;
        }

        const bCount = merged.gameSettings.blueCount || 6;
        const rCount = merged.gameSettings.redCount || 6;
        merged.gameSettings.blueCount = bCount;
        merged.gameSettings.redCount = rCount;
        
        if (merged.gameSettings.territoryIncome === undefined) merged.gameSettings.territoryIncome = 2;
        if (merged.gameSettings.reinforcementInterval === undefined) merged.gameSettings.reinforcementInterval = 3;
        if (merged.gameSettings.fatiguePenaltyRate === undefined) merged.gameSettings.fatiguePenaltyRate = 0.05;
        if (merged.gameSettings.growthHp === undefined) merged.gameSettings.growthHp = 10;
        if (merged.gameSettings.growthAtk === undefined) merged.gameSettings.growthAtk = 1;
        if (merged.gameSettings.startLevelIndex === undefined) merged.gameSettings.startLevelIndex = 0;
        if (merged.gameSettings.initialCoins === undefined) merged.gameSettings.initialCoins = 50;

        merged.blueTeamRoles = syncArrayLength(merged.blueTeamRoles || [], bCount, "Normal", merged.roleDefinitions);
        merged.redTeamRoles = syncArrayLength(merged.redTeamRoles || [], rCount, "NormalDog", merged.roleDefinitions);

        setConfig(merged);
        setStatus("Config Loaded ✅");
      } else {
        const initConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        initConfig.blueTeamRoles = syncArrayLength([], 6, "Normal", DEFAULT_ROLE_DEFS);
        initConfig.redTeamRoles = syncArrayLength([], 6, "NormalDog", DEFAULT_ROLE_DEFS);
        setConfig(initConfig);
        setStatus("No Config Found (Using Default) ⚠️");
      }
    } catch (err) {
      console.error(err);
      setStatus("Error Loading Config ❌");
    }

    fetchFeedbacks();
  });

  const fetchFeedbacks = async () => {
      try {
        const q = query(collection(db, "feedbacks"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setFeedbacks(list);
      } catch (err) {
          console.error("Error fetching feedbacks:", err);
      }
  };

  const handleDeleteFeedback = async (id) => {
      if(!confirm("Delete this feedback?")) return;
      try {
          await deleteDoc(doc(db, "feedbacks", id));
          setFeedbacks(prev => prev.filter(f => f.id !== id));
      } catch(err) {
          console.error("Failed to delete feedback:", err);
      }
  };

  const syncArrayLength = (currentArray, targetCount, defaultRole, roleDefs) => {
    const newArray = [...currentArray];
    if (newArray.length < targetCount) {
      const needed = targetCount - newArray.length;
      for (let i = 0; i < needed; i++) {
        const defs = roleDefs[defaultRole] || DEFAULT_ROLE_DEFS[defaultRole];
        newArray.push({ role: defaultRole, ...defs });
      }
    } else if (newArray.length > targetCount) {
      newArray.splice(targetCount);
    }
    return newArray;
  };

  const handleCountChange = (teamType, newCount) => {
    setConfig("gameSettings", teamType === 'blue' ? "blueCount" : "redCount", newCount);
    const targetArrayName = teamType === 'blue' ? "blueTeamRoles" : "redTeamRoles";
    const defaultRole = teamType === 'blue' ? "Normal" : "NormalDog";
    
    const currentList = JSON.parse(JSON.stringify(config[targetArrayName]));
    const updatedList = syncArrayLength(currentList, newCount, defaultRole, config.roleDefinitions);
    setConfig(targetArrayName, updatedList);
  };

  const handleRoleChange = (teamType, index, newRole) => {
    const stats = config.roleDefinitions[newRole];
    if (!stats) return;
    const targetArrayName = teamType === 'blue' ? "blueTeamRoles" : "redTeamRoles";
    setConfig(targetArrayName, index, { role: newRole, ...stats });
  };

  const handleStatChange = (roleName, statKey, value) => {
    setConfig("roleDefinitions", roleName, statKey, value);
    const updateTeam = (teamKey) => {
        config[teamKey].forEach((unit, idx) => {
            if (unit.role === roleName) {
                setConfig(teamKey, idx, statKey, value);
            }
        });
    };
    updateTeam("blueTeamRoles");
    updateTeam("redTeamRoles");
  };

  const handleCostChange = (roleName, value) => {
    setConfig("unitCosts", roleName, value);
  };

  // [Modified] 영토 군대 노드 추가 (배열로 초기화)
  const handleAddTerritoryArmy = () => {
      const id = newArmyNodeId();
      if (!id) return;
      if (config.territoryArmies && config.territoryArmies[id]) {
          alert(`Node ${id} already exists!`);
          return;
      }
      // 기본값: NormalDog 3마리 1세트가 든 배열
      setConfig("territoryArmies", id, [{ type: "NormalDog", count: 3 }]);
      setNewArmyNodeId("");
  };

  const handleDeleteTerritoryArmy = (id) => {
      setConfig("territoryArmies", id, undefined);
  };

  // [New] 특정 노드에 유닛 타입 추가
  const handleAddUnitToNode = (nodeId) => {
      const currentList = config.territoryArmies[nodeId] || [];
      setConfig("territoryArmies", nodeId, [...currentList, { type: "NormalDog", count: 1 }]);
  };

  // [New] 특정 노드의 특정 유닛 타입 제거
  const handleRemoveUnitFromNode = (nodeId, index) => {
      const currentList = [...config.territoryArmies[nodeId]];
      currentList.splice(index, 1);
      setConfig("territoryArmies", nodeId, currentList);
  };

  const saveConfig = async () => {
    setStatus("Saving...");
    try {
      const cleanConfig = JSON.parse(JSON.stringify(config));
      
      if (cleanConfig.territoryArmies) {
          Object.keys(cleanConfig.territoryArmies).forEach(key => {
              if (cleanConfig.territoryArmies[key] === undefined) {
                  delete cleanConfig.territoryArmies[key];
              }
          });
      }

      await setDoc(doc(db, "settings", "tacticsConfig"), cleanConfig);
      setStatus("Saved Successfully! 🎉");
    } catch (err) {
      console.error(err);
      setStatus("Save Failed ❌");
    }
  };

  const handleStartMockBattle = () => {
      const currentConfig = JSON.parse(JSON.stringify(config));
      const squad = JSON.parse(JSON.stringify(config.blueTeamRoles));
      
      // [Modified] 선택된 레벨의 스크립트를 로드
      const selectedLevelIndex = currentConfig.gameSettings.startLevelIndex;
      let script = null;
      
      if (selectedLevelIndex >= 0 && selectedLevelIndex < LEVEL_KEYS.length) {
          const levelKey = LEVEL_KEYS[selectedLevelIndex];
          const levelData = LEVEL_DATA[levelKey];
          if (levelData && levelData.script) {
              script = levelData.script;
          }
      }
      
      setMockData({ isMock: true, config: currentConfig, squad: squad, script: script });
      setShowMockBattle(true);
  };

  const renderUnitRow = (unit, index, teamType) => {
    return (
        <div style={{ 
            display: "flex", alignItems: "center", background: teamType === 'blue' ? "#112233" : "#331111", 
            padding: "8px 12px", borderRadius: "4px", borderLeft: `4px solid ${teamType === 'blue' ? '#88ccff' : '#ff8888'}`,
            marginBottom: "6px", width: "100%", boxSizing: "border-box"
        }}>
            <span style={{ minWidth: "25px", color: "#666", fontWeight: "bold" }}>#{index+1}</span>
            <select 
                value={unit.role} 
                onInput={(e) => handleRoleChange(teamType, index, e.target.value)}
                style={{ 
                    padding: "5px", borderRadius: "4px", border: `1px solid ${teamType === 'blue' ? '#446688' : '#884444'}`, 
                    background: teamType === 'blue' ? "#001122" : "#220000", color: "white", width: "110px", marginRight: "10px", fontWeight: "bold", fontSize: "0.9em", flexShrink: 0
                }}
            >
                <For each={Object.keys(config.roleDefinitions)}>
                    {(role) => <option value={role}>{role}</option>}
                </For>
            </select>
            <div style={{ display: "flex", gap: "15px", fontSize: "0.85em", color: "#ccc", alignItems: "center", flex: 1, flexWrap: "wrap" }}>
                <span title="Health">❤️ <span style={{color: "#fff"}}>{unit.hp}</span></span>
                <span title="Power">{unit.role === 'Healer' ? '💊' : '⚔️'} <span style={{color: "#ffca28"}}>{unit.attackPower}</span></span>
                <span title="Defense">🛡️ <span style={{color: "#aaaaff"}}>{unit.defense ?? 0}</span></span>
                <span title="Speed">👟 <span style={{color: "#42a5f5"}}>{unit.moveSpeed}</span></span>
            </div>
        </div>
    );
  };

  return (
    <div style={{ padding: "40px", "background-color": "#1a1a1a", color: "white", "height": "100vh", "overflow-y": "auto", "box-sizing": "border-box", "font-family": "monospace" }}>
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "border-bottom": "2px solid #444", "padding-bottom": "10px" }}>
        <h1 style={{ margin: 0 }}>🐱 Tactics Dev Console</h1>
        <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={handleStartMockBattle} style={{ ...btnStyle, background: "#ff9900", color: "black", border: "2px solid #ffcc00" }}>⚔️ Start Mock Battle</button>
            <button onClick={() => navigate('/')} style={btnStyle}>⬅ Back to Game</button>
        </div>
      </div>
      
      <div style={{ "margin-top": "20px", "font-size": "1.2em", "font-weight": "bold", color: status().includes("Error") || status().includes("Failed") ? "#ff4444" : "#44ff44" }}>
        {status()}
      </div>

      <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "20px", "margin-top": "30px" }}>
        
        {/* --- Global Settings --- */}
        <section style={cardStyle}>
          <h2 style={sectionHeaderStyle}>⚙️ Global Settings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            
            {/* 1. Debug Option */}
            <label style={{display: "flex", alignItems: "center", cursor: "pointer", background: "#222", padding: "8px 12px", borderRadius: "4px", border: "1px solid #444"}}>
                <input 
                    type="checkbox" 
                    checked={config.showDebugStats} 
                    onChange={(e) => setConfig("showDebugStats", e.target.checked)} 
                    style={{marginRight: "10px", transform: "scale(1.2)"}}
                />
                <span style={{color: config.showDebugStats ? "#44ff44" : "#ccc", fontWeight: "bold"}}>Show Debug Stats Overlay</span>
            </label>

            {/* 2. Map & Spawn Settings */}
            <div style={groupStyle}>
                <div style={groupLabelStyle}>🗺️ MAP & SPAWN</div>
                <div style={compactRowStyle}>
                    <label style={{display: "flex", alignItems: "center", gap: "5px"}}>
                        <span style={{color: "#aaa"}}>Start Map:</span>
                        <select 
                            value={config.gameSettings.startLevelIndex ?? 0}
                            onInput={(e) => setConfig("gameSettings", "startLevelIndex", parseInt(e.target.value))}
                            style={{...inputStyle, width: "120px"}}
                        >
                            <option value={-1}>🚫 None</option>
                            <For each={LEVEL_KEYS}>
                                {(level, idx) => <option value={idx()}>{idx()}: {level}</option>}
                            </For>
                        </select>
                    </label>
                </div>
            </div>

            {/* 3. Economy Settings */}
            <div style={groupStyle}>
                <div style={groupLabelStyle}>💰 ECONOMY</div>
                <div style={compactRowStyle}>
                    <label style={{display: "flex", alignItems: "center", gap: "5px"}}>
                        <span style={{color: "#ffd700"}}>Initial Coins:</span>
                        <input type="number" value={config.gameSettings.initialCoins} onInput={(e) => setConfig("gameSettings", "initialCoins", parseInt(e.target.value))} style={shortInputStyle} />
                    </label>
                    <div style={{width: "1px", height: "20px", background: "#555"}}></div>
                    <label style={{display: "flex", alignItems: "center", gap: "5px"}}>
                        <span style={{color: "#44ff44"}}>Territory Income:</span>
                        <input type="number" value={config.gameSettings.territoryIncome} onInput={(e) => setConfig("gameSettings", "territoryIncome", parseInt(e.target.value))} style={shortInputStyle} />
                        <span style={{fontSize: "0.8em", color: "#666"}}>/turn</span>
                    </label>
                </div>
            </div>

            {/* 4. Game Rules */}
            <div style={groupStyle}>
                <div style={groupLabelStyle}>⚖️ RULES & BALANCE</div>
                <div style={compactRowStyle}>
                    <label style={{display: "flex", alignItems: "center", gap: "5px"}}>
                        <span style={{color: "#ffaaaa"}}>Reinforce Turn:</span>
                        <input type="number" min="1" value={config.gameSettings.reinforcementInterval} onInput={(e) => setConfig("gameSettings", "reinforcementInterval", parseInt(e.target.value))} style={shortInputStyle} />
                    </label>
                    <label style={{display: "flex", alignItems: "center", gap: "5px"}}>
                        <span style={{color: "#aaaaff"}}>Fatigue Penalty:</span>
                        <input type="number" step="0.01" max="1" value={config.gameSettings.fatiguePenaltyRate} onInput={(e) => setConfig("gameSettings", "fatiguePenaltyRate", parseFloat(e.target.value))} style={shortInputStyle} />
                    </label>
                </div>
            </div>

            {/* 5. Level Up Growth */}
            <div style={groupStyle}>
                <div style={groupLabelStyle}>📈 LEVEL UP GROWTH</div>
                <div style={compactRowStyle}>
                    <label style={{display: "flex", alignItems: "center", gap: "5px"}}>
                        <span style={{color: "#ff8888"}}>HP+:</span>
                        <input type="number" value={config.gameSettings.growthHp} onInput={(e) => setConfig("gameSettings", "growthHp", parseInt(e.target.value))} style={shortInputStyle} />
                    </label>
                    <label style={{display: "flex", alignItems: "center", gap: "5px"}}>
                        <span style={{color: "#ffcc88"}}>ATK+:</span>
                        <input type="number" value={config.gameSettings.growthAtk} onInput={(e) => setConfig("gameSettings", "growthAtk", parseInt(e.target.value))} style={shortInputStyle} />
                    </label>
                </div>
            </div>

          </div>
        </section>

        {/* --- AI Parameters --- */}
        <section style={cardStyle}>
          <h2 style={sectionHeaderStyle}>🧠 AI Parameters</h2>
          <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
              <div style={{background: "#333", padding: "10px", borderRadius: "5px"}}>
                  <h4 style={{ color: "#ffffff", margin: "0 0 5px 0" }}>General Behavior</h4>
                  <div style={{display: "flex", gap: "15px", flexWrap: "wrap"}}>
                      <label>Flee HP% <input type="number" step="0.05" value={config.aiSettings.common?.fleeHpThreshold ?? 0.2} onInput={(e) => setConfig("aiSettings", "common", "fleeHpThreshold", parseFloat(e.target.value))} style={{ width: "60px", ...inputStyle }} /></label>
                      <label>Idle Regen/s <input type="number" step="0.005" value={config.aiSettings.common?.hpRegenRate ?? 0.01} onInput={(e) => setConfig("aiSettings", "common", "hpRegenRate", parseFloat(e.target.value))} style={{ width: "60px", ...inputStyle }} /></label>
                  </div>
              </div>
              
              <div style={{display: "flex", gap: "20px"}}>
                <div><h4 style={{ color: "#dd88ff", margin: "5px 0" }}>Shooter</h4><label>Kite: <input type="number" value={config.aiSettings.shooter?.kiteDistance || 200} onInput={(e) => setConfig("aiSettings", "shooter", "kiteDistance", parseInt(e.target.value))} style={{ width: "50px", ...inputStyle }} /></label></div>
                <div><h4 style={{ color: "#ffcc88", margin: "5px 0" }}>Runner</h4><label>Ambush: <input type="number" value={config.aiSettings.runner.ambushDistance} onInput={(e) => setConfig("aiSettings", "runner", "ambushDistance", parseInt(e.target.value))} style={{ width: "50px", ...inputStyle }} /></label></div>
              </div>
          </div>
        </section>

        {/* --- Territory Armies Configuration (Updated for Multiple Types) --- */}
        <section style={{ ...cardStyle, gridColumn: "span 2", border: "1px solid #ff5555" }}>
            <h2 style={{ color: "#ff5555", marginTop: 0 }}>🏰 Territory Garrisons (Strategy Map)</h2>
            <div style={{ marginBottom: "15px", background: "#332222", padding: "10px", borderRadius: "5px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontWeight: "bold" }}>Add Garrison to Node ID:</span>
                <input 
                    type="text" 
                    placeholder="Node ID (e.g. 2)" 
                    value={newArmyNodeId()} 
                    onInput={(e) => setNewArmyNodeId(e.target.value)}
                    style={{ ...inputStyle, width: "120px" }}
                />
                <button onClick={handleAddTerritoryArmy} style={{ ...btnStyle, background: "#cc4444", color: "white" }}>Add Node</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "10px" }}>
                <For each={Object.keys(config.territoryArmies || {})}>
                    {(nodeId) => (
                        <div style={{ background: "#443333", padding: "10px", borderRadius: "5px", border: "1px solid #664444", display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #664444", paddingBottom: "5px" }}>
                                <strong style={{ color: "#ffaaaa", fontSize: "1.1em" }}>Node {nodeId}</strong>
                                <button onClick={() => handleDeleteTerritoryArmy(nodeId)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2em" }}>❌</button>
                            </div>
                            
                            {/* Loop through each unit type in this node */}
                            <For each={config.territoryArmies[nodeId]}>
                                {(unitData, idx) => (
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center", background: "#332222", padding: "5px", borderRadius: "4px" }}>
                                        <select 
                                            value={unitData.type} 
                                            onInput={(e) => setConfig("territoryArmies", nodeId, idx(), "type", e.target.value)}
                                            style={{ ...inputStyle, flex: 1 }}
                                        >
                                            <For each={Object.keys(config.roleDefinitions)}>
                                                {(role) => <option value={role}>{role}</option>}
                                            </For>
                                        </select>
                                        <input 
                                            type="number" 
                                            min="1" 
                                            value={unitData.count} 
                                            onInput={(e) => setConfig("territoryArmies", nodeId, idx(), "count", parseInt(e.target.value))}
                                            style={{ ...inputStyle, width: "50px" }} 
                                        />
                                        <button 
                                            onClick={() => handleRemoveUnitFromNode(nodeId, idx())}
                                            style={{ background: "#cc4444", color: "white", border: "none", borderRadius: "3px", cursor: "pointer", padding: "2px 6px", fontSize: "0.8em" }}
                                        >
                                            X
                                        </button>
                                    </div>
                                )}
                            </For>
                            
                            <button 
                                onClick={() => handleAddUnitToNode(nodeId)}
                                style={{ marginTop: "5px", background: "#554444", color: "#ddd", border: "1px dashed #776666", borderRadius: "4px", padding: "5px", cursor: "pointer", width: "100%" }}
                            >
                                + Add Unit Type
                            </button>
                        </div>
                    )}
                </For>
                {Object.keys(config.territoryArmies || {}).length === 0 && <div style={{ color: "#888", fontStyle: "italic" }}>No garrisons configured.</div>}
            </div>
        </section>

        {/* --- Class Base Stats & Economy --- */}
        <section style={{ background: "#222", padding: "20px", "border-radius": "8px", "grid-column": "span 2", border: "1px solid #444" }}>
            <h2 style={{ color: "#ffd700", "margin-top": 0 }}>📊 Class Stats & Economy</h2>
            <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(320px, 1fr))", gap: "15px" }}>
                <For each={Object.keys(config.roleDefinitions)}>
                    {(role) => (
                    <div style={{ background: "#333", padding: "10px", borderRadius: "5px", borderLeft: `4px solid #888` }}>
                        <div style={{display: "flex", "justify-content": "space-between", "margin-bottom": "10px"}}>
                            {/* ... (이전 코드 유지) */}
                            <h4 style={{ margin: "0", color: "#fff" }}>{role} {role === 'Healer' ? '💊' : role === 'Raccoon' ? '🦝' : ''}</h4>
                            <div style={{display: "flex", gap: "10px"}}>
                                {/* ... (Buy, Maint inputs 유지) */}
                                <label style={{ fontSize: "0.8em", color: "#ffdd00" }}>
                                    Buy: <input type="number" value={config.unitCosts?.[role] ?? 0} onInput={(e) => handleCostChange(role, parseInt(e.target.value))} style={{ width: "40px", ...inputStyle, borderColor: "#aa8800" }} />
                                </label>
                                <label style={{ fontSize: "0.8em", color: "#ff8888" }}>
                                    Maint: <input type="number" value={config.roleDefinitions[role].maintenance ?? 0} onInput={(e) => handleStatChange(role, "maintenance", parseInt(e.target.value))} style={{ width: "40px", ...inputStyle, borderColor: "#884444" }} />
                                </label>
                            </div>
                        </div>
                        
                        <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "5px" }}>
                            {/* ... (HP, ATK, DEF, SPD inputs 유지) */}
                            <label style={statLabelStyle}>HP<input type="number" value={config.roleDefinitions[role].hp} onInput={(e) => handleStatChange(role, "hp", parseInt(e.target.value))} style={statInputStyle} /></label>
                            <label style={statLabelStyle}>ATK<input type="number" value={config.roleDefinitions[role].attackPower} onInput={(e) => handleStatChange(role, "attackPower", parseInt(e.target.value))} style={statInputStyle} /></label>
                            <label style={statLabelStyle}>DEF<input type="number" value={config.roleDefinitions[role].defense ?? 0} onInput={(e) => handleStatChange(role, "defense", parseInt(e.target.value))} style={statInputStyle} /></label>
                            <label style={statLabelStyle}>SPD<input type="number" value={config.roleDefinitions[role].moveSpeed} onInput={(e) => handleStatChange(role, "moveSpeed", parseInt(e.target.value))} style={statInputStyle} /></label>
                            
                            {/* [Modified] Miss Prob Input 추가 */}
                            <label style={{...statLabelStyle, color: "#aaffaa"}}>
                                {role === 'Healer' ? 'Motion CD' : 'ATK CD'}
                                <input type="number" value={config.roleDefinitions[role].attackCooldown || 500} onInput={(e) => handleStatChange(role, "attackCooldown", parseInt(e.target.value))} style={{ ...statInputStyle, background: "#112211", borderColor: "#484", color: "#afa" }} />
                            </label>

                            <label style={{...statLabelStyle, color: "#ccc"}}>
                                Miss Prob
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    max="1.0"
                                    value={config.roleDefinitions[role].missChance ?? 0.02} 
                                    onInput={(e) => handleStatChange(role, "missChance", parseFloat(e.target.value))} 
                                    style={{ ...statInputStyle, background: "#222", borderColor: "#666", color: "#fff" }} 
                                />
                            </label>

                            <label style={{...statLabelStyle, color: "#ffd700", gridColumn: "span 2"}}>
                                Kill Reward
                                <input type="number" value={config.roleDefinitions[role].killReward ?? 10} onInput={(e) => handleStatChange(role, "killReward", parseInt(e.target.value))} style={{ ...statInputStyle, background: "#221100", borderColor: "#aa8800", color: "#ffd700" }} />
                            </label>
                            
                            {/* ... (나머지 inputs 유지) */}
                            {config.roleDefinitions[role].skillCooldown !== undefined && (
                                <>
                                    <div style={{gridColumn: "span 2", height: "1px", background: "#555", margin: "5px 0"}}></div>
                                    <label style={{...statLabelStyle, color: "#ff88ff"}}>S.CD<input type="number" value={config.roleDefinitions[role].skillCooldown} onInput={(e) => handleStatChange(role, "skillCooldown", parseInt(e.target.value))} style={{ ...statInputStyle, background: "#220022", borderColor: "#848", color: "#f8f" }} /></label>
                                    <label style={{...statLabelStyle, color: "#ff88ff"}}>S.Range<input type="number" value={config.roleDefinitions[role].skillRange} onInput={(e) => handleStatChange(role, "skillRange", parseInt(e.target.value))} style={{ ...statInputStyle, background: "#220022", borderColor: "#848", color: "#f8f" }} /></label>
                                    {config.roleDefinitions[role].skillDuration !== undefined && <label style={{...statLabelStyle, color: "#ff88ff"}}>S.Dur<input type="number" value={config.roleDefinitions[role].skillDuration} onInput={(e) => handleStatChange(role, "skillDuration", parseInt(e.target.value))} style={{ ...statInputStyle, background: "#220022", borderColor: "#848", color: "#f8f" }} /></label>}
                                    {config.roleDefinitions[role].skillEffect !== undefined && <label style={{...statLabelStyle, color: "#ff88ff"}}>S.Eff(%)<input type="number" value={config.roleDefinitions[role].skillEffect} onInput={(e) => handleStatChange(role, "skillEffect", parseInt(e.target.value))} style={{ ...statInputStyle, background: "#220022", borderColor: "#848", color: "#f8f" }} /></label>}
                                </>
                            )}
                            
                            {config.roleDefinitions[role].aggroStackLimit !== undefined && (
                                <label style={{...statLabelStyle, color: "#ffaaaa"}}>Aggro Stack<input type="number" value={config.roleDefinitions[role].aggroStackLimit} onInput={(e) => handleStatChange(role, "aggroStackLimit", parseInt(e.target.value))} style={{ ...statInputStyle, background: "#220000", borderColor: "#844", color: "#faa" }} /></label>
                            )}

                            {config.roleDefinitions[role].attackRange !== undefined && (
                                <label style={{...statLabelStyle, color: "#d8f", gridColumn: "span 2", marginTop: "5px"}}>Range<input type="number" value={config.roleDefinitions[role].attackRange} onInput={(e) => handleStatChange(role, "attackRange", parseInt(e.target.value))} style={{ ...statInputStyle, background: "#220022", borderColor: "#848", color: "#f8f" }} /></label>
                            )}
                        </div>
                    </div>
                    )}
                </For>
            </div>
        </section>

        {/* --- Blue Team Composition --- */}
        <section style={{ background: "#223344", padding: "20px", "border-radius": "8px" }}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px"}}>
            <h2 style={{ color: "#88ccff", margin: 0 }}>🛡️ Blue Team</h2>
            <label>Count: <input type="number" min="1" max="12" value={config.gameSettings.blueCount} onInput={(e) => handleCountChange('blue', parseInt(e.target.value))} style={{ marginLeft: "10px", width: "50px", padding: "5px", ...inputStyle }} /></label>
          </div>
          <div style={{ display: "block" }}>
            <For each={config.blueTeamRoles}>
                {(unit, index) => renderUnitRow(unit, index(), 'blue')}
            </For>
          </div>
        </section>

        {/* --- Red Team Composition --- */}
        <section style={{ background: "#442222", padding: "20px", "border-radius": "8px" }}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px"}}>
            <h2 style={{ color: "#ff8888", margin: 0 }}>🐺 Red Team (Default)</h2>
            <label>Count: <input type="number" min="1" max="12" value={config.gameSettings.redCount} onInput={(e) => handleCountChange('red', parseInt(e.target.value))} style={{ marginLeft: "10px", width: "50px", padding: "5px", ...inputStyle }} /></label>
          </div>
          <div style={{ display: "block" }}>
            <For each={config.redTeamRoles}>
                {(unit, index) => renderUnitRow(unit, index(), 'red')}
            </For>
          </div>
        </section>

        {/* --- Feedback Viewer --- */}
        <section style={{ background: "#333", padding: "20px", "border-radius": "8px", "grid-column": "span 2", border: "1px solid #666" }}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <h2 style={{ color: "#00ffcc", margin: 0 }}>📢 User Feedbacks</h2>
                <button onClick={fetchFeedbacks} style={{padding: "5px 10px", cursor: "pointer"}}>Refresh</button>
            </div>
            <div style={{ marginTop: "15px", maxHeight: "300px", overflowY: "auto", background: "#222", padding: "10px" }}>
                {feedbacks().length === 0 ? <div style={{color: "#888"}}>No feedbacks yet.</div> : (
                    <For each={feedbacks()}>
                        {(item) => (
                        <div style={{ background: "#444", padding: "10px", marginBottom: "8px", borderRadius: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                                <div style={{color: "#fff", fontWeight: "bold"}}>{item.message}</div>
                                <div style={{color: "#aaa", fontSize: "0.8em"}}>{new Date(item.timestamp).toLocaleString()}</div>
                            </div>
                            <button onClick={() => handleDeleteFeedback(item.id)} style={{ background: "#ff4444", color: "white", border: "none", borderRadius: "4px", padding: "5px 10px", cursor: "pointer" }}>Delete</button>
                        </div>
                        )}
                    </For>
                )}
            </div>
        </section>

      </div>
      <button onClick={saveConfig} style={{ "margin-top": "40px", padding: "15px 40px", "font-size": "20px", "background-color": "#007bff", color: "white", border: "none", "border-radius": "8px", cursor: "pointer", "font-weight": "bold", "margin-bottom": "80px" }}>💾 Save Config to DB</button>
      
      <Show when={showMockBattle()}>
          <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <div style={{ width: "90%", height: "90%", background: "#000", border: "2px solid #ff9900", position: "relative", borderRadius: "10px", overflow: "hidden" }}>
                  <button onClick={() => setShowMockBattle(false)} style={{ position: "absolute", top: "10px", right: "20px", background: "#ff4444", color: "white", border: "none", fontSize: "20px", fontWeight: "bold", cursor: "pointer", zIndex: 2000, padding: "5px 15px", borderRadius: "5px" }}>CLOSE X</button>
                  <PhaserGame mockData={mockData()} />
              </div>
          </div>
      </Show>
    </div>
  );
};

const btnStyle = { padding: '10px 20px', marginRight: '10px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', border: 'none', borderRadius: '5px', background: '#444', color: '#ddd' };
const cardStyle = { background: "#2a2a2a", padding: "20px", "border-radius": "8px" };
const sectionHeaderStyle = { color: "#aaa", "margin-top": 0 };
const inputStyle = { background: "#222", color: "white", border: "1px solid #555", borderRadius: "4px", padding: "4px" };
const rowStyle = {display: "flex", alignItems: "center", background: "#333", padding: "10px", borderRadius: "5px"};
const statLabelStyle = {fontSize: "0.8em", color:"#ccc"};
const statInputStyle = { width: "100%", background: "#111", color: "white", border: "1px solid #555", padding: "4px" };
const shortInputStyle = { ...inputStyle, width: "70px", textAlign: "center" };
const groupStyle = { background: "#333", padding: "10px", borderRadius: "5px", display: "flex", flexDirection: "column", gap: "8px" };
const groupLabelStyle = { color: "#888", fontSize: "0.85em", fontWeight: "bold", marginBottom: "4px", borderBottom: "1px solid #555", paddingBottom: "2px" };
const compactRowStyle = { display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" };

export default DevPage;