import { createSignal, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, deleteDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { LEVEL_KEYS } from "../game/managers/LevelManager"; // [New] 레벨 리스트 동적 로드

// [설정] 역할별 기본 스탯 정의
const DEFAULT_ROLE_DEFS = {
  Leader: { hp: 200, attackPower: 25, moveSpeed: 90, attackCooldown: 500, skillCooldown: 30000, skillRange: 300, skillDuration: 10000, skillEffect: 10 },
  Runner: { hp: 100, attackPower: 12, moveSpeed: 140, attackCooldown: 400 },
  Dealer: { hp: 90, attackPower: 40, moveSpeed: 70, attackCooldown: 600 },
  Tanker: { hp: 400, attackPower: 10, moveSpeed: 40, attackCooldown: 800, skillCooldown: 10000, skillRange: 200 },
  Shooter: { hp: 80, attackPower: 30, moveSpeed: 110, attackRange: 250, attackCooldown: 500 },
  Healer: { hp: 100, attackPower: 15, moveSpeed: 110, attackCooldown: 2000, skillCooldown: 3000, skillRange: 200, aggroStackLimit: 10 },
  Raccoon: { hp: 150, attackPower: 20, moveSpeed: 100, attackCooldown: 400, skillCooldown: 8000 },
  Normal: { hp: 140, attackPower: 15, moveSpeed: 70, attackCooldown: 500 },
  NormalDog: { hp: 140, attackPower: 15, moveSpeed: 70, attackCooldown: 500 }
};

const DEFAULT_CONFIG = {
  showDebugStats: false, 
  // [Modified] startLevelIndex 추가 (기본값 0)
  gameSettings: { blueCount: 6, redCount: 6, spawnGap: 90, startY: 250, startLevelIndex: 0 },
  aiSettings: {
    common: { thinkTimeMin: 150, thinkTimeVar: 100, fleeHpThreshold: 0.2, hpRegenRate: 0.01 },
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
  const [feedbacks, setFeedbacks] = createSignal([]);

  onMount(async () => {
    // 1. 설정 로드
    try {
      const docRef = doc(db, "settings", "tacticsConfig");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const merged = { ...DEFAULT_CONFIG, ...data };
        
        // AI 설정 병합
        if (data.aiSettings) {
             merged.aiSettings = { ...DEFAULT_CONFIG.aiSettings, ...data.aiSettings };
             if (data.aiSettings.common) {
                 merged.aiSettings.common = { ...DEFAULT_CONFIG.aiSettings.common, ...data.aiSettings.common };
             }
        }
        
        // 역할 정의 병합
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
        
        // [New] startLevelIndex 안전장치
        if (merged.gameSettings.startLevelIndex === undefined) {
            merged.gameSettings.startLevelIndex = 0;
        }

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

    // 2. 피드백 로드
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

  const renderUnitRow = (unit, index, teamType) => {
    return (
        <div style={{ 
            display: "flex", 
            alignItems: "center", 
            background: teamType === 'blue' ? "#112233" : "#331111", 
            padding: "8px 12px", 
            borderRadius: "4px", 
            borderLeft: `4px solid ${teamType === 'blue' ? '#88ccff' : '#ff8888'}`,
            marginBottom: "6px",
            width: "100%",      
            boxSizing: "border-box"
        }}>
            <span style={{ minWidth: "25px", color: "#666", fontWeight: "bold" }}>#{index+1}</span>
            <select 
                value={unit.role} 
                onChange={(e) => handleRoleChange(teamType, index, e.target.value)}
                style={{ 
                    padding: "5px", borderRadius: "4px", 
                    border: `1px solid ${teamType === 'blue' ? '#446688' : '#884444'}`, 
                    background: teamType === 'blue' ? "#001122" : "#220000", 
                    color: "white", width: "110px", marginRight: "10px", fontWeight: "bold", fontSize: "0.9em",
                    flexShrink: 0
                }}
            >
                {Object.keys(config.roleDefinitions).map(role => (
                    <option value={role}>{role}</option>
                ))}
            </select>
            <div style={{ display: "flex", gap: "15px", fontSize: "0.85em", color: "#ccc", alignItems: "center", flex: 1, flexWrap: "wrap" }}>
                <span title="Health" style={{whiteSpace: "nowrap"}}>❤️ <span style={{color: "#fff"}}>{unit.hp}</span></span>
                
                <span title="Attack/Heal Power" style={{whiteSpace: "nowrap"}}>{unit.role === 'Healer' ? '💊' : '⚔️'} <span style={{color: "#ffca28"}}>{unit.attackPower}</span></span>
                
                <span title="Move Speed" style={{whiteSpace: "nowrap"}}>👟 <span style={{color: "#42a5f5"}}>{unit.moveSpeed}</span></span>
                
                <span title="Action Cooldown" style={{whiteSpace: "nowrap"}}>⏱️ <span style={{color: "#66bb6a"}}>{unit.attackCooldown}</span></span>
                
                {unit.skillCooldown > 0 && (
                    <span title="Skill Info" style={{color: "#ff88ff", borderLeft: "1px solid #555", paddingLeft: "10px", whiteSpace: "nowrap"}}>
                        ✨ CD:{unit.skillCooldown/1000}s R:{unit.skillRange}
                    </span>
                )}

                {unit.role === 'Healer' && (
                     <span title="Heal Count to Trigger Aggro" style={{color: "#ffaaaa", whiteSpace: "nowrap", borderLeft: "1px solid #555", paddingLeft: "10px"}}>
                        😡Stack <input 
                            type="number" 
                            value={unit.aggroStackLimit || 10} 
                            onInput={(e) => handleStatChange(unit.role, "aggroStackLimit", parseInt(e.target.value))} 
                            style={{ width: "40px", background: "#220000", color: "#faa", border: "1px solid #844", marginLeft: "2px" }} 
                        />
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
        
        {/* --- Global & AI Settings --- */}
        <section style={{ background: "#2a2a2a", padding: "20px", "border-radius": "8px" }}>
          <h2 style={{ color: "#aaa", "margin-top": 0 }}>⚙️ Global Settings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <label style={{display: "flex", alignItems: "center", cursor: "pointer", background: "#333", padding: "10px", borderRadius: "5px"}}>
                <input 
                    type="checkbox" 
                    checked={config.showDebugStats} 
                    onChange={(e) => setConfig("showDebugStats", e.target.checked)} 
                    style={{marginRight: "10px", transform: "scale(1.2)"}}
                />
                <span style={{color: config.showDebugStats ? "#44ff44" : "#888", fontWeight: "bold"}}>
                    Show Debug Stats (FPS/Mem)
                </span>
            </label>

            {/* [New] Start Level Selection */}
            <label style={{display: "flex", alignItems: "center", background: "#333", padding: "10px", borderRadius: "5px"}}>
                <span style={{ color: "#aaa", fontWeight: "bold", marginRight: "10px" }}>🚀 Start Level:</span>
                <select 
                    value={config.gameSettings.startLevelIndex ?? 0}
                    onChange={(e) => setConfig("gameSettings", "startLevelIndex", parseInt(e.target.value))}
                    style={{ 
                        padding: "5px", borderRadius: "4px", border: "1px solid #555", 
                        background: "#222", color: "white", fontSize: "1em", fontWeight: "bold" 
                    }}
                >
                    {/* [Modified] 맵 없음 옵션 추가 */}
                    <option value={-1}>🚫 No Map</option>
                    {/* LEVEL_KEYS를 사용하여 동적으로 옵션 생성 */}
                    {LEVEL_KEYS.map((level, idx) => (
                        <option value={idx}>{idx}: {level}</option>
                    ))}
                </select>
            </label>

            <div style={{ display: "flex", gap: "20px", "flex-wrap": "wrap", marginTop: "10px" }}>
                <label>Spawn Gap: <input type="number" value={config.gameSettings.spawnGap} onInput={(e) => setConfig("gameSettings", "spawnGap", parseInt(e.target.value))} style={{ marginLeft: "5px", width: "50px" }} /></label>
                <label>Start Y: <input type="number" value={config.gameSettings.startY} onInput={(e) => setConfig("gameSettings", "startY", parseInt(e.target.value))} style={{ marginLeft: "5px", width: "50px" }} /></label>
            </div>
          </div>
        </section>

        <section style={{ background: "#2a2a2a", padding: "20px", "border-radius": "8px" }}>
          <h2 style={{ color: "#aaa", "margin-top": 0 }}>🧠 AI Parameters</h2>
          <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
             <div style={{background: "#333", padding: "10px", borderRadius: "5px"}}>
                 <h4 style={{ color: "#ffffff", margin: "0 0 5px 0" }}>General Behavior</h4>
                 <div style={{display: "flex", gap: "15px", flexWrap: "wrap"}}>
                     <label title="HP % to trigger fleeing">
                         Flee HP% <br/>
                         <input type="number" step="0.05" min="0" max="1" 
                             value={config.aiSettings.common?.fleeHpThreshold ?? 0.2} 
                             onInput={(e) => setConfig("aiSettings", "common", "fleeHpThreshold", parseFloat(e.target.value))} 
                             style={{ width: "60px", marginTop: "5px" }} 
                         />
                     </label>
                     <label title="HP % regenerated per second when idle">
                         Idle Regen/s <br/>
                         <input type="number" step="0.005" min="0" max="0.5" 
                             value={config.aiSettings.common?.hpRegenRate ?? 0.01} 
                             onInput={(e) => setConfig("aiSettings", "common", "hpRegenRate", parseFloat(e.target.value))} 
                             style={{ width: "60px", marginTop: "5px" }} 
                         />
                     </label>
                 </div>
             </div>

             <div style={{display: "flex", gap: "20px"}}>
                <div><h4 style={{ color: "#dd88ff", margin: "5px 0" }}>Shooter</h4><label>Kite: <input type="number" value={config.aiSettings.shooter?.kiteDistance || 200} onInput={(e) => setConfig("aiSettings", "shooter", "kiteDistance", parseInt(e.target.value))} style={{ width: "50px" }} /></label></div>
                <div><h4 style={{ color: "#ffcc88", margin: "5px 0" }}>Runner</h4><label>Ambush: <input type="number" value={config.aiSettings.runner.ambushDistance} onInput={(e) => setConfig("aiSettings", "runner", "ambushDistance", parseInt(e.target.value))} style={{ width: "50px" }} /></label></div>
             </div>
          </div>
        </section>

        {/* --- Class Base Stats & Skills --- */}
        <section style={{ background: "#222", padding: "20px", "border-radius": "8px", "grid-column": "span 2", border: "1px solid #444" }}>
            <h2 style={{ color: "#ffd700", "margin-top": 0 }}>📊 Class Base Stats & Skills</h2>
            <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(300px, 1fr))", gap: "15px" }}>
                {Object.keys(config.roleDefinitions).map(role => (
                    <div style={{ background: "#333", padding: "10px", borderRadius: "5px", borderLeft: `4px solid ${role === 'Shooter' ? '#d8f' : role === 'Tanker' ? '#48f' : role === 'Healer' ? '#8f8' : role === 'Leader' ? '#ffd700' : role === 'Raccoon' ? '#ff8844' : '#aaa'}` }}>
                        <h4 style={{ margin: "0 0 10px 0", color: "#fff" }}>{role} {role === 'Healer' ? '💊' : role === 'Raccoon' ? '🦝' : ''}</h4>
                        <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "5px" }}>
                            <label style={{fontSize: "0.8em", color:"#ccc"}}>HP<input type="number" value={config.roleDefinitions[role].hp} onInput={(e) => handleStatChange(role, "hp", parseInt(e.target.value))} style={{ width: "100%", background: "#111", color: "white", border: "1px solid #555" }} /></label>
                            
                            <label style={{fontSize: "0.8em", color:"#ccc"}}>
                                {role === 'Healer' ? 'Heal Amt' : 'ATK'}
                                <input type="number" value={config.roleDefinitions[role].attackPower} onInput={(e) => handleStatChange(role, "attackPower", parseInt(e.target.value))} style={{ width: "100%", background: "#111", color: "white", border: "1px solid #555" }} />
                            </label>
                            
                            <label style={{fontSize: "0.8em", color:"#ccc"}}>SPD<input type="number" value={config.roleDefinitions[role].moveSpeed} onInput={(e) => handleStatChange(role, "moveSpeed", parseInt(e.target.value))} style={{ width: "100%", background: "#111", color: "white", border: "1px solid #555" }} /></label>
                            
                            <label style={{fontSize: "0.8em", color:"#aaffaa"}}>
                                {role === 'Healer' ? 'Motion CD (N/A)' : 'ATK CD'}
                                <input 
                                    type="number" 
                                    value={config.roleDefinitions[role].attackCooldown || 500} 
                                    onInput={(e) => handleStatChange(role, "attackCooldown", parseInt(e.target.value))} 
                                    style={{ width: "100%", background: "#112211", color: "#afa", border: "1px solid #484" }} 
                                />
                            </label>
                            
                            {config.roleDefinitions[role].skillCooldown !== undefined && (
                                <>
                                    <div style={{gridColumn: "span 2", height: "1px", background: "#555", margin: "5px 0"}}></div>
                                    <label style={{fontSize: "0.8em", color:"#ff88ff"}}>S.CD<input type="number" value={config.roleDefinitions[role].skillCooldown} onInput={(e) => handleStatChange(role, "skillCooldown", parseInt(e.target.value))} style={{ width: "100%", background: "#220022", color: "#f8f", border: "1px solid #848" }} /></label>
                                    <label style={{fontSize: "0.8em", color:"#ff88ff"}}>S.Range<input type="number" value={config.roleDefinitions[role].skillRange} onInput={(e) => handleStatChange(role, "skillRange", parseInt(e.target.value))} style={{ width: "100%", background: "#220022", color: "#f8f", border: "1px solid #848" }} /></label>
                                    {config.roleDefinitions[role].skillDuration !== undefined && <label style={{fontSize: "0.8em", color:"#ff88ff"}}>S.Dur<input type="number" value={config.roleDefinitions[role].skillDuration} onInput={(e) => handleStatChange(role, "skillDuration", parseInt(e.target.value))} style={{ width: "100%", background: "#220022", color: "#f8f", border: "1px solid #848" }} /></label>}
                                    {config.roleDefinitions[role].skillEffect !== undefined && <label style={{fontSize: "0.8em", color:"#ff88ff"}}>S.Eff(%)<input type="number" value={config.roleDefinitions[role].skillEffect} onInput={(e) => handleStatChange(role, "skillEffect", parseInt(e.target.value))} style={{ width: "100%", background: "#220022", color: "#f8f", border: "1px solid #848" }} /></label>}
                                </>
                            )}
                            
                            {config.roleDefinitions[role].aggroStackLimit !== undefined && (
                                <label style={{fontSize: "0.8em", color:"#ffaaaa"}}>
                                    Aggro Stack
                                    <input type="number" value={config.roleDefinitions[role].aggroStackLimit} onInput={(e) => handleStatChange(role, "aggroStackLimit", parseInt(e.target.value))} style={{ width: "100%", background: "#220000", color: "#faa", border: "1px solid #844" }} />
                                </label>
                            )}

                            {config.roleDefinitions[role].attackRange !== undefined && (
                                <label style={{fontSize: "0.8em", color:"#d8f", gridColumn: "span 2", marginTop: "5px"}}>Range<input type="number" value={config.roleDefinitions[role].attackRange} onInput={(e) => handleStatChange(role, "attackRange", parseInt(e.target.value))} style={{ width: "100%", background: "#220022", color: "#f8f", border: "1px solid #848" }} /></label>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>

        {/* --- 4. Blue Team Composition --- */}
        <section style={{ background: "#223344", padding: "20px", "border-radius": "8px" }}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px"}}>
            <h2 style={{ color: "#88ccff", margin: 0 }}>🛡️ Blue Team</h2>
            <label>Count: 
                <input type="number" min="1" max="12" 
                    value={config.gameSettings.blueCount} 
                    onInput={(e) => handleCountChange('blue', parseInt(e.target.value))}
                    style={{ marginLeft: "10px", width: "50px", padding: "5px" }} 
                />
            </label>
          </div>
          <div style={{ display: "block" }}>
            {config.blueTeamRoles.map((unit, index) => renderUnitRow(unit, index, 'blue'))}
          </div>
        </section>

        {/* --- 5. Red Team Composition --- */}
        <section style={{ background: "#442222", padding: "20px", "border-radius": "8px" }}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px"}}>
            <h2 style={{ color: "#ff8888", margin: 0 }}>🐺 Red Team</h2>
            <label>Count: 
                <input type="number" min="1" max="12"
                    value={config.gameSettings.redCount} 
                    onInput={(e) => handleCountChange('red', parseInt(e.target.value))}
                    style={{ marginLeft: "10px", width: "50px", padding: "5px" }} 
                />
            </label>
          </div>
          <div style={{ display: "block" }}>
            {config.redTeamRoles.map((unit, index) => renderUnitRow(unit, index, 'red'))}
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
                    feedbacks().map(item => (
                        <div style={{ 
                            background: "#444", padding: "10px", marginBottom: "8px", borderRadius: "4px",
                            display: "flex", justifyContent: "space-between", alignItems: "center"
                        }}>
                            <div>
                                <div style={{color: "#fff", fontWeight: "bold"}}>{item.message}</div>
                                <div style={{color: "#aaa", fontSize: "0.8em"}}>{new Date(item.timestamp).toLocaleString()}</div>
                            </div>
                            <button onClick={() => handleDeleteFeedback(item.id)} style={{
                                background: "#ff4444", color: "white", border: "none", borderRadius: "4px", padding: "5px 10px", cursor: "pointer"
                            }}>Delete</button>
                        </div>
                    ))
                )}
            </div>
        </section>

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