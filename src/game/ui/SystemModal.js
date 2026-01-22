import SaveManager from '../managers/SaveManager';

export default class SystemModal {
    constructor(scene, parentContainer) {
        this.scene = scene;
        this.parentContainer = parentContainer;
        this.container = null;
        this.slotModal = null;
        this.isOpen = false;
    }

    toggle() {
        if (!this.container) {
            this.create();
        }
        this.isOpen = !this.isOpen;
        this.container.setVisible(this.isOpen);
    }

    create() {
        const { width, height } = this.scene.scale;
        this.container = this.scene.add.container(width / 2, height / 2).setDepth(3000).setVisible(false);
        const modalW = 280;
        const modalH = 320;

        const bg = this.scene.add.rectangle(0, 0, modalW, modalH, 0x111111, 0.95).setStrokeStyle(3, 0xaaaaaa);
        const title = this.scene.add.text(0, -modalH / 2 + 30, "시스템 메뉴", { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        const closeBtn = this.scene.add.text(modalW / 2 - 25, -modalH / 2 + 25, "X", { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', () => this.toggle());

        this.container.add([bg, title, closeBtn]);
        this.createMenuButtons(modalH);
        this.parentContainer.add(this.container);
    }

    createMenuButtons(modalH) {
        const startY = -modalH / 2 + 80;
        const gap = 55;

        const buttons = [
            // { text: "🔑 로그인 (Device ID)", color: 0x444444, callback: () => this.showDeviceId() },
            { text: "✨ 새 게임", color: 0xcc4444, callback: () => this.resetGame() },
            { text: "💾 저장", color: 0x4444cc, callback: () => this.createSlotSelectionModal('save') },
            { text: "📂 불러오기", color: 0x448844, callback: () => this.createSlotSelectionModal('load') },
            { text: "📘 공략집", color: 0x884488, callback: () => window.open('https://musclecat-studio.com/document/캣틀필드', '_blank') }
        ];

        buttons.forEach((btn, i) => {
            const btnObj = this.createButton(0, startY + i * gap, btn.text, btn.color, btn.callback);
            this.container.add(btnObj);
        });
    }

    createButton(x, y, text, color, callback) {
        const btn = this.scene.add.container(x, y);
        const btnBg = this.scene.add.rectangle(0, 0, 200, 45, color).setInteractive();
        const btnTxt = this.scene.add.text(0, 0, text, { fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

        btnBg.on('pointerdown', () => {
            this.scene.tweens.add({
                targets: btn, scale: 0.95, duration: 50, yoyo: true,
                onComplete: callback
            });
        });
        btn.add([btnBg, btnTxt]);
        return btn;
    }

    showDeviceId() {
        const deviceId = SaveManager.getDeviceId();
        alert(`현재 기기 ID로 로그인 중입니다:\n${deviceId}\n(데이터는 자동 저장됩니다)`);
    }

    resetGame() {
        if (confirm("현재 진행 데이터를 모두 삭제하고 처음부터 시작하시겠습니까?")) {
            SaveManager.clearSave();
            window.location.reload();
        }
    }

    createSlotSelectionModal(mode) {
        this.container.setVisible(false);
        if (this.slotModal) this.slotModal.destroy();

        const { width, height } = this.scene.scale;
        this.slotModal = this.scene.add.container(width / 2, height / 2).setDepth(3100);
        const modalW = 300;
        const modalH = 400;

        const bg = this.scene.add.rectangle(0, 0, modalW, modalH, 0x111111, 0.98).setStrokeStyle(2, 0xffaa00);
        const titleText = mode === 'save' ? "슬롯에 저장" : "슬롯에서 불러오기";
        const title = this.scene.add.text(0, -modalH / 2 + 30, titleText, { fontSize: '22px', fontStyle: 'bold', color: '#ffaa00' }).setOrigin(0.5);
        const closeBtn = this.scene.add.text(modalW / 2 - 25, -modalH / 2 + 25, "X", { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setInteractive();
        
        closeBtn.on('pointerdown', () => {
            this.slotModal.destroy();
            this.slotModal = null;
            this.container.setVisible(true);
        });

        this.slotModal.add([bg, title, closeBtn]);
        this.createSlotButtons(modalH, mode);
        this.parentContainer.add(this.slotModal);
    }

    createSlotButtons(modalH, mode) {
        const slots = SaveManager.getSlotInfo();
        const startY = -modalH / 2 + 100;
        const gap = 80;

        slots.forEach((slot, i) => {
            const btnContainer = this.scene.add.container(0, startY + i * gap);
            const btnBg = this.scene.add.rectangle(0, 0, 240, 60, 0x333333).setInteractive();
            btnBg.setStrokeStyle(1, 0x666666);

            const slotLabel = this.scene.add.text(-110, -15, `SLOT ${i + 1}`, { fontSize: '14px', color: '#aaaaaa' });
            const slotName = this.scene.add.text(0, 5, slot.name, { fontSize: '18px', fontStyle: 'bold', color: slot.empty ? '#666666' : '#ffffff' }).setOrigin(0.5);

            btnContainer.add([btnBg, slotLabel, slotName]);
            btnBg.on('pointerdown', () => this.handleSlotAction(mode, i, slot));
            this.slotModal.add(btnContainer);
        });
    }

    handleSlotAction(mode, slotIndex, slotInfo) {
        if (mode === 'save') {
            const confirmMsg = slotInfo.empty ? `슬롯 ${slotIndex + 1}에 저장하시겠습니까?` : `슬롯 ${slotIndex + 1}의 데이터(${slotInfo.name})를 덮어쓰시겠습니까?`;
            if (confirm(confirmMsg)) {
                const data = this.scene.getCurrentGameData();
                SaveManager.saveToSlot(slotIndex, data);
                SaveManager.saveGame(data);
                this.closeSlotModal();
                this.scene.statusText.setText("💾 저장 완료!");
                this.scene.cameras.main.flash(200, 0, 255, 0);
            }
        } else if (mode === 'load') {
            if (slotInfo.empty) {
                alert("비어있는 슬롯입니다.");
                return;
            }
            if (confirm(`슬롯 ${slotIndex + 1} 데이터를 불러오시겠습니까?`)) {
                const data = SaveManager.loadFromSlot(slotIndex);
                if (data) {
                    // [Bugfix] 로드된 데이터를 씬 재시작 시 인자로 전달
                    console.log("📂 [SystemModal] Loading Data:", data);
                    SaveManager.saveGame(data); // 자동 저장도 갱신
                    this.closeSlotModal();
                    
                    // StrategyScene.js의 init(data)에서 manualLoadData를 처리하도록 전달
                    this.scene.scene.restart({ manualLoadData: data });
                } else {
                    alert("데이터를 불러오는데 실패했습니다.");
                }
            }
        }
    }

    closeSlotModal() {
        if (this.slotModal) {
            this.slotModal.destroy();
            this.slotModal = null;
        }
        // 불러오기 후에는 모달을 다시 보일 필요가 없으므로 visible 처리 주의
        // 여기서는 저장/취소 시를 위해 기본적으로 보이게 하되, 
        // load 성공 시에는 scene restart가 일어나므로 이 줄은 실행되더라도 씬이 넘어가서 문제 없음
        this.container.setVisible(true);
    }
}