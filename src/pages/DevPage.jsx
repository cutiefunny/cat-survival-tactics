// src/pages/DevPage.jsx
import { createSignal, onMount, For } from "solid-js";
import { createStore } from "solid-js/store";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

export default function DevPage() {
  const [loading, setLoading] = createSignal(false);
  const [msg, setMsg] = createSignal("");

  const defaultData = {
    gameSettings: { unitCount: 5, spawnGap: 100, startY: 300 },
    // [NEW] AI 설정 추가
    aiSettings: {
        common: { thinkTimeMin: 150, thinkTimeVar: 100 },
        runner: { ambushDistance: 60, fleeDuration: 1500 },
        dealer: { safeDistance: 150, followDistance: 50 }
    },
    redTeamStats: { hp: 140, attackPower: 15, moveSpeed: 70 },
    blueTeamRoles: [
      { role: "Leader", hp: 200, attackPower: 25, moveSpeed: 90 },
      { role: "Runner", hp: 100, attackPower: 12, moveSpeed: 140 },
      { role: "Dealer", hp: 90, attackPower: 40, moveSpeed: 70 },
      { role: "Tanker", hp: 400, attackPower: 10, moveSpeed: 40 },
      { role: "Normal", hp: 140, attackPower: 15, moveSpeed: 70 }
    ]
  };

  const [config, setConfig] = createStore(JSON.parse(JSON.stringify(defaultData)));
  const docRef = doc(db, "settings", "tacticsConfig");

  const loadData = async () => {
    setLoading(true);
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        // DB에 새 필드가 없을 경우 대비해 병합
        if(!data.aiSettings) data.aiSettings = defaultData.aiSettings;
        setConfig(data);
        setMsg("✅ 데이터 로드 완료");
      } else {
        setConfig(defaultData);
      }
    } catch (e) { console.error(e); setMsg("❌ 로드 실패: " + e.message); }
    setLoading(false);
  };

  const saveData = async () => {
    setLoading(true);
    try {
      await setDoc(docRef, JSON.parse(JSON.stringify(config)));
      setMsg("💾 저장 성공! 게임을 새로고침하세요.");
    } catch (e) { console.error(e); setMsg("❌ 저장 실패: " + e.message); }
    setLoading(false);
  };

  onMount(() => loadData());

  const styles = {
    container: { padding: "20px", background: "#1a1a1a", color: "#fff", height: "100vh", overflowY: "auto", boxSizing: "border-box", fontFamily: "monospace" },
    section: { background: "#2a2a2a", padding: "15px", marginBottom: "20px", borderRadius: "8px", border: "1px solid #444" },
    h2: { color: "#ffcc00", marginTop: 0 },
    label: { display: "block", marginBottom: "5px", color: "#aaa" },
    input: { background: "#333", border: "1px solid #555", color: "#fff", padding: "5px", width: "80px", marginRight: "10px" },
    row: { display: "flex", gap: "10px", marginBottom: "10px", alignItems: "center" },
    btn: { padding: "10px 20px", fontSize: "16px", cursor: "pointer", background: "#4CAF50", color: "white", border: "none", borderRadius: "4px" },
    msg: { marginLeft: "10px", fontWeight: "bold" }
  };

  return (
    <div style={styles.container}>
      <h1 style={{color: '#4488ff'}}>🛠️ 개발자 설정 (Tactics Config)</h1>
      <div style={{ marginBottom: '20px' }}>
        <button style={styles.btn} onClick={saveData} disabled={loading()}>{loading() ? "처리중..." : "Firestore에 저장"}</button>
        <button style={{...styles.btn, background: '#555', marginLeft: '10px'}} onClick={loadData}>새로고침</button>
        <span style={styles.msg}>{msg()}</span>
      </div>

      {/* 1. 게임 환경 */}
      <div style={styles.section}>
        <h2 style={styles.h2}>⚙️ 게임 환경</h2>
        <div style={styles.row}>
          <div><span style={styles.label}>유닛 수</span><input type="number" style={styles.input} value={config.gameSettings.unitCount} onInput={(e) => setConfig('gameSettings', 'unitCount', parseInt(e.target.value))} /></div>
          <div><span style={styles.label}>스폰 간격</span><input type="number" style={styles.input} value={config.gameSettings.spawnGap} onInput={(e) => setConfig('gameSettings', 'spawnGap', parseInt(e.target.value))} /></div>
        </div>
      </div>

      {/* 2. AI 행동 설정 (NEW) */}
      <div style={styles.section}>
        <h2 style={{...styles.h2, color: '#00ffaa'}}>🤖 AI 행동 설정 (Behavior)</h2>
        <div style={styles.row}>
            <div><span style={styles.label}>반응 최소(ms)</span><input type="number" style={styles.input} value={config.aiSettings.common.thinkTimeMin} onInput={(e) => setConfig('aiSettings', 'common', 'thinkTimeMin', parseInt(e.target.value))} /></div>
            <div><span style={styles.label}>반응 변수(ms)</span><input type="number" style={styles.input} value={config.aiSettings.common.thinkTimeVar} onInput={(e) => setConfig('aiSettings', 'common', 'thinkTimeVar', parseInt(e.target.value))} /></div>
        </div>
        <div style={styles.row}>
            <strong style={{color:'#aaa', marginRight:'10px'}}>러너(Runner):</strong>
            <div><span style={styles.label}>암살 거리</span><input type="number" style={styles.input} value={config.aiSettings.runner.ambushDistance} onInput={(e) => setConfig('aiSettings', 'runner', 'ambushDistance', parseInt(e.target.value))} /></div>
            <div><span style={styles.label}>도망 시간(ms)</span><input type="number" style={styles.input} value={config.aiSettings.runner.fleeDuration} onInput={(e) => setConfig('aiSettings', 'runner', 'fleeDuration', parseInt(e.target.value))} /></div>
        </div>
        <div style={styles.row}>
            <strong style={{color:'#aaa', marginRight:'10px'}}>딜러(Dealer):</strong>
            <div><span style={styles.label}>안전 거리</span><input type="number" style={styles.input} value={config.aiSettings.dealer.safeDistance} onInput={(e) => setConfig('aiSettings', 'dealer', 'safeDistance', parseInt(e.target.value))} /></div>
            <div><span style={styles.label}>탱커 호위거리</span><input type="number" style={styles.input} value={config.aiSettings.dealer.followDistance} onInput={(e) => setConfig('aiSettings', 'dealer', 'followDistance', parseInt(e.target.value))} /></div>
        </div>
      </div>

      {/* 3. 빨간팀 설정 */}
      <div style={styles.section}>
        <h2 style={{...styles.h2, color: '#ff4444'}}>🐶 빨간팀 (Common)</h2>
        <div style={styles.row}>
          <div><span style={styles.label}>HP</span><input type="number" style={styles.input} value={config.redTeamStats.hp} onInput={(e) => setConfig('redTeamStats', 'hp', parseInt(e.target.value))} /></div>
          <div><span style={styles.label}>ATK</span><input type="number" style={styles.input} value={config.redTeamStats.attackPower} onInput={(e) => setConfig('redTeamStats', 'attackPower', parseInt(e.target.value))} /></div>
          <div><span style={styles.label}>SPD</span><input type="number" style={styles.input} value={config.redTeamStats.moveSpeed} onInput={(e) => setConfig('redTeamStats', 'moveSpeed', parseInt(e.target.value))} /></div>
        </div>
      </div>

      {/* 4. 파란팀 설정 */}
      <div style={styles.section}>
        <h2 style={{...styles.h2, color: '#4488ff'}}>🐱 파란팀 (Roles)</h2>
        <For each={config.blueTeamRoles}>
          {(roleData, index) => (
            <div style={{...styles.row, borderBottom: '1px dashed #444', paddingBottom: '10px'}}>
              <div style={{width: '100px', fontWeight: 'bold', color: index() === 0 ? '#ffff00' : '#ddd'}}>{roleData.role}</div>
              <div><span style={styles.label}>HP</span><input type="number" style={styles.input} value={roleData.hp} onInput={(e) => setConfig('blueTeamRoles', index(), 'hp', parseInt(e.target.value))} /></div>
              <div><span style={styles.label}>ATK</span><input type="number" style={styles.input} value={roleData.attackPower} onInput={(e) => setConfig('blueTeamRoles', index(), 'attackPower', parseInt(e.target.value))} /></div>
              <div><span style={styles.label}>SPD</span><input type="number" style={styles.input} value={roleData.moveSpeed} onInput={(e) => setConfig('blueTeamRoles', index(), 'moveSpeed', parseInt(e.target.value))} /></div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}