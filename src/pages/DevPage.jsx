import { createSignal, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

// [설정] 역할별 기본 스탯 정의
const DEFAULT_ROLE_DEFS = {
  Leader: { hp: 200, attackPower: 25, moveSpeed: 90, attackCooldown: 500 },
  Runner: { hp: 100, attackPower: 12, moveSpeed: 140, attackCooldown: 400 },
  Dealer: { hp: 90, attackPower: 40, moveSpeed: 70, attackCooldown: 600 },
  Tanker: { hp: 400, attackPower: 10, moveSpeed: 40, attackCooldown: 800 },
  Shooter: { hp: 80, attackPower: 30, moveSpeed: 110, attackRange: 250, attackCooldown: 500 },
  Normal: { hp: 140, attackPower: 15, moveSpeed: 70, attackCooldown: 500 },
  NormalDog: { hp: 140, attackPower: 15, moveSpeed: 70, attackCooldown: 500 }
};

const DEFAULT_CONFIG = {
  gameSettings: { blueCount: 6, redCount: 6, spawnGap: 90, startY: 250 },
  aiSettings: {
    common: { thinkTimeMin: 150, thinkTimeVar: 100 },
    runner: { ambushDistance: 60, fleeDuration: 1500 },
    dealer: { safeDistance: 150, followDistance: 50 },
    shooter: { attackRange: 250, kiteDistance: 200 }
  },
  roleDefinitions: DEFAULT_ROLE_DEFS,
  redTeamRoles: [],
  blueTeamRoles: []
};

const DevPage = () => {
  const [config, setConfig] = createStore(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  const [status, setStatus] = createSignal("Loading...");

  onMount(async () => {
    try {
      const docRef = doc(db, "settings", "tacticsConfig");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log("Loaded:", data);
        
        const merged = { ...DEFAULT_CONFIG, ...data };
        if (data.aiSettings) merged.aiSettings = { ...DEFAULT_CONFIG.aiSettings, ...data.aiSettings };
        if (!data.roleDefinitions) merged.roleDefinitions = DEFAULT_ROLE_DEFS;

        const bCount = merged.gameSettings.blueCount || 6;
        const rCount = merged.gameSettings.redCount || 6;
        merged.gameSettings.blueCount = bCount;
        merged.gameSettings.redCount = rCount;

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
  });

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

  const saveConfig = async () => {
    setStatus("Saving...");
    try {
      const cleanConfig = JSON.parse(JSON.stringify(config));
      await setDoc(doc(db, "settings", "tacticsConfig"), cleanConfig);
      setStatus("Saved Successfully! 🎉");
    } catch (err) {
      console.error(err);
      setStatus("Save Failed ❌");
    }
  };

  // [UI Helper] 유닛 행 렌더링
  const renderUnitRow = (unit, index, teamType) => {
    return (
        <div style={{ 
            display: "flex", 
            alignItems: "center", 
            background: teamType === 'blue' ? "#112233" : "#331111", 
            padding: "8px 12px", 
            borderRadius: "4px", 
            borderLeft: `4px solid ${teamType === 'blue' ? '#88ccff' : '#ff8888'}`,
            marginBottom: "6px"
        }}>
            {/* 1. Index */}
            <span style={{ width: "30px", color: "#666", fontWeight: "bold" }}>#{index+1}</span>
            
            {/* 2. Role Selector */}
            <select 
                value={unit.role} 
                onChange={(e) => handleRoleChange(teamType, index, e.target.value)}
                style={{ 
                    padding: "5px", 
                    borderRadius: "4px", 
                    border: `1px solid ${teamType === 'blue' ? '#446688' : '#884444'}`, 
                    background: teamType === 'blue' ? "#001122" : "#220000", 
                    color: "white", 
                    width: "140px", 
                    marginRight: "20px",
                    fontWeight: "bold"
                }}
            >
                {Object.keys(config.roleDefinitions).map(role => (
                    <option value={role}>{role}</option>
                ))}
            </select>

            {/* 3. Stats Display (One Long Row) */}
            <div style={{ display: "flex", gap: "20px", fontSize: "0.95em", color: "#ccc", alignItems: "center", flex: 1, whiteSpace: "nowrap", overflowX: "auto" }}>
                <span title="Health" style={{display: "flex", alignItems: "center", gap: "5px"}}>
                    ❤️ <span style={{color: "#fff"}}>{unit.hp}</span>
                </span>
                <span title="Attack Power" style={{display: "flex", alignItems: "center", gap: "5px"}}>
                    ⚔️ <span style={{color: "#ffca28"}}>{unit.attackPower}</span>
                </span>
                <span title="Move Speed" style={{display: "flex", alignItems: "center", gap: "5px"}}>
                    👟 <span style={{color: "#42a5f5"}}>{unit.moveSpeed}</span>
                </span>
                <span title="Attack Cooldown" style={{display: "flex", alignItems: "center", gap: "5px"}}>
                    ⏱️ <span style={{color: "#66bb6a"}}>{unit.attackCooldown || 500}ms</span>
                </span>
                {/* Optional Stats */}
                {unit.attackRange && (
                    <span title="Attack Range" style={{display: "flex", alignItems: "center", gap: "5px", color: "#d1c4e9"}}>
                        🎯 <span style={{color: "#e040fb"}}>{unit.attackRange}</span>
                    </span>
                )}
            </div>
        </div>
    );
  };

  return (
    <div style={{ padding: "40px", "background-color": "#1a1a1a", color: "white", "height": "100vh", "overflow-y": "auto", "box-sizing": "border-box", "font-family": "monospace" }}>
      <h1 style={{ "border-bottom": "2px solid #444", "padding-bottom": "10px" }}>🐱 Tactics Dev Console</h1>
      
      <div style={{ "margin-top": "20px", "font-size": "1.2em", "font-weight": "bold", color: status().includes("Error") || status().includes("Failed") ? "#ff4444" : "#44ff44" }}>
        {status()}
      </div>

      <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "20px", "margin-top": "30px" }}>
        
        {/* --- 1. Global Settings --- */}
        <section style={{ background: "#2a2a2a", padding: "20px", "border-radius": "8px" }}>
          <h2 style={{ color: "#aaa", "margin-top": 0 }}>⚙️ Global Settings</h2>
          <div style={{ display: "flex", gap: "20px", "flex-wrap": "wrap" }}>
            <label>Spawn Gap: <input type="number" value={config.gameSettings.spawnGap} onInput={(e) => setConfig("gameSettings", "spawnGap", parseInt(e.target.value))} style={{ marginLeft: "5px", width: "50px" }} /></label>
            <label>Start Y: <input type="number" value={config.gameSettings.startY} onInput={(e) => setConfig("gameSettings", "startY", parseInt(e.target.value))} style={{ marginLeft: "5px", width: "50px" }} /></label>
          </div>
        </section>

        {/* --- 2. AI Settings --- */}
        <section style={{ background: "#2a2a2a", padding: "20px", "border-radius": "8px" }}>
          <h2 style={{ color: "#aaa", "margin-top": 0 }}>🧠 AI Parameters</h2>
          <div style={{display: "flex", gap: "20px"}}>
             <div>
                <h4 style={{ color: "#dd88ff", margin: "5px 0" }}>Shooter AI</h4>
                <div style={{ display: "flex", gap: "5px" }}>
                  <label>Kite Dist: <input type="number" value={config.aiSettings.shooter?.kiteDistance || 200} onInput={(e) => setConfig("aiSettings", "shooter", "kiteDistance", parseInt(e.target.value))} style={{ width: "50px" }} /></label>
                </div>
             </div>
             <div>
                <h4 style={{ color: "#ffcc88", margin: "5px 0" }}>Runner AI</h4>
                <div style={{ display: "flex", gap: "5px" }}>
                   <label>Ambush Dist: <input type="number" value={config.aiSettings.runner.ambushDistance} onInput={(e) => setConfig("aiSettings", "runner", "ambushDistance", parseInt(e.target.value))} style={{ width: "50px" }} /></label>
                </div>
             </div>
          </div>
        </section>

        {/* --- 3. Class Base Stats Editor --- */}
        <section style={{ background: "#222", padding: "20px", "border-radius": "8px", "grid-column": "span 2", border: "1px solid #444" }}>
            <h2 style={{ color: "#ffd700", "margin-top": 0 }}>📊 Class Base Stats</h2>
            <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(280px, 1fr))", gap: "15px" }}>
                {Object.keys(config.roleDefinitions).map(role => (
                    <div style={{ background: "#333", padding: "10px", borderRadius: "5px", borderLeft: `4px solid ${role === 'Shooter' ? '#d8f' : role === 'Tanker' ? '#48f' : '#aaa'}` }}>
                        <h4 style={{ margin: "0 0 10px 0", color: "#fff" }}>{role}</h4>
                        <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "5px" }}>
                            <label style={{fontSize: "0.8em", color:"#ccc"}}>HP
                                <input type="number" value={config.roleDefinitions[role].hp} 
                                    onInput={(e) => handleStatChange(role, "hp", parseInt(e.target.value))}
                                    style={{ width: "100%", background: "#111", color: "white", border: "1px solid #555" }} />
                            </label>
                            <label style={{fontSize: "0.8em", color:"#ccc"}}>ATK
                                <input type="number" value={config.roleDefinitions[role].attackPower} 
                                    onInput={(e) => handleStatChange(role, "attackPower", parseInt(e.target.value))}
                                    style={{ width: "100%", background: "#111", color: "white", border: "1px solid #555" }} />
                            </label>
                            <label style={{fontSize: "0.8em", color:"#ccc"}}>Speed
                                <input type="number" value={config.roleDefinitions[role].moveSpeed} 
                                    onInput={(e) => handleStatChange(role, "moveSpeed", parseInt(e.target.value))}
                                    style={{ width: "100%", background: "#111", color: "white", border: "1px solid #555" }} />
                            </label>
                            <label style={{fontSize: "0.8em", color:"#aaffaa"}}>CD(ms)
                                <input type="number" value={config.roleDefinitions[role].attackCooldown || 500} 
                                    onInput={(e) => handleStatChange(role, "attackCooldown", parseInt(e.target.value))}
                                    style={{ width: "100%", background: "#112211", color: "#afa", border: "1px solid #484" }} />
                            </label>

                            {config.roleDefinitions[role].attackRange !== undefined && (
                                <label style={{fontSize: "0.8em", color:"#d8f", gridColumn: "span 2"}}>Range
                                    <input type="number" value={config.roleDefinitions[role].attackRange} 
                                        onInput={(e) => handleStatChange(role, "attackRange", parseInt(e.target.value))}
                                        style={{ width: "100%", background: "#220022", color: "#f8f", border: "1px solid #848" }} />
                                </label>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>
      
      <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "20px" }}>
        {/* --- 4. Blue Team Composition --- */}
        <section style={{ background: "#223344", padding: "20px", "border-radius": "8px" }}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px"}}>
            <h2 style={{ color: "#88ccff", margin: 0 }}>🛡️ Blue Team Composition</h2>
            <label>Unit Count: 
                <input type="number" min="1" max="12" 
                    value={config.gameSettings.blueCount} 
                    onInput={(e) => handleCountChange('blue', parseInt(e.target.value))}
                    style={{ marginLeft: "10px", width: "50px", padding: "5px" }} 
                />
            </label>
          </div>
          <div>
            {config.blueTeamRoles.map((unit, index) => renderUnitRow(unit, index, 'blue'))}
          </div>
        </section>

        {/* --- 5. Red Team Composition --- */}
        <section style={{ background: "#442222", padding: "20px", "border-radius": "8px" }}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px"}}>
            <h2 style={{ color: "#ff8888", margin: 0 }}>🐺 Red Team Composition</h2>
            <label>Unit Count: 
                <input type="number" min="1" max="12"
                    value={config.gameSettings.redCount} 
                    onInput={(e) => handleCountChange('red', parseInt(e.target.value))}
                    style={{ marginLeft: "10px", width: "50px", padding: "5px" }} 
                />
            </label>
          </div>
          <div>
            {config.redTeamRoles.map((unit, index) => renderUnitRow(unit, index, 'red'))}
          </div>
        </section>
      </div>

      </div>

      <button onClick={saveConfig} style={{
        "margin-top": "40px", padding: "15px 40px", "font-size": "20px", 
        "background-color": "#007bff", color: "white", border: "none", 
        "border-radius": "8px", cursor: "pointer", "font-weight": "bold",
        "margin-bottom": "80px"
      }}>
        💾 Save Config to DB
      </button>

      <div style={{ "margin-top": "20px", color: "#666" }}>
        * Refresh the game page after saving to apply changes.
      </div>
    </div>
  );
};

export default DevPage;