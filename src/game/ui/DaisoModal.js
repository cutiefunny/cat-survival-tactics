import Phaser from 'phaser';
import daisoItems from '../data/Daiso.json'; // [New] 데이터 임포트

export default class DaisoModal {
    constructor(scene, parentContainer) {
        this.scene = scene;
        this.parentContainer = parentContainer;
        this.container = null;
        this.isOpen = false;
        this.items = daisoItems;
    }

    toggle() {
        if (!this.container) {
            this.create();
        }
        this.isOpen = !this.isOpen;
        this.container.setVisible(this.isOpen);
        
        if (this.isOpen) {
            this.updateCoinDisplay();
        }
    }

    create() {
        const { width, height } = this.scene.scale;
        this.container = this.scene.add.container(width / 2, height / 2).setDepth(2200).setVisible(false);
        
        const popupW = Math.min(500, width * 0.95);
        const popupH = Math.min(600, height * 0.85);
        
        // 배경 (다이소 시그니처 레드 포인트)
        const bg = this.scene.add.rectangle(0, 0, popupW, popupH, 0xffffff).setStrokeStyle(4, 0xda291c);
        
        // 헤더
        const headerBg = this.scene.add.rectangle(0, -popupH/2 + 40, popupW, 80, 0xda291c);
        const title = this.scene.add.text(0, -popupH/2 + 40, "DAISO (다이소)", { 
            fontSize: '32px', 
            fontStyle: 'bold', 
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        const closeBtn = this.scene.add.text(popupW/2 - 30, -popupH/2 + 40, "X", { 
            fontSize: '28px', 
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5).setInteractive();
        
        closeBtn.on('pointerdown', () => this.toggle());

        this.container.add([bg, headerBg, title, closeBtn]);

        // 아이템 리스트 생성
        this.createItems(popupW, popupH);
        
        // 하단 보유 코인 표시
        const coinBg = this.scene.add.rectangle(0, popupH/2 - 30, popupW, 50, 0xeeeeee);
        this.coinText = this.scene.add.text(0, popupH/2 - 30, '', { 
            fontSize: '20px', 
            color: '#000000',
            fontStyle: 'bold' 
        }).setOrigin(0.5);
        
        this.container.add([coinBg, this.coinText]);

        this.parentContainer.add(this.container);
    }

    createItems(w, h) {
        const startY = -h/2 + 130;
        const gap = 120;

        this.items.forEach((item, index) => {
            const y = startY + index * gap;
            const itemContainer = this.scene.add.container(0, y);
            
            // 아이템 배경
            const itemBg = this.scene.add.rectangle(0, 0, w - 40, 100, 0xffffff).setStrokeStyle(1, 0xcccccc);
            itemBg.setInteractive(); 
            
            // 아이콘
            const iconBg = this.scene.add.circle(-w/2 + 70, 0, 35, 0xf0f0f0);
            const icon = this.scene.add.text(-w/2 + 70, 0, item.icon, { fontSize: '40px' }).setOrigin(0.5);
            
            // 텍스트 정보
            const name = this.scene.add.text(-w/2 + 120, -25, item.name, { fontSize: '22px', color: '#000', fontStyle: 'bold' }).setOrigin(0, 0.5);
            const desc = this.scene.add.text(-w/2 + 120, 15, item.desc, { fontSize: '14px', color: '#666', wordWrap: { width: w - 260 } }).setOrigin(0, 0);
            
            // 구매 버튼
            const btnX = w/2 - 80;
            const btnBg = this.scene.add.rectangle(btnX, 0, 120, 50, 0xda291c).setInteractive({ useHandCursor: true });
            const btnText = this.scene.add.text(btnX, 0, `구매\n💰${item.cost}`, { fontSize: '16px', align: 'center', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
            
            btnBg.on('pointerdown', () => {
                this.scene.tweens.add({ targets: [btnBg, btnText], scale: 0.95, duration: 50, yoyo: true });
                this.buyItem(item);
            });

            itemContainer.add([itemBg, iconBg, icon, name, desc, btnBg, btnText]);
            this.container.add(itemContainer);
        });
    }

    updateCoinDisplay() {
        const coins = this.scene.registry.get('playerCoins') || 0;
        if(this.coinText) this.coinText.setText(`보유 금액: ${coins}냥`);
    }

    buyItem(item) {
        const coins = this.scene.registry.get('playerCoins') || 0;
        if (coins < item.cost) {
            this.scene.cameras.main.shake(100, 0.01);
            this.scene.uiManager.showFloatingText(this.scene.scale.width/2, this.scene.scale.height/2, "돈이 부족합니다!", "#ff0000");
            return;
        }

        // 코인 차감
        const newCoins = coins - item.cost;
        this.scene.registry.set('playerCoins', newCoins);
        this.scene.uiManager.updateCoinText(newCoins);
        this.updateCoinDisplay();

        // [Modified] 효과 즉시 적용 대신 인벤토리에 추가
        this.addToInventory(item);
        
        this.scene.saveProgress();
    }

    addToInventory(item) {
        // 인벤토리 가져오기 (없으면 빈 객체)
        const inventory = this.scene.registry.get('playerInventory') || {};
        
        // 아이템 수량 증가
        if (!inventory[item.id]) {
            inventory[item.id] = 0;
        }
        inventory[item.id]++;
        
        // 레지스트리 업데이트
        this.scene.registry.set('playerInventory', inventory);

        // UI 피드백
        this.scene.uiManager.setStatusText(`📦 [${item.name}] 구매 완료! (보유: ${inventory[item.id]}개)`);
        this.scene.uiManager.showFloatingText(this.scene.scale.width/2, this.scene.scale.height/2 - 50, "+1 인벤토리", "#00ff00");
        this.scene.cameras.main.flash(100, 255, 255, 255);
        
        console.log(`Inventory Updated:`, inventory);
    }

    applyItemEffect(item) {
        const squad = this.scene.registry.get('playerSquad');
        
        if (item.type === 'fatigue') {
            let recovered = 0;
            squad.forEach(unit => {
                if (unit.fatigue > 0) recovered++;
                unit.fatigue = Math.max(0, (unit.fatigue || 0) - item.value);
            });
            this.scene.registry.set('playerSquad', squad);
            this.scene.uiManager.setStatusText(`🧊 시원하다! ${recovered}명의 피로도가 회복되었습니다.`);
            this.scene.cameras.main.flash(200, 0, 200, 255);
            
        } else if (item.type === 'fatigue_full') {
            squad.forEach(unit => {
                unit.fatigue = 0;
            });
            this.scene.registry.set('playerSquad', squad);
            this.scene.uiManager.setStatusText(`🥫 기력 보충 완료! 모든 대원의 피로도가 사라졌습니다.`);
            this.scene.cameras.main.flash(300, 255, 200, 0);
            
        } else if (item.type === 'random_coin') {
            const reward = Phaser.Math.Between(10, 100);
            const currentCoins = this.scene.registry.get('playerCoins');
            const finalCoins = currentCoins + reward;
            
            this.scene.registry.set('playerCoins', finalCoins);
            this.scene.uiManager.updateCoinText(finalCoins);
            this.updateCoinDisplay();
            
            this.scene.uiManager.setStatusText(`🎁 대박! 랜덤박스에서 ${reward}냥이 나왔습니다!`);
            this.scene.uiManager.showFloatingText(this.scene.scale.width/2, this.scene.scale.height/2 - 100, `+${reward}냥`, "#ffff00");
            this.scene.cameras.main.flash(200, 255, 255, 255);
        }
    }
}