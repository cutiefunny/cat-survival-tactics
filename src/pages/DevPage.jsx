import { createSignal, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

// [기본값] DB에 데이터가 없을 경우 사용할 초기값 (BattleScene과 동일하게 맞춤)
const DEFAULT_CONFIG = {
  gameSettings: { unitCount: 6, spawnGap: 90, startY: 250 },
  aiSettings: {
    common: { thinkTimeMin: 150, thinkTimeVar: 100 },
    runner: { ambushDistance: 60, fleeDuration: 1500 },
    dealer: { safeDistance: 150, followDistance: 50 },
    // [NEW] 슈터 설정 기본값
    shooter: { attackRange: 250, kiteDistance: 200 }
  },
  redTeamStats: { role: "NormalDog", hp: 140, attackPower: 15, moveSpeed: 70 },
  blueTeamRoles: [
    { role: "Leader", hp: 200, attackPower: 25, moveSpeed: 90 },
    { role: "Runner", hp: 100, attackPower: 12, moveSpeed: 140 },
    { role: "Dealer", hp: 90, attackPower: 40, moveSpeed: 70 },
    { role: "Tanker", hp: 400, attackPower: 10, moveSpeed: 40 },
    { role: "Normal", hp: 140, attackPower: 15, moveSpeed: 70 },
    { role: "Shooter", hp: 80, attackPower: 30, moveSpeed: 110, attackRange: 250 }
  ]
};

const DevPage = () => {
  // SolidJS Store를 사용하여 중첩된 객체(nested object) 반응성 관리
  const [config, setConfig] = createStore(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  const [status, setStatus] = createSignal("Loading...");

  // DB에서 설정 불러오기
  onMount(async () => {
    try {
      const docRef = doc(db, "settings", "tacticsConfig");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log("Loaded:", data);
        
        // [Merge Logic] DB 데이터 + 로컬 기본값 병합 (누락된 필드 방지)
        // 특히 shooter 설정이 DB에 없을 경우 기본값을 사용하도록 처리
        const mergedAiSettings = { ...DEFAULT_CONFIG.aiSettings, ...(data.aiSettings || {}) };
        
        setConfig({
          ...DEFAULT_CONFIG,
          ...data,
          aiSettings: mergedAiSettings
        });
        setStatus("Config Loaded ✅");
      } else {
        setStatus("No Config Found (Using Default) ⚠️");
      }
    } catch (err) {
      console.error(err);
      setStatus("Error Loading Config ❌");
    }
  });

  // 설정 저장하기
  const saveConfig = async () => {
    setStatus("Saving...");
    try {
      // Store는 Proxy 객체이므로 순수 JSON으로 변환 후 저장
      const cleanConfig = JSON.parse(JSON.stringify(config));
      await setDoc(doc(db, "settings", "tacticsConfig"), cleanConfig);
      setStatus("Saved Successfully! 🎉");
    } catch (err) {
      console.error(err);
      setStatus("Save Failed ❌");
    }
  };

  return (
    <div style={{ padding: "40px", "background-color": "#1a1a1a", color: "white", "min-height": "100vh", "font-family": "monospace" }}>
      <h1 style={{ "border-bottom": "2px solid #444", "padding-bottom": "10px" }}>🐱 Tactics Dev Console</h1>
      
      <div style={{ "margin-top": "20px", "font-size": "1.2em", "font-weight": "bold", color: status().includes("Error") || status().includes("Failed") ? "#ff4444" : "#44ff44" }}>
        {status()}
      </div>

      <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "20px", "margin-top": "30px" }}>
        
        {/* --- 1. Game Settings --- */}
        <section style={{ background: "#2a2a2a", padding: "20px", "border-radius": "8px" }}>
          <h2 style={{ color: "#aaa", "margin-top": 0 }}>⚙️ Game Settings</h2>
          <div style={{ display: "flex", gap: "10px", "flex-direction": "column" }}>
            <label>
              Unit Count: 
              <input type="number" value={config.gameSettings.unitCount} 
                onInput={(e) => setConfig("gameSettings", "unitCount", parseInt(e.target.value))}
                style={{ "margin-left": "10px", padding: "5px" }} />
            </label>
            <label>
              Spawn Gap: 
              <input type="number" value={config.gameSettings.spawnGap} 
                onInput={(e) => setConfig("gameSettings", "spawnGap", parseInt(e.target.value))}
                style={{ "margin-left": "10px", padding: "5px" }} />
            </label>
          </div>
        </section>

        {/* --- 2. AI Settings (Shooter 포함) --- */}
        <section style={{ background: "#2a2a2a", padding: "20px", "border-radius": "8px" }}>
          <h2 style={{ color: "#aaa", "margin-top": 0 }}>🧠 AI Parameters</h2>
          
          <h4 style={{ color: "#88ccff", "margin-bottom": "5px" }}>Common</h4>
          <div style={{ display: "flex", gap: "10px", "margin-bottom": "15px" }}>
            <label>Think Min: <input type="number" value={config.aiSettings.common.thinkTimeMin} onInput={(e) => setConfig("aiSettings", "common", "thinkTimeMin", parseInt(e.target.value))} style={{ width: "60px" }} /></label>
            <label>Var: <input type="number" value={config.aiSettings.common.thinkTimeVar} onInput={(e) => setConfig("aiSettings", "common", "thinkTimeVar", parseInt(e.target.value))} style={{ width: "60px" }} /></label>
          </div>

          <h4 style={{ color: "#ffcc88", "margin-bottom": "5px" }}>Runner (Assassin)</h4>
          <div style={{ display: "flex", gap: "10px", "margin-bottom": "15px" }}>
            <label>Ambush Dist: <input type="number" value={config.aiSettings.runner.ambushDistance} onInput={(e) => setConfig("aiSettings", "runner", "ambushDistance", parseInt(e.target.value))} style={{ width: "60px" }} /></label>
            <label>Flee Time: <input type="number" value={config.aiSettings.runner.fleeDuration} onInput={(e) => setConfig("aiSettings", "runner", "fleeDuration", parseInt(e.target.value))} style={{ width: "70px" }} /></label>
          </div>

          <h4 style={{ color: "#ff8888", "margin-bottom": "5px" }}>Dealer (Kiter)</h4>
          <div style={{ display: "flex", gap: "10px", "margin-bottom": "15px" }}>
            <label>Safe Dist: <input type="number" value={config.aiSettings.dealer.safeDistance} onInput={(e) => setConfig("aiSettings", "dealer", "safeDistance", parseInt(e.target.value))} style={{ width: "60px" }} /></label>
            <label>Follow Dist: <input type="number" value={config.aiSettings.dealer.followDistance} onInput={(e) => setConfig("aiSettings", "dealer", "followDistance", parseInt(e.target.value))} style={{ width: "60px" }} /></label>
          </div>

          {/* [NEW] 슈터 설정 추가 */}
          <h4 style={{ color: "#dd88ff", "margin-bottom": "5px" }}>🎯 Shooter (Long Range)</h4>
          <div style={{ display: "flex", gap: "10px" }}>
            <label title="공격 가능 거리">Attack Range: 
              <input type="number" value={config.aiSettings.shooter?.attackRange || 250} 
                onInput={(e) => setConfig("aiSettings", "shooter", "attackRange", parseInt(e.target.value))} 
                style={{ width: "60px", "margin-left": "5px" }} />
            </label>
            <label title="적이 이 거리보다 가까우면 도망감">Kite Distance: 
              <input type="number" value={config.aiSettings.shooter?.kiteDistance || 200} 
                onInput={(e) => setConfig("aiSettings", "shooter", "kiteDistance", parseInt(e.target.value))} 
                style={{ width: "60px", "margin-left": "5px" }} />
            </label>
          </div>

        </section>
      </div>

      <button onClick={saveConfig} style={{
        "margin-top": "40px", padding: "15px 40px", "font-size": "20px", 
        "background-color": "#007bff", color: "white", border: "none", 
        "border-radius": "8px", cursor: "pointer", "font-weight": "bold"
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