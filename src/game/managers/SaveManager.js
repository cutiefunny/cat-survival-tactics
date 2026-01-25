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

    // [Auto Save] 자동 저장 (기존 기능)
    static saveGame(data) {
        try {
            const saveData = {
                deviceId: this.getDeviceId(),
                timestamp: Date.now(),
                ...data
            };
            localStorage.setItem('tactics_save_data', JSON.stringify(saveData));
        } catch (e) { console.error("Auto Save Failed:", e); }
    }

    // [Auto Load] 자동 불러오기
    static loadGame() {
        try {
            const json = localStorage.getItem('tactics_save_data');
            if (json) return JSON.parse(json);
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
                console.log(`📂 Loaded from Slot ${slotIndex}`, data);
                return data;
            }
        } catch (e) { console.error("Slot Load Failed:", e); }
        return null;
    }

    // [Info] 모든 슬롯의 정보 가져오기 (UI용) - [수정됨]
    static getSlotInfo() {
        const info = [];
        for (let i = 0; i < 3; i++) {
            const json = localStorage.getItem(`tactics_save_slot_${i}`);
            if (json) {
                try {
                    // [수정] 파싱 시도
                    const data = JSON.parse(json);
                    info.push({ index: i, name: data.saveName || 'Unknown', empty: false });
                } catch (e) {
                    // [수정] 파싱 실패(데이터 손상) 시 처리
                    console.error(`Slot ${i} corrupted:`, e);
                    // empty: true로 처리하여 덮어쓸 수 있게 함
                    info.push({ index: i, name: '(데이터 손상됨)', empty: true });
                }
            } else {
                info.push({ index: i, name: '빈 슬롯', empty: true });
            }
        }
        return info;
    }
}