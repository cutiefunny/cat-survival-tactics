import { UNIT_COSTS, ROLE_BASE_STATS, getRandomUnitName } from '../data/UnitData'; 

export default class ShopModal {
    constructor(scene, parentContainer) {
        this.scene = scene;
        this.parentContainer = parentContainer;
        this.container = null;
        this.unitDetailPopup = null;
        this.isOpen = false;

        this.roleToTexture = {
            'Tanker': 'tanker_token', 
            'Shooter': 'shooter_token', 
            'Healer': 'healer_token',
            'Raccoon': 'raccoon_token', 
            'Runner': 'runner_token', 
            'Normal': 'normal_token',
            'Leader': 'leader_token'
        };
    }

    toggle() {
        if (!this.container) {
            this.create();
        }
        this.isOpen = !this.isOpen;
        this.container.setVisible(this.isOpen);

        if (this.isOpen) {
            this.refreshSquadDisplay();
        } else {
            if (this.unitDetailPopup) {
                this.unitDetailPopup.destroy();
                this.unitDetailPopup = null;
            }
        }
    }

    create() {
        const { width, height } = this.scene.scale;
        this.container = this.scene.add.container(width / 2, height / 2).setDepth(2000);
        
        // [Modified] 부대원이 많아질 것을 대비해 팝업 높이를 80% -> 90%로 확대
        const popupW = Math.min(600, width * 0.95);
        const popupH = Math.min(600, height * 0.9);
        
        const bg = this.scene.add.rectangle(0, 0, popupW, popupH, 0x222222).setStrokeStyle(4, 0xffcc00);
        const title = this.scene.add.text(0, -popupH / 2 + 30, "용병 고용", { fontSize: '24px', fontStyle: 'bold', fill: '#ffcc00' }).setOrigin(0.5);
        const closeBtn = this.scene.add.text(popupW / 2 - 30, -popupH / 2 + 30, "X", { fontSize: '24px', fill: '#ffffff' }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', () => this.toggle());

        this.container.add([bg, title, closeBtn]);

        this.createUnitButtons(popupW, popupH);
        this.createSquadInfo(popupW, popupH);

        this.parentContainer.add(this.container);
    }

    createUnitButtons(popupW, popupH) {
        const cols = 3;
        const gapX = 120;
        const gapY = 90; // [Modified] 상단 버튼 간격을 조금 좁혀 하단 공간 확보
        const startX = -((cols * gapX) / 2) + gapX / 2;
        // [Modified] 버튼 시작 위치를 위로 조금 올림
        const startY = -popupH / 2 + 90;

        const unlockedRoles = this.scene.registry.get('unlockedRoles') || ['Normal'];

        UNIT_COSTS.forEach((unit, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const x = startX + col * gapX;
            const y = startY + row * gapY;
            
            const btn = this.scene.add.container(x, y);
            const isUnlocked = unlockedRoles.includes(unit.role);

            if (isUnlocked) {
                const btnBg = this.scene.add.rectangle(0, 0, 100, 80, 0x444444).setInteractive();
                const textureKey = this.roleToTexture[unit.role] || 'leader_token';
                // [Check] 스프라이트 시트의 1번 프레임을 아이콘으로 사용
                const unitSprite = this.scene.add.sprite(0, -10, textureKey, 1).setDisplaySize(50, 50);
                const costTxt = this.scene.add.text(0, 25, `💰 ${unit.cost}`, { fontSize: '14px', color: '#ffff00' }).setOrigin(0.5);
                
                btn.add([btnBg, unitSprite, costTxt]);
                btnBg.on('pointerdown', () => this.openUnitDetailPopup(unit));
            } else {
                const btnBg = this.scene.add.rectangle(0, 0, 100, 80, 0x222222).setStrokeStyle(1, 0x555555);
                const lockText = this.scene.add.text(0, 0, "🔒\n???", { align: 'center', fontSize: '18px', color: '#555555', fontStyle: 'bold' }).setOrigin(0.5);
                btn.add([btnBg, lockText]);
            }
            this.container.add(btn);
        });
    }

    createSquadInfo(popupW, popupH) {
        // [Modified] 하단 부대원 목록 영역 위치 설정 (팝업 하단 기준에서 역산하여 공간 확보)
        // 약 3~4줄의 유닛이 들어갈 수 있도록 여유를 둠
        const squadInfoY = popupH / 2 - 160; 
        
        this.squadCountText = this.scene.add.text(0, squadInfoY, `현재 부대원: 0명`, { fontSize: '18px', color: '#aaaaaa' }).setOrigin(0.5);
        this.container.add(this.squadCountText);

        this.squadContainer = this.scene.add.container(0, squadInfoY + 40);
        this.container.add(this.squadContainer);
    }

    refreshSquadDisplay() {
        if (!this.squadContainer) return;
        this.squadContainer.removeAll(true);
        const squad = this.scene.registry.get('playerSquad') || [];
        this.squadCountText.setText(`현재 부대원: ${squad.length}명`);
        
        const iconSize = 40; 
        const gap = 8; 
        // [Modified] 한 줄에 10명 표시 (10명 초과시 다음 줄로 이동)
        const maxCols = 10; 

        // 전체 그리드의 너비 계산 (최대 10개 기준 중앙 정렬을 위함)
        const colsInRow = Math.min(squad.length, maxCols);
        const totalW = colsInRow * (iconSize + gap) - gap;
        const startX = -totalW / 2 + iconSize / 2;

        squad.forEach((member, index) => {
            const textureKey = this.roleToTexture[member.role] || 'leader_token';
            
            // [Modified] 행(row)과 열(col) 계산 로직
            const col = index % maxCols; 
            const row = Math.floor(index / maxCols);
            
            const x = startX + col * (iconSize + gap); 
            const y = row * (iconSize + gap); // 줄바꿈 적용
            
            const icon = this.scene.add.sprite(x, y, textureKey, 0);
            const isLeader = (member.role === 'Leader');
            const finalSize = isLeader ? iconSize * 1.1 : iconSize;
            
            icon.setDisplaySize(finalSize, finalSize);
            icon.setInteractive({ useHandCursor: true });
            
            icon.on('pointerdown', () => { this.openOwnedUnitDetailPopup(member, index); });
            
            this.squadContainer.add(icon);
        });
    }

    openUnitDetailPopup(unitConfig) {
        if (this.unitDetailPopup) this.unitDetailPopup.destroy();
        const { width, height } = this.scene.scale;
        const stats = ROLE_BASE_STATS[unitConfig.role] || ROLE_BASE_STATS['Normal'];

        this.unitDetailPopup = this.scene.add.container(width / 2, height / 2).setDepth(2100);
        const popupW = 300;
        const popupH = 380;

        const bg = this.scene.add.rectangle(0, 0, popupW, popupH, 0x111111, 0.95).setStrokeStyle(2, 0x888888);
        const titleText = this.scene.add.text(0, -popupH / 2 + 30, unitConfig.name, { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        const textureKey = this.roleToTexture[unitConfig.role] || 'leader_token';
        const unitImg = this.scene.add.sprite(0, -popupH / 2 + 80, textureKey, 0).setDisplaySize(60, 60);
        const descText = this.scene.add.text(0, -popupH / 2 + 130, unitConfig.desc || "...", { fontSize: '14px', color: '#cccccc', align: 'center', wordWrap: { width: popupW - 40 } }).setOrigin(0.5);

        this.unitDetailPopup.add([bg, titleText, unitImg, descText]);
        this.renderStats(this.unitDetailPopup, stats, unitConfig.role, popupW, popupH, -popupH/2 + 170);

        const buyBtnY = popupH / 2 - 50;
        const buyBtn = this.scene.add.container(0, buyBtnY);
        const buyBtnBg = this.scene.add.rectangle(0, 0, 140, 40, 0x00aa00).setInteractive();
        const buyBtnText = this.scene.add.text(0, 0, `구매 (${unitConfig.cost}냥)`, { fontSize: '18px', fontStyle: 'bold' }).setOrigin(0.5);
        
        buyBtn.add([buyBtnBg, buyBtnText]);
        buyBtnBg.on('pointerdown', () => this.buyUnit(unitConfig));
        
        const closeBtn = this.createCloseButton(popupW, popupH, () => {
            this.unitDetailPopup.destroy();
            this.unitDetailPopup = null;
        });

        this.unitDetailPopup.add([buyBtn, closeBtn]);
        this.parentContainer.add(this.unitDetailPopup);
    }

    openOwnedUnitDetailPopup(memberData, squadIndex) {
        if (this.unitDetailPopup) this.unitDetailPopup.destroy();
        const { width, height } = this.scene.scale;
        const role = memberData.role;
        
        let displayName = memberData.name;
        if (!displayName) {
            if (role === 'Leader') displayName = "김냐냐";
            else {
                const shopInfo = UNIT_COSTS.find(u => u.role === role) || { name: role };
                displayName = shopInfo.name;
            }
        }

        const shopInfo = UNIT_COSTS.find(u => u.role === role) || { name: role };
        const roleText = (displayName !== shopInfo.name) ? `(${shopInfo.name})` : '';

        const stats = ROLE_BASE_STATS[role] || ROLE_BASE_STATS['Normal'];

        this.unitDetailPopup = this.scene.add.container(width / 2, height / 2).setDepth(2100);
        const popupW = 300;
        const popupH = 450; 

        const bg = this.scene.add.rectangle(0, 0, popupW, popupH, 0x111111, 0.95).setStrokeStyle(2, 0x4488ff);
        
        const titleText = this.scene.add.text(0, -popupH / 2 + 30, displayName, { fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        
        if (roleText) {
            const subText = this.scene.add.text(0, -popupH / 2 + 60, roleText, { fontSize: '14px', color: '#aaaaaa' }).setOrigin(0.5);
            this.unitDetailPopup.add(subText);
        }

        const textureKey = this.roleToTexture[role] || 'leader_token';
        const unitImg = this.scene.add.sprite(0, -popupH / 2 + 100, textureKey, 0).setDisplaySize(60, 60);

        const level = memberData.level || 1;
        const xp = memberData.xp || 0;
        const reqXp = level * 100;
        const fatigue = memberData.fatigue || 0;
        const penaltyRatio = fatigue * 0.05;
        const multiplier = Math.max(0, 1 - penaltyRatio);
        
        const lvText = this.scene.add.text(0, -popupH/2 + 150, `Lv.${level}`, { fontSize: '24px', color: '#ffff00', fontStyle: 'bold' }).setOrigin(0.5);
        const xpText = this.scene.add.text(0, -popupH/2 + 175, `XP: ${xp} / ${reqXp}`, { fontSize: '14px', color: '#aaaaaa' }).setOrigin(0.5);
        const fatigueColor = fatigue > 0 ? '#ff5555' : '#55ff55';
        const fatigueText = this.scene.add.text(0, -popupH/2 + 200, `😓 피로도: ${fatigue} (스탯 -${(penaltyRatio*100).toFixed(0)}%)`, { fontSize: '15px', color: fatigueColor }).setOrigin(0.5);

        this.unitDetailPopup.add([bg, titleText, unitImg, lvText, xpText, fatigueText]);

        const computedStats = { ...stats };
        const levelBonusHp = (level - 1) * 10;
        const levelBonusAtk = (level - 1) * 1;
        
        computedStats.hp = Math.floor((stats.hp + levelBonusHp) * multiplier);
        computedStats.attackPower = Math.floor((stats.attackPower + levelBonusAtk) * multiplier);
        computedStats.moveSpeed = Math.floor(stats.moveSpeed * multiplier);
        if(stats.defense) computedStats.defense = Math.floor(stats.defense * multiplier);

        this.renderStats(this.unitDetailPopup, computedStats, role, popupW, popupH, -popupH/2 + 230, fatigue > 0);

        if (role !== 'Leader') {
            const dismissBtnY = popupH / 2 - 50;
            const dismissBtn = this.scene.add.container(0, dismissBtnY);
            const dismissBtnBg = this.scene.add.rectangle(0, 0, 140, 40, 0xaa0000).setInteractive();
            const dismissBtnText = this.scene.add.text(0, 0, `해고하기`, { fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
            
            dismissBtn.add([dismissBtnBg, dismissBtnText]);
            dismissBtnBg.on('pointerdown', () => this.dismissUnit(squadIndex));
            this.unitDetailPopup.add(dismissBtn);
        }

        const closeBtn = this.createCloseButton(popupW, popupH, () => {
            this.unitDetailPopup.destroy();
            this.unitDetailPopup = null;
        });

        this.unitDetailPopup.add(closeBtn);
        this.parentContainer.add(this.unitDetailPopup);
    }

    renderStats(container, stats, role, popupW, popupH, startY, isPenalty = false) {
        const statColor = isPenalty ? '#ff8888' : '#ffffff';
        const statStyle = { fontSize: '14px', color: statColor, wordWrap: { width: popupW - 80 } };
        const statsList = [`❤️ 체력: ${stats.hp}`, `⚔️ 공격력: ${stats.attackPower}`, `🦵 속도: ${stats.moveSpeed}`];
        
        if (role === 'Tanker') statsList.splice(2, 0, `🛡️ 방어력: ${stats.defense || 0}`);
        if (role === 'Healer') statsList[1] = `💖 치유량: ${stats.attackPower}`;
        
        let currentY = startY;
        statsList.forEach((text) => {
            const t = this.scene.add.text(-popupW / 2 + 40, currentY, text, statStyle);
            container.add(t);
            currentY += t.height + 5;
        });
    }

    createCloseButton(w, h, callback) {
        const closeBtn = this.scene.add.text(w / 2 - 20, -h / 2 + 20, "X", { fontSize: '20px', color: '#ff5555' }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', callback);
        return closeBtn;
    }

    buyUnit(unitConfig) {
        const currentCoins = this.scene.registry.get('playerCoins');
        if (currentCoins >= unitConfig.cost) {
            const newCoins = currentCoins - unitConfig.cost;
            this.scene.registry.set('playerCoins', newCoins);
            this.scene.updateCoinText(newCoins); 
            
            const squad = this.scene.registry.get('playerSquad');
            
            const randomName = getRandomUnitName(unitConfig.role);

            squad.push({ 
                role: unitConfig.role, 
                level: 1, 
                xp: 0,
                fatigue: 0,
                name: randomName
            });

            this.scene.registry.set('playerSquad', squad);
            
            console.log(`✨ 고용 완료: ${unitConfig.role} (이름: ${randomName})`);

            this.refreshSquadDisplay();
            this.scene.saveProgress();
            
            if (this.unitDetailPopup) {
                this.unitDetailPopup.destroy();
                this.unitDetailPopup = null;
            }
        } else {
            this.scene.cameras.main.shake(100, 0.01);
        }
    }

    dismissUnit(squadIndex) {
        const squad = this.scene.registry.get('playerSquad');
        if (squadIndex >= 0 && squadIndex < squad.length) {
            const dismissedUnit = squad[squadIndex];
            if (dismissedUnit.role === 'Leader') return;
            squad.splice(squadIndex, 1);
            this.scene.registry.set('playerSquad', squad);
            this.refreshSquadDisplay();
            this.scene.saveProgress();
            if (this.unitDetailPopup) {
                this.unitDetailPopup.destroy();
                this.unitDetailPopup = null;
            }
        }
    }
}