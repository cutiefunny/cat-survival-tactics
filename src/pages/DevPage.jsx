import { createSignal, onMount, For } from "solid-js";
import { createStore } from "solid-js/store";
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, deleteDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useNavigate } from "@solidjs/router";
import { LEVEL_KEYS } from "../game/managers/LevelManager";

// [설정] 역할별 기본 스탯 정의 (defense, killReward 추가)
const DEFAULT_ROLE_DEFS = {
  Leader: { hp: 200, attackPower: 25, moveSpeed: 90, defense: 2, attackCooldown: 500, skillCooldown: 30000, skillRange: 300, skillDuration: 10000, skillEffect: 10, killReward: 100 },
  Runner: { hp: 100, attackPower: 12, moveSpeed: 140, defense: 0, attackCooldown: 400, killReward: 15 },
  Dealer: { hp: 90, attackPower: 40, moveSpeed: 70, defense: 0, attackCooldown: 600, killReward: 20 },
  Tanker: { hp: 400, attackPower: 10, moveSpeed: 40, defense: 5, attackCooldown: 800, skillCooldown: 10000, skillRange: 200, killReward: 30 },
  Shooter: { hp: 80, attackPower: 30, moveSpeed: 110, defense: 0, attackRange: 250, attackCooldown: 500, killReward: 20 },
  Healer: { hp: 100, attackPower: 15, moveSpeed: 110, defense: 0, attackCooldown: 2000, skillCooldown: 3000, skillRange: 200, aggroStackLimit: 10, killReward: 25 },
  Raccoon: { hp: 150, attackPower: 20, moveSpeed: 100, defense: 0, attackCooldown: 400, skillCooldown: 8000, killReward: 20 },
  Normal: { hp: 140, attackPower: 15, moveSpeed: 70, defense: 0, attackCooldown: 500, killReward: 10 },
  NormalDog: { hp: 140, attackPower: 15, moveSpeed: 70, defense: 0, attackCooldown: 500, killReward: 10 }
};

// [설정] 기본 유닛 가격
const DEFAULT_UNIT_COSTS = {
    'Tanker': 10, 'Shooter': 20, 'Healer': 25, 'Raccoon': 10, 'Runner': 10, 'Normal': 5
};

const DEFAULT_CONFIG = {
  showDebugStats: false, 
  gameSettings: { blueCount: 6, redCount: 6, spawnGap: 90, startY: 250, startLevelIndex: 0, initialCoins: 50 },
  aiSettings: {
    common: { thinkTimeMin: 150, thinkTimeVar: 100, fleeHpThreshold: 0.2, hpRegenRate: 0.01 },
    runner: { ambushDistance: 60, fleeDuration: 1500 },
    dealer: { safeDistance: 150, followDistance: 50 },
    shooter: { attackRange: 250, kiteDistance: 200 } 
  },
  roleDefinitions: DEFAULT_ROLE_DEFS,
  unitCosts: DEFAULT_UNIT_COSTS,
  redTeamRoles: [],
  blueTeamRoles: []
};

const DevPage = () => {
  const navigate = useNavigate();
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
        // Deep Merge Simulation
        const merged = { ...DEFAULT_CONFIG, ...data };
        
        if (data.gameSettings) merged.gameSettings = { ...DEFAULT_CONFIG.gameSettings, ...data.gameSettings };
        if (data.aiSettings) {
             merged.aiSettings = { ...DEFAULT_CONFIG.aiSettings, ...data.aiSettings };
             if (data.aiSettings.common) {
                 merged.aiSettings.common = { ...DEFAULT_CONFIG.aiSettings.common, ...data.aiSettings.common };
             }
        }
        if (data.unitCosts) merged.unitCosts = { ...DEFAULT_UNIT_COSTS, ...data.unitCosts };
        
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
        
        if (merged.gameSettings.startLevelIndex === undefined) {
            merged.gameSettings.startLevelIndex = 0;
        }
        if (merged.gameSettings.initialCoins === undefined) {
            merged.gameSettings.initialCoins = 50;
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

  const handleCostChange = (roleName, value) => {
    setConfig("unitCosts", roleName, value);
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
                onInput={(e) => handleRoleChange(teamType, index, e.target.value)}
                style={{ 
                    padding: "5px", borderRadius: "4px", 
                    border: `1px solid ${teamType === 'blue' ? '#446688' : '#884444'}`, 
                    background: teamType === 'blue' ? "#001122" : "#220000", 
                    color: "white", width: "110px", marginRight: "10px", fontWeight: "bold", fontSize: "0.9em",
                    flexShrink: 0
                }}
            >
                <For each={Object.keys(config.roleDefinitions)}>
                    {(role) => <option value={role}>{role}</option>}
                </For>
            </select>
            <div style={{ display: "flex", gap: "15px", fontSize: "0.85em", color: "#ccc", alignItems: "center", flex: 1, flexWrap: "wrap" }}>
                <span title="Health" style={{whiteSpace: "nowrap"}}>❤️ <span style={{color: "#fff"}}>{unit.hp}</span></span>
                
                <span title="Attack/Heal Power" style={{whiteSpace: "nowrap"}}>{unit.role === 'Healer' ? '💊' : '⚔️'} <span style={{color: "#ffca28"}}>{unit.attackPower}</span></span>
                
                <span title="Defense" style={{whiteSpace: "nowrap"}}>🛡️ <span style={{color: "#aaaaff"}}>{unit.defense ?? 0}</span></span>
                
                <span title="Move Speed" style={{whiteSpace: "nowrap"}}>👟 <span style={{color: "#42a5f5"}}>{unit.moveSpeed}</span></span>
                
                <span title="Action Cooldown" style={{whiteSpace: "nowrap"}}>⏱️ <span style={{color: "#66bb6a"}}>{unit.attackCooldown}</span></span>
                
                {unit.skillCooldown > 0 && (
                    <span title="Skill Info" style={{color: "#ff88ff", borderLeft: "1px solid #555", paddingLeft: "10px", whiteSpace: "nowrap"}}>
                        ✨ CD:{unit.skillCooldown/1000}s R:{unit.skillRange}
                    </span>
                )}

                {/* [New] Kill Reward Display in List */}
                <span title="Kill Reward" style={{whiteSpace: "nowrap", borderLeft: "1px solid #555", paddingLeft: "10px"}}>
                    💰 <span style={{color: "#ffd700"}}>{unit.killReward ?? 10}</span>
                </span>

                {unit.role === 'Healer' && (
                     <span title="Heal Count to Trigger Aggro" style={{color: "#ffaaaa", whiteSpace: "nowrap", borderLeft: "1px solid #555", paddingLeft: "10px"}}>
                        😡Stack {unit.aggroStackLimit || 10}
                     </span>
                )}
            </div>
        </div>
    );
  };

  return (
    <div style={{ padding: "40px", "background-color": "#1a1a1a", color: "white", "height": "100vh", "overflow-y": "auto", "box-sizing": "border-box", "font-family": "monospace" }}>
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "border-bottom": "2px solid #444", "padding-bottom": "10px" }}>
        <h1 style={{ margin: 0 }}>🐱 Tactics Dev Console</h1>
        <button onClick={() => navigate('/')} style={btnStyle}>⬅ Back to Game</button>
      </div>
      
      <div style={{ "margin-top": "20px", "font-size": "1.2em", "font-weight": "bold", color: status().includes("Error") || status().includes("Failed") ? "#ff4444" : "#44ff44" }}>
        {status()}
      </div>

      <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "20px", "margin-top": "30px" }}>
        
        {/* --- Global & AI Settings --- */}
        <section style={cardStyle}>
          <h2 style={sectionHeaderStyle}>⚙️ Global Settings</h2>
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

            <label style={rowStyle}>
                <span style={{ color: "#aaa", fontWeight: "bold", marginRight: "10px" }}>🚀 Start Level:</span>
                <select 
                    value={config.gameSettings.startLevelIndex ?? 0}
                    onInput={(e) => setConfig("gameSettings", "startLevelIndex", parseInt(e.target.value))}
                    style={inputStyle}
                >
                    <option value={-1}>🚫 No Map</option>
                    <For each={LEVEL_KEYS}>
                        {(level, idx) => <option value={idx()}>{idx()}: {level}</option>}
                    </For>
                </select>
            </label>

            <label style={rowStyle}>
                <span style={{ color: "#ffdd00", fontWeight: "bold", marginRight: "10px" }}>💰 Initial Coins:</span>
                <input 
                    type="number" 
                    value={config.gameSettings.initialCoins}
                    onInput={(e) => setConfig("gameSettings", "initialCoins", parseInt(e.target.value))}
                    style={inputStyle}
                />
            </label>

            <div style={{ display: "flex", gap: "20px", "flex-wrap": "wrap", marginTop: "10px" }}>
                <label>Spawn Gap: <input type="number" value={config.gameSettings.spawnGap} onInput={(e) => setConfig("gameSettings", "spawnGap", parseInt(e.target.value))} style={{ marginLeft: "5px", width: "50px", ...inputStyle }} /></label>
                <label>Start Y: <input type="number" value={config.gameSettings.startY} onInput={(e) => setConfig("gameSettings", "startY", parseInt(e.target.value))} style={{ marginLeft: "5px", width: "50px", ...inputStyle }} /></label>
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionHeaderStyle}>🧠 AI Parameters</h2>
          <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
             <div style={{background: "#333", padding: "10px", borderRadius: "5px"}}>
                 <h4 style={{ color: "#ffffff", margin: "0 0 5px 0" }}>General Behavior</h4>
                 <div style={{display: "flex", gap: "15px", flexWrap: "wrap"}}>
                     <label title="HP % to trigger fleeing">
                         Flee HP% <br/>
                         <input type="number" step="0.05" min="0" max="1" 
                             value={config.aiSettings.common?.fleeHpThreshold ?? 0.2} 
                             onInput={(e) => setConfig("aiSettings", "common", "fleeHpThreshold", parseFloat(e.target.value))} 
                             style={{ width: "60px", marginTop: "5px", ...inputStyle }} 
                         />
                     </label>
                     <label title="HP % regenerated per second when idle">
                         Idle Regen/s <br/>
                         <input type="number" step="0.005" min="0" max="0.5" 
                             value={config.aiSettings.common?.hpRegenRate ?? 0.01} 
                             onInput={(e) => setConfig("aiSettings", "common", "hpRegenRate", parseFloat(e.target.value))} 
                             style={{ width: "60px", marginTop: "5px", ...inputStyle }} 
                         />
                     </label>
                 </div>
             </div>

             <div style={{display: "flex", gap: "20px"}}>
                <div><h4 style={{ color: "#dd88ff", margin: "5px 0" }}>Shooter</h4><label>Kite: <input type="number" value={config.aiSettings.shooter?.kiteDistance || 200} onInput={(e) => setConfig("aiSettings", "shooter", "kiteDistance", parseInt(e.target.value))} style={{ width: "50px", ...inputStyle }} /></label></div>
                <div><h4 style={{ color: "#ffcc88", margin: "5px 0" }}>Runner</h4><label>Ambush: <input type="number" value={config.aiSettings.runner.ambushDistance} onInput={(e) => setConfig("aiSettings", "runner", "ambushDistance", parseInt(e.target.value))} style={{ width: "50px", ...inputStyle }} /></label></div>
             </div>
          </div>
        </section>

        {/* --- Class Base Stats & Skills --- */}
        <section style={{ background: "#222", padding: "20px", "border-radius": "8px", "grid-column": "span 2", border: "1px solid #444" }}>
            <h2 style={{ color: "#ffd700", "margin-top": 0 }}>📊 Class Base Stats & Cost</h2>
            <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(300px, 1fr))", gap: "15px" }}>
                <For each={Object.keys(config.roleDefinitions)}>
                    {(role) => (
                    <div style={{ background: "#333", padding: "10px", borderRadius: "5px", borderLeft: `4px solid ${role === 'Shooter' ? '#d8f' : role === 'Tanker' ? '#48f' : role === 'Healer' ? '#8f8' : role === 'Leader' ? '#ffd700' : role === 'Raccoon' ? '#ff8844' : '#aaa'}` }}>
                        <div style={{display: "flex", "justify-content": "space-between", "margin-bottom": "10px"}}>
                            <h4 style={{ margin: "0", color: "#fff" }}>{role} {role === 'Healer' ? '💊' : role === 'Raccoon' ? '🦝' : ''}</h4>
                            <label style={{ fontSize: "0.9em", color: "#ffdd00" }}>
                                💵Cost: 
                                <input 
                                    type="number" 
                                    value={config.unitCosts?.[role] ?? 0} 
                                    onInput={(e) => handleCostChange(role, parseInt(e.target.value))}
                                    style={{ width: "50px", marginLeft:"5px", ...inputStyle, borderColor: "#aa8800" }} 
                                />
                            </label>
                        </div>
                        
                        <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "5px" }}>
                            <label style={statLabelStyle}>HP<input type="number" value={config.roleDefinitions[role].hp} onInput={(e) => handleStatChange(role, "hp", parseInt(e.target.value))} style={statInputStyle} /></label>
                            
                            <label style={statLabelStyle}>
                                {role === 'Healer' ? 'Heal Amt' : 'ATK'}
                                <input type="number" value={config.roleDefinitions[role].attackPower} onInput={(e) => handleStatChange(role, "attackPower", parseInt(e.target.value))} style={statInputStyle} />
                            </label>
                            
                            <label style={statLabelStyle}>DEF<input type="number" value={config.roleDefinitions[role].defense ?? 0} onInput={(e) => handleStatChange(role, "defense", parseInt(e.target.value))} style={statInputStyle} /></label>

                            <label style={statLabelStyle}>SPD<input type="number" value={config.roleDefinitions[role].moveSpeed} onInput={(e) => handleStatChange(role, "moveSpeed", parseInt(e.target.value))} style={statInputStyle} /></label>
                            
                            <label style={{...statLabelStyle, color: "#aaffaa"}}>
                                {role === 'Healer' ? 'Motion CD' : 'ATK CD'}
                                <input 
                                    type="number" 
                                    value={config.roleDefinitions[role].attackCooldown || 500} 
                                    onInput={(e) => handleStatChange(role, "attackCooldown", parseInt(e.target.value))} 
                                    style={{ ...statInputStyle, background: "#112211", borderColor: "#484", color: "#afa" }} 
                                />
                            </label>

                            {/* [New] Kill Reward Input */}
                            <label style={{...statLabelStyle, color: "#ffd700"}}>
                                Kill Reward
                                <input 
                                    type="number" 
                                    value={config.roleDefinitions[role].killReward ?? 10} 
                                    onInput={(e) => handleStatChange(role, "killReward", parseInt(e.target.value))} 
                                    style={{ ...statInputStyle, background: "#221100", borderColor: "#aa8800", color: "#ffd700" }} 
                                />
                            </label>
                            
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
                                <label style={{...statLabelStyle, color: "#ffaaaa"}}>
                                    Aggro Stack
                                    <input type="number" value={config.roleDefinitions[role].aggroStackLimit} onInput={(e) => handleStatChange(role, "aggroStackLimit", parseInt(e.target.value))} style={{ ...statInputStyle, background: "#220000", borderColor: "#844", color: "#faa" }} />
                                </label>
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
            <label>Count: 
                <input type="number" min="1" max="12" 
                    value={config.gameSettings.blueCount} 
                    onInput={(e) => handleCountChange('blue', parseInt(e.target.value))}
                    style={{ marginLeft: "10px", width: "50px", padding: "5px", ...inputStyle }} 
                />
            </label>
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
            <h2 style={{ color: "#ff8888", margin: 0 }}>🐺 Red Team</h2>
            <label>Count: 
                <input type="number" min="1" max="12"
                    value={config.gameSettings.redCount} 
                    onInput={(e) => handleCountChange('red', parseInt(e.target.value))}
                    style={{ marginLeft: "10px", width: "50px", padding: "5px", ...inputStyle }} 
                />
            </label>
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
                        )}
                    </For>
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

// Styles
const btnStyle = { padding: '10px 20px', marginRight: '10px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', border: 'none', borderRadius: '5px', background: '#444', color: '#ddd' };
const cardStyle = { background: "#2a2a2a", padding: "20px", "border-radius": "8px" };
const sectionHeaderStyle = { color: "#aaa", "margin-top": 0 };
const inputStyle = { background: "#222", color: "white", border: "1px solid #555", borderRadius: "4px", padding: "4px" };
const rowStyle = {display: "flex", alignItems: "center", background: "#333", padding: "10px", borderRadius: "5px"};
const statLabelStyle = {fontSize: "0.8em", color:"#ccc"};
const statInputStyle = { width: "100%", background: "#111", color: "white", border: "1px solid #555", padding: "4px" };

export default DevPage;