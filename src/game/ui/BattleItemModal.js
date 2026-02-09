import Phaser from 'phaser';
import daisoItems from '../data/Daiso.json';

export default class BattleItemModal {
    constructor(uiScene, battleScene) {
        this.scene = uiScene;       
        this.battleScene = battleScene; 
        this.container = null;
        this.isOpen = false;
        
        // 아이콘 매핑 (BattleScene에서 preload된 텍스처 키)
        this.iconMap = {
            'catnip': 'icon_catnip',
            'ciao': 'icon_ciao',
            'partyMix': 'icon_partyMix'
        };
    }

    toggle() {
        if (!this.container) {
            this.create();
        }
        this.isOpen = !this.isOpen;
        this.container.setVisible(this.isOpen);
        
        if (this.isOpen) {
            this.refreshList();
            // [Modified] pauseBattle 대신 slowMotionForModal 호출
            if (this.battleScene.slowMotionForModal) {
                this.battleScene.slowMotionForModal(true);
            }
        } else {
            // [Modified] 속도 원상 복구
            if (this.battleScene.slowMotionForModal) {
                this.battleScene.slowMotionForModal(false);
            }
        }
    }

    // ... create, refreshList, useItem methods (기존과 동일) ...
    create() {
        const { width, height } = this.scene.scale;
        this.container = this.scene.add.container(width / 2, height / 2).setVisible(false);
        const w = 400;
        const h = 500;
        const bg = this.scene.add.rectangle(0, 0, w, h, 0x000000, 0.9).setStrokeStyle(2, 0xffffff).setInteractive();
        const title = this.scene.add.text(0, -h/2 + 30, "🎒 보유 아이템", { fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        const closeBtn = this.scene.add.text(w/2 - 30, -h/2 + 30, "X", { fontSize: '24px', color: '#ff5555' }).setOrigin(0.5).setInteractive().on('pointerdown', () => this.toggle());
        this.itemListContainer = this.scene.add.container(0, -h/2 + 80);
        this.container.add([bg, title, closeBtn, this.itemListContainer]);
    }

    refreshList() {
        this.itemListContainer.removeAll(true);
        const inventory = this.battleScene.registry.get('playerInventory') || {};
        const ownedItems = Object.keys(inventory).filter(id => inventory[id] > 0);
        if (ownedItems.length === 0) {
            const emptyText = this.scene.add.text(0, 100, "사용 가능한 아이템이 없습니다.", { fontSize: '18px', color: '#aaaaaa' }).setOrigin(0.5);
            this.itemListContainer.add(emptyText);
            return;
        }
        ownedItems.forEach((itemId, index) => {
            const itemData = daisoItems.find(d => d.id === itemId);
            if (!itemData) return;
            const count = inventory[itemId];
            const y = index * 70;
            const itemGroup = this.scene.add.container(0, y);
            const btnBg = this.scene.add.rectangle(0, 0, 360, 60, 0x333333).setInteractive();
            const icon = this.scene.add.image(-160, 0, this.iconMap[itemData.icon]).setScale(0.5).setOrigin(0.5);
            const name = this.scene.add.text(-130, -10, itemData.name, { fontSize: '18px', color: '#ffffff' }).setOrigin(0, 0.5);
            const desc = this.scene.add.text(-130, 15, itemData.desc, { fontSize: '12px', color: '#aaaaaa' }).setOrigin(0, 0.5);
            const countText = this.scene.add.text(150, 0, `x${count}`, { fontSize: '20px', fontStyle: 'bold', color: '#ffff00' }).setOrigin(0.5);
            btnBg.on('pointerdown', () => this.useItem(itemId, itemData));
            itemGroup.add([btnBg, icon, name, desc, countText]);
            this.itemListContainer.add(itemGroup);
        });
    }

    useItem(itemId, itemData) {
        const inventory = this.battleScene.registry.get('playerInventory');
        if (inventory[itemId] > 0) {
            inventory[itemId]--;
            this.battleScene.registry.set('playerInventory', inventory);
            this.applyEffect(itemData);
            this.toggle(); 
        }
    }

    applyEffect(itemData) {
        const playerUnits = this.battleScene.blueTeam ? this.battleScene.blueTeam.getChildren() : [];
        let msg = "";

        if (itemData.type === 'battle_heal') {
            let healCount = 0;
            playerUnits.forEach(unit => {
                if (unit.active) {
                    const healAmount = itemData.value;
                    unit.hp = Math.min(unit.maxHp, unit.hp + healAmount);
                    if (unit.showEmote) unit.showEmote(`+${healAmount}💚`, '#00ff00');
                    if (unit.redrawHpBar) unit.redrawHpBar();
                    healCount++;
                }
            });
            msg = `💖 아군 ${healCount}명 회복! (+${itemData.value})`;
        } 
        else if (itemData.type === 'battle_buff') {
            playerUnits.forEach(unit => {
                if (unit.active) {
                    if (itemData.effect === 'defense') {
                        unit.defense = (unit.defense || 0) + itemData.value;
                        if (unit.showEmote) unit.showEmote(`🛡️Def+${itemData.value}`, '#aaaaff');
                        this.battleScene.time.delayedCall(itemData.duration, () => {
                            if(unit.active) {
                                unit.defense -= itemData.value;
                                if(unit.showEmote) unit.showEmote(`🛡️End`, '#cccccc');
                            }
                        });
                    }
                    else if (itemData.effect === 'attack_speed') {
                        if (!unit._baseAttackCooldown) {
                            unit._baseAttackCooldown = unit.attackCooldown;
                        }
                        
                        // 쿨타임 감소 (속도 증가)
                        unit.attackCooldown = unit._baseAttackCooldown / itemData.value;
                        
                        // [Fix] Unit 객체에 직접 틴트 적용 및 플래그 설정
                        unit.hasSpeedBuff = true; 
                        unit.setTint(0xff6666); 

                        if (unit.showEmote) unit.showEmote(`⚔️Spd UP!`, '#ffff00');

                        this.battleScene.time.delayedCall(itemData.duration, () => {
                            if (unit.active) {
                                unit.attackCooldown = unit._baseAttackCooldown; 
                                
                                // 플래그 해제 및 원래 색상 복구
                                unit.hasSpeedBuff = false; 
                                unit.resetVisuals(); 

                                if (unit.showEmote) unit.showEmote(`⚔️Spd End`, '#cccccc');
                            }
                        });
                    }
                }
            });
            
            if (itemData.effect === 'defense') msg = `🛡️ 방어력 증가! (+${itemData.value}, 10초)`;
            else if (itemData.effect === 'attack_speed') msg = `⚔️ 공격 속도 ${itemData.value}배 증가! (10초)`;
        }

        const { width, height } = this.scene.scale;
        const alertText = this.scene.add.text(width/2, height/3, msg, {
            fontSize: '32px', color: '#ffff00', stroke: '#000000', strokeThickness: 4, fontStyle: 'bold'
        }).setOrigin(0.5);

        this.scene.tweens.add({
            targets: alertText,
            y: height/3 - 50,
            alpha: 0,
            duration: 2000,
            onComplete: () => alertText.destroy()
        });
    }
}