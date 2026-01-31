export default class SaveManager {
    static getDeviceId() {
        let deviceId = localStorage.getItem('tactics_device_id');
        if (!deviceId) {
            deviceId = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            localStorage.setItem('tactics_device_id', deviceId);
        }
        return deviceId;
    }

    // 날짜 포맷팅 (YYYYMMDD HH:mm)
    static getFormattedDate() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        return `${yyyy}${mm}${dd} ${hh}:${min}`;
    }

    // [New] 현재 스크립트 재생 기록 수집 헬퍼
    static _collectScriptHistory() {
        const history = {};
        const length = localStorage.length;
        for (let i = 0; i < length; i++) {
            const key = localStorage.key(i);
            // 스크립트 및 튜토리얼 재생 기록 키만 수집
            if (key && (key.startsWith('map_script_played_') || key.startsWith('tutorial_played_'))) {
                history[key] = localStorage.getItem(key);
            }
        }
        return history;
    }

    // [New] 스크립트 재생 기록 복원 헬퍼
    static _restoreScriptHistory(historyData) {
        // 1. 현재 로컬 스토리지의 스크립트 기록 초기화 (과거 시점으로 되돌리기 위해)
        const keysToRemove = [];
        const length = localStorage.length;
        for (let i = 0; i < length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('map_script_played_') || key.startsWith('tutorial_played_'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));

        // 2. 저장된 기록 복원
        if (historyData) {
            Object.entries(historyData).forEach(([key, value]) => {
                localStorage.setItem(key, value);
            });
            console.log(`📜 Script history restored (${Object.keys(historyData).length} entries).`);
        } else {
            console.log("📜 Script history reset (No history in save).");
        }
    }

    // [Auto Save] 자동 저장 (기존 기능)
    static saveGame(data) {
        try {
            const saveData = {
                deviceId: this.getDeviceId(),
                timestamp: Date.now(),
                scriptHistory: this._collectScriptHistory(), // [Added] 스크립트 내역 저장
                ...data
            };
            localStorage.setItem('tactics_save_data', JSON.stringify(saveData));
        } catch (e) { console.error("Auto Save Failed:", e); }
    }

    // [Auto Load] 자동 불러오기
    static loadGame() {
        try {
            const json = localStorage.getItem('tactics_save_data');
            if (json) {
                const data = JSON.parse(json);
                this._restoreScriptHistory(data.scriptHistory); // [Added] 스크립트 내역 복원
                return data;
            }
        } catch (e) { console.error("Auto Load Failed:", e); }
        return null;
    }

    static clearSave() {
        localStorage.removeItem('tactics_save_data');
    }

    // [Manual] 특정 슬롯(0, 1, 2)에 저장
    static saveToSlot(slotIndex, data) {
        try {
            const saveName = this.getFormattedDate();
            const saveData = {
                deviceId: this.getDeviceId(),
                saveName: saveName, // UI 표시용 이름
                timestamp: Date.now(),
                scriptHistory: this._collectScriptHistory(), // [Added] 스크립트 내역 저장
                ...data
            };
            localStorage.setItem(`tactics_save_slot_${slotIndex}`, JSON.stringify(saveData));
            console.log(`💾 Saved to Slot ${slotIndex}: ${saveName}`, data);
            return saveName;
        } catch (e) { console.error("Slot Save Failed:", e); return null; }
    }

    // [Manual] 특정 슬롯 데이터 불러오기
    static loadFromSlot(slotIndex) {
        try {
            const json = localStorage.getItem(`tactics_save_slot_${slotIndex}`);
            if (json) {
                const data = JSON.parse(json);
                this._restoreScriptHistory(data.scriptHistory); // [Added] 스크립트 내역 복원
                console.log(`📂 Loaded from Slot ${slotIndex}`, data);
                return data;
            }
        } catch (e) { console.error("Slot Load Failed:", e); }
        return null;
    }

    // [Info] 모든 슬롯의 정보 가져오기 (UI용)
    static getSlotInfo() {
        const info = [];
        for (let i = 0; i < 3; i++) {
            const json = localStorage.getItem(`tactics_save_slot_${i}`);
            if (json) {
                try {
                    const data = JSON.parse(json);
                    info.push({ index: i, name: data.saveName || 'Unknown', empty: false });
                } catch (e) {
                    console.error(`Slot ${i} corrupted:`, e);
                    info.push({ index: i, name: '(데이터 손상됨)', empty: true });
                }
            } else {
                info.push({ index: i, name: '빈 슬롯', empty: true });
            }
        }
        return info;
    }
}