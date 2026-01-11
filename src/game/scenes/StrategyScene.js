import BaseScene from './BaseScene'; 
import Phaser from 'phaser';
import sangsuMap from '../../assets/maps/sangsu_map.json'; 
import territoryConfig from '../data/TerritoryConfig.json'; 
import { LEVEL_KEYS } from '../managers/LevelManager'; 
import leaderImg from '../../assets/units/leader.png';
import dogImg from '../../assets/units/dog.png';
import runnerImg from '../../assets/units/runner.png'; 
import tankerImg from '../../assets/units/tanker.png';
import shooterImg from '../../assets/units/shooter.png';
import healerImg from '../../assets/units/healer.png';
import raccoonImg from '../../assets/units/raccoon.png';

import sangsuTilesImg from '../../assets/tilesets/sangsu_map.jpg';
import openingBgm from '../../assets/sounds/opening.mp3';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { ROLE_BASE_STATS } from '../data/UnitData';

const UNIT_COSTS = [
    { role: 'Tanker', name: '탱커', cost: 10, desc: "높은 체력과 방어력으로 아군을 보호합니다." },
    { role: 'Shooter', name: '슈터', cost: 20, desc: "긴 사거리로 멀리서 적을 제압합니다." },
    { role: 'Healer', name: '힐러', cost: 25, desc: "근처 아군의 체력을 회복시킵니다." },
    { role: 'Raccoon', name: '너구리', cost: 10, desc: "빠른 공격 속도로 적을 괴롭힙니다." },
    { role: 'Runner', name: '러너', cost: 10, desc: "매우 빠른 이동 속도로 전장을 누빕니다." },
    { role: 'Normal', name: '일반냥', cost: 5, desc: "가장 기본이 되는 병사입니다." }
];

export default class StrategyScene extends BaseScene {
    constructor() {
        super('StrategyScene'); 
    }

    init(data) {
        if (data && data.battleResult) {
            this.battleResultData = data.battleResult;
        }
        
        // [Modified] 초기 부대원 설정 시 레벨/경험치 데이터 추가
        if (!this.registry.get('playerSquad')) {
            this.registry.set('playerSquad', [{ role: 'Leader', level: 1, xp: 0 }]);
        }
        
        if (this.registry.get('playerCoins') === undefined) {
            this.registry.set('playerCoins', 50); 
        }

        if (!this.registry.get('unlockedRoles')) {
            this.registry.set('unlockedRoles', ['Normal']); 
        }
    }

    preload() {
        this.load.tilemapTiledJSON('strategy_map', sangsuMap);
        this.load.image('sangsu_tiles', sangsuTilesImg);
        
        this.load.spritesheet('leader_token', leaderImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('dog_token', dogImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('runner_token', runnerImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('tanker_token', tankerImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('shooter_token', shooterImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('healer_token', healerImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('raccoon_token', raccoonImg, { frameWidth: 100, frameHeight: 100 });

        this.load.audio('opening_bgm', openingBgm);
    }

    create() {
        super.create(); 

        this.scene.stop('UIScene');
        this.cameras.main.setBackgroundColor('#111');

        this.input.addPointer(1);
        this.createAnimations();

        const map = this.make.tilemap({ key: 'strategy_map' });
        const tilesetName = map.tilesets[0].name;
        const tileset = map.addTilesetImage(tilesetName, 'sangsu_tiles');

        if (tileset) {
            map.layers.forEach(layerData => {
                const layer = map.createLayer(layerData.name, tileset, 0, 0);
                if (layer) layer.setDepth(0);
            });
        }

        this.fetchStrategyConfig(map);
    }

    async fetchStrategyConfig(map) {
        let armyData = {};
        try {
            const docRef = doc(db, "settings", "tacticsConfig");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.territoryArmies) {
                    armyData = data.territoryArmies;
                }
            }
        } catch (e) {
            console.error("❌ Failed to load strategy config:", e);
        }
        this.initializeGameWorld(map, armyData);
    }

    initializeGameWorld(map, dbArmyData) {
        this.hasMoved = false;
        this.previousLeaderId = null;
        this.selectedTargetId = null; 
        this.isShopOpen = false; 

        this.playBgm('opening_bgm', 0.5);

        this.parseMapData(map, dbArmyData);
        this.mapNodes = this.registry.get('worldMapData');

        let battleResultMessage = null;
        if (this.battleResultData) {
            const { targetNodeId, isWin, remainingCoins } = this.battleResultData;
            this.registry.set('playerCoins', remainingCoins);

            if (isWin) {
                const node = this.mapNodes.find(n => n.id === targetNodeId);
                if (node) {
                    node.owner = 'player';
                    node.army = null; 
                    this.registry.set('worldMapData', this.mapNodes);
                    this.registry.set('leaderPosition', targetNodeId);
                }
                battleResultMessage = "🏆 승리! 영토를 점령했습니다!";
                
                this.handleStoryUnlocks(targetNodeId);
            } else {
                const lastSafeId = this.registry.get('lastSafeNodeId');
                if (lastSafeId) {
                    this.registry.set('leaderPosition', lastSafeId);
                    const safeNode = this.mapNodes.find(n => n.id === lastSafeId);
                    const retreatName = safeNode ? safeNode.name : "본부";
                    battleResultMessage = `🏳️ 패배... ${retreatName}(으)로 후퇴합니다.`;
                } else {
                    const base = this.mapNodes.find(n => n.owner === 'player') || this.mapNodes[0];
                    if (base) this.registry.set('leaderPosition', base.id);
                    battleResultMessage = "🏳️ 패배... 본부로 후퇴합니다.";
                }
            }
            this.battleResultData = null;
        }

        this.graphicsLayer = this.add.graphics();
        this.graphicsLayer.setDepth(100); 

        this.drawConnections();
        this.createTerritoryNodes();
        this.createEnemyTokens();
        this.createPlayerToken();

        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        this.uiCamera.ignore(this.children.list);
        
        this.createUI(); 
        
        if (battleResultMessage) {
            this.statusText.setText(battleResultMessage);
        }
        
        this.updateUIState();

        this.cameras.main.ignore(this.uiContainer);

        this.mapWidth = map.widthInPixels;
        this.mapHeight = map.heightInPixels;
        this.updateCameraLayout();

        this.setupCameraControls();
        this.prevPinchDistance = 0;
    }

    handleStoryUnlocks(conqueredNodeId) {
        // 예시: 특정 노드 정복 시 유닛 해금 로직
    }

    unlockUnit(roleName) {
        const unlocked = this.registry.get('unlockedRoles') || [];
        if (!unlocked.includes(roleName)) {
            unlocked.push(roleName);
            this.registry.set('unlockedRoles', unlocked);
            this.statusText.setText(`🎉 새로운 동료 해금: ${roleName}!`);
            this.cameras.main.flash(500, 255, 255, 0); 
        }
    }

    handleResize(gameSize) {
        this.updateCameraLayout();
        this.resizeUI();
    }

    createStyledButton(x, y, text, color, onClick) {
        const btnContainer = this.add.container(x, y);
        const shadow = this.add.rectangle(4, 4, 160, 50, 0x000000, 0.5).setOrigin(0.5);
        const bg = this.add.rectangle(0, 0, 160, 50, color).setOrigin(0.5);
        bg.setStrokeStyle(2, 0xffffff, 0.8);
        const btnText = this.add.text(0, 0, text, { fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        const hitArea = this.add.rectangle(0, 0, 160, 50, 0x000000, 0).setOrigin(0.5).setInteractive({ useHandCursor: true });
        
        hitArea.on('pointerdown', () => {
            this.tweens.add({ targets: btnContainer, scale: 0.95, duration: 50, yoyo: true, onComplete: onClick });
        });
        hitArea.on('pointerover', () => { bg.setStrokeStyle(3, 0xffff00, 1); });
        hitArea.on('pointerout', () => { bg.setStrokeStyle(2, 0xffffff, 0.8); });

        btnContainer.add([shadow, bg, btnText, hitArea]);
        return { container: btnContainer, textObj: btnText, bgObj: bg };
    }

    createUI() {
        this.uiContainer = this.add.container(0, 0);
        this.uiContainer.setScrollFactor(0); 
        this.drawUIElements();
        this.createShopPopup(); 
    }

    drawUIElements() {
        if (this.uiContainer.list.length > 0) {
            this.uiContainer.removeAll(true);
        }

        const w = this.scale.width;
        const h = this.scale.height;
        const isMobile = w < 600; 
        const topBarH = isMobile ? 60 : 50;
        const fontSize = isMobile ? '13px' : '16px'; 

        const topBarBg = this.add.rectangle(0, 0, w, topBarH, 0x000000, 0.6).setOrigin(0, 0);
        const coins = this.registry.get('playerCoins');
        this.coinText = this.add.text(isMobile ? 10 : 20, topBarH/2, `💰 ${coins}냥`, { fontSize: isMobile ? '16px' : '18px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0, 0.5);
        this.bgmBtn = this.add.text(w - (isMobile ? 15 : 30), topBarH/2, "🔊", { fontSize: isMobile ? '20px' : '24px' }).setOrigin(1, 0.5).setInteractive();
        this.bgmBtn.on('pointerdown', () => {
            const isMuted = this.toggleBgmMute();
            this.bgmBtn.setText(isMuted ? "🔇" : "🔊");
        });

        const currentStatusMsg = (this.statusText && this.statusText.active) ? this.statusText.text : '이동할 영토를 선택하세요.';
        const safeTextWidth = w - (isMobile ? 160 : 240); 
        this.statusText = this.add.text(w / 2, topBarH/2, currentStatusMsg, { fontSize: fontSize, color: '#ffffff', align: 'center', wordWrap: { width: safeTextWidth, useAdvancedWrap: true } }).setOrigin(0.5, 0.5);

        const btnMargin = isMobile ? 50 : 60;
        this.endTurnBtnObj = this.createStyledButton(w - (isMobile ? 85 : 100), h - btnMargin, '턴 종료', 0xcc0000, () => {
            if (this.selectedTargetId !== null) this.startBattle();
            else this.handleTurnEnd();
        });
        
        this.shopBtnObj = this.createStyledButton(isMobile ? 85 : 100, h - btnMargin, '🏰 부대편성', 0x444444, () => this.toggleShop());
        this.undoBtnObj = this.createStyledButton(w / 2, h - (btnMargin + 20), '이동 취소', 0x666666, () => this.undoMove());
        this.undoBtnObj.container.setVisible(false);

        if (isMobile) {
            this.endTurnBtnObj.container.setScale(0.85);
            this.shopBtnObj.container.setScale(0.85);
            this.undoBtnObj.container.setScale(0.85);
        }

        this.uiContainer.add([topBarBg, this.coinText, this.bgmBtn, this.statusText]);
        this.uiContainer.add([this.shopBtnObj.container, this.endTurnBtnObj.container, this.undoBtnObj.container]);
        this.updateUIState();
        this.createShopPopup(); 
    }

    createShopPopup() {
        if (this.shopPopup) this.shopPopup.destroy(); 

        const { width, height } = this.scale;
        this.shopPopup = this.add.container(width/2, height/2).setDepth(2000).setVisible(false);
        
        const popupW = Math.min(600, width * 0.95);
        const popupH = Math.min(450, height * 0.8);
        const bg = this.add.rectangle(0, 0, popupW, popupH, 0x222222).setStrokeStyle(4, 0xffcc00);
        const title = this.add.text(0, -popupH/2 + 30, "용병 고용\n", { fontSize: '24px', fontStyle: 'bold', fill: '#ffcc00' }).setOrigin(0.5);
        const closeBtn = this.add.text(popupW/2 - 30, -popupH/2 + 30, "X", { fontSize: '24px', fill: '#ffffff' }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', () => this.toggleShop());

        this.shopPopup.add([bg, title, closeBtn]);

        this.roleToTexture = {
            'Tanker': 'tanker_token',
            'Shooter': 'shooter_token',
            'Healer': 'healer_token',
            'Raccoon': 'raccoon_token',
            'Runner': 'runner_token',
            'Normal': 'leader_token', 
            'Leader': 'leader_token'
        };

        const cols = 3;
        const gapX = 120;
        const gapY = 100;
        const totalWidth = cols * gapX;
        const startX = -totalWidth / 2 + gapX / 2;
        const startY = -popupH/2 + 80;

        const unlockedRoles = this.registry.get('unlockedRoles') || ['Normal'];

        UNIT_COSTS.forEach((unit, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const x = startX + col * gapX;
            const y = startY + row * gapY;
            const btn = this.add.container(x, y);
            const isUnlocked = unlockedRoles.includes(unit.role);

            if (isUnlocked) {
                const btnBg = this.add.rectangle(0, 0, 100, 80, 0x444444).setInteractive();
                const textureKey = this.roleToTexture[unit.role] || 'leader_token';
                const unitSprite = this.add.sprite(0, -10, textureKey, 1);
                unitSprite.setDisplaySize(50, 50);
                const costTxt = this.add.text(0, 25, `💰 ${unit.cost}`, { fontSize: '14px', color: '#ffff00' }).setOrigin(0.5);
                btn.add([btnBg, unitSprite, costTxt]);
                btnBg.on('pointerdown', () => this.openUnitDetailPopup(unit));
            } else {
                const btnBg = this.add.rectangle(0, 0, 100, 80, 0x222222).setStrokeStyle(1, 0x555555);
                const lockText = this.add.text(0, 0, "🔒\n???", { align: 'center', fontSize: '18px', color: '#555555', fontStyle: 'bold' }).setOrigin(0.5);
                btn.add([btnBg, lockText]);
            }
            this.shopPopup.add(btn);
        });
        
        const squadInfoY = popupH/2 - 80; 
        this.squadCountText = this.add.text(0, squadInfoY, `현재 부대원: ${this.getSquadCount()}명`, { fontSize: '18px', color: '#aaaaaa' }).setOrigin(0.5);
        this.shopPopup.add(this.squadCountText);

        this.squadContainer = this.add.container(0, squadInfoY + 40);
        this.shopPopup.add(this.squadContainer);

        this.uiContainer.add(this.shopPopup);
    }

    // [New] 보유 유닛 정보 모달 (구매 버튼 없음, 레벨/XP 표시)
    openOwnedUnitDetailPopup(memberData) {
        if (this.unitDetailPopup) this.unitDetailPopup.destroy();

        const { width, height } = this.scale;
        const role = memberData.role;
        // UNIT_COSTS에 정보가 있으면 사용하고, 없으면(리더 등) 기본값 사용
        const shopInfo = UNIT_COSTS.find(u => u.role === role) || { 
            name: (role === 'Leader' ? '지휘관' : role), 
            desc: "나의 소중한 동료입니다." 
        };
        const stats = ROLE_BASE_STATS[role] || ROLE_BASE_STATS['Normal'];

        this.unitDetailPopup = this.add.container(width/2, height/2).setDepth(2100);
        
        const popupW = 300;
        const popupH = 400; // 높이 약간 증가
        const bg = this.add.rectangle(0, 0, popupW, popupH, 0x111111, 0.95).setStrokeStyle(2, 0x4488ff); // 파란색 테두리 (보유 중임을 표시)
        this.unitDetailPopup.add(bg);

        // 타이틀
        const titleText = this.add.text(0, -popupH/2 + 30, `${shopInfo.name}`, { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        this.unitDetailPopup.add(titleText);

        // 유닛 이미지
        const textureKey = this.roleToTexture[role] || 'leader_token';
        const unitImg = this.add.sprite(0, -popupH/2 + 80, textureKey, 0).setDisplaySize(60, 60);
        this.unitDetailPopup.add(unitImg);

        // 레벨 및 경험치 표시 (핵심 요구사항)
        const level = memberData.level || 1;
        const xp = memberData.xp || 0;
        // 예시: 레벨업 필요 경험치 = 레벨 * 100
        const reqXp = level * 100; 

        const lvText = this.add.text(0, -popupH/2 + 130, `Lv.${level}`, { fontSize: '24px', color: '#ffff00', fontStyle: 'bold' }).setOrigin(0.5);
        const xpText = this.add.text(0, -popupH/2 + 155, `XP: ${xp} / ${reqXp}`, { fontSize: '14px', color: '#aaaaaa' }).setOrigin(0.5);
        this.unitDetailPopup.add([lvText, xpText]);

        // 스탯 정보
        let statY = -popupH/2 + 190;
        const statStyle = { 
        fontSize: '14px', 
        color: '#ffffff',
        wordWrap: { width: popupW - 80 } 
    };
        
        const statsList = [
            `❤️ 체력: ${stats.hp}`,
            `⚔️ 공격력: ${stats.attackPower}`,
            `🦵 속도: ${stats.moveSpeed}`
        ];

        switch (role) {
            case 'Leader':
                statsList.push(`스킬: 샤우팅\n30초마다 근처 아군의 공격력이 10초간 10% 증가한다.`);
                break;
            case 'Tanker':
                statsList.splice(2, 0, `🛡️ 방어력: ${stats.defense || 0}`);
                statsList.push(`스킬: 어그로\n10초마다 주위의 적들을 도발한다`);
                break;
            case 'Healer':
                statsList[1] = `💖 치유량: ${stats.attackPower}`;
                break;
            default:
                break;
        }

        statsList.forEach((text, i) => {
            const t = this.add.text(-popupW/2 + 40, statY + (i * 20), text, statStyle);
            this.unitDetailPopup.add(t);
        });

        // 닫기 버튼만 존재 (구매 버튼 없음)
        const closeBtn = this.add.text(popupW/2 - 20, -popupH/2 + 20, "X", { fontSize: '20px', color: '#ff5555' }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', () => {
            this.unitDetailPopup.destroy();
            this.unitDetailPopup = null;
        });
        this.unitDetailPopup.add(closeBtn);
        
        // 하단 닫기 버튼 (편의성)
        const closeBtnBottom = this.add.container(0, popupH/2 - 40);
        const closeBg = this.add.rectangle(0, 0, 100, 40, 0x444444).setInteractive();
        const closeTxt = this.add.text(0, 0, "닫기", { fontSize: '16px' }).setOrigin(0.5);
        closeBtnBottom.add([closeBg, closeTxt]);
        closeBg.on('pointerdown', () => {
             this.unitDetailPopup.destroy();
             this.unitDetailPopup = null;
        });
        this.unitDetailPopup.add(closeBtnBottom);

        this.uiContainer.add(this.unitDetailPopup);
    }

    // 상점에서 고용할 때 보는 팝업 (구매 버튼 있음)
    openUnitDetailPopup(unitConfig) {
        if (this.unitDetailPopup) this.unitDetailPopup.destroy();

        const { width, height } = this.scale;
        const stats = ROLE_BASE_STATS[unitConfig.role] || ROLE_BASE_STATS['Normal'];
        this.unitDetailPopup = this.add.container(width/2, height/2).setDepth(2100);
        
        const popupW = 300;
        const popupH = 380;
        const bg = this.add.rectangle(0, 0, popupW, popupH, 0x111111, 0.95).setStrokeStyle(2, 0x888888);
        this.unitDetailPopup.add(bg);

        const titleText = this.add.text(0, -popupH/2 + 30, unitConfig.name, { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        this.unitDetailPopup.add(titleText);
        const textureKey = this.roleToTexture[unitConfig.role] || 'leader_token';
        const unitImg = this.add.sprite(0, -popupH/2 + 80, textureKey, 0).setDisplaySize(60, 60);
        this.unitDetailPopup.add(unitImg);

        const descText = this.add.text(0, -popupH/2 + 130, unitConfig.desc || "...", { fontSize: '14px', color: '#cccccc', align: 'center', wordWrap: { width: popupW - 40 } }).setOrigin(0.5);
        this.unitDetailPopup.add(descText);

        let statY = -popupH/2 + 170;
        const statStyle = { fontSize: '14px', color: '#ffffff', wordWrap: { width: popupW - 80 }  };
        
        const statsList = [
            `❤️ 체력: ${stats.hp}`,
            `⚔️ 공격력: ${stats.attackPower}`,
            `🦵 속도: ${stats.moveSpeed}`
        ];
        switch (unitConfig.role) {
            case 'Tanker':
                statsList.splice(2, 0, `🛡️ 방어력: ${stats.defense || 0}`);
                statsList.push(`스킬: 어그로\n10초마다 주위의 적들을 도발한다`);
                break;
            case 'Healer':
                statsList[1] = `💖 치유량: ${stats.attackPower}`;
                statsList.push(`🎯 사거리: ${stats.attackRange || 0}`);
                break;
            case 'Shooter':
                statsList.push(`🎯 사거리: ${stats.attackRange || 0}`);
                break;
            default:
                break;
        }

        statsList.forEach((text, i) => {
            const t = this.add.text(-popupW/2 + 40, statY + (i * 20), text, statStyle);
            this.unitDetailPopup.add(t);
        });

        const buyBtnY = popupH/2 - 50;
        const buyBtn = this.add.container(0, buyBtnY);
        const buyBtnBg = this.add.rectangle(0, 0, 140, 40, 0x00aa00).setInteractive();
        const buyBtnText = this.add.text(0, 0, `구매 (${unitConfig.cost}냥)`, { fontSize: '18px', fontStyle: 'bold' }).setOrigin(0.5);
        buyBtn.add([buyBtnBg, buyBtnText]);
        buyBtnBg.on('pointerdown', () => {
            this.buyUnit(unitConfig);
            this.unitDetailPopup.destroy();
            this.unitDetailPopup = null;
        });
        this.unitDetailPopup.add(buyBtn);

        const closeBtn = this.add.text(popupW/2 - 20, -popupH/2 + 20, "X", { fontSize: '20px', color: '#ff5555' }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', () => {
            this.unitDetailPopup.destroy();
            this.unitDetailPopup = null;
        });
        this.unitDetailPopup.add(closeBtn);
        this.uiContainer.add(this.unitDetailPopup);
    }

    refreshSquadDisplay() {
        if (!this.squadContainer) return;
        this.squadContainer.removeAll(true);
        
        const squad = this.registry.get('playerSquad') || [];
        this.squadCountText.setText(`현재 부대원: ${squad.length}명`);

        const iconSize = 40;
        const gap = 5;
        const maxCols = 12; 
        const totalW = Math.min(squad.length, maxCols) * (iconSize + gap);
        const startX = -totalW / 2 + iconSize / 2;

        squad.forEach((member, index) => {
            const textureKey = this.roleToTexture[member.role] || 'leader_token';
            const col = index % maxCols;
            const row = Math.floor(index / maxCols);
            const x = startX + col * (iconSize + gap);
            const y = row * (iconSize + gap);
            
            const icon = this.add.sprite(x, y, textureKey, 0);
            
            // 리더 10% 확대
            const isLeader = (member.role === 'Leader');
            const finalSize = isLeader ? iconSize * 1.1 : iconSize;
            icon.setDisplaySize(finalSize, finalSize);
            
            // [Modified] 클릭 이벤트 추가 -> 보유 유닛 정보 모달 열기
            icon.setInteractive({ useHandCursor: true });
            icon.on('pointerdown', () => {
                this.openOwnedUnitDetailPopup(member);
            });

            this.squadContainer.add(icon);
        });
    }

    toggleShop() {
        if (!this.shopPopup) {
            this.createShopPopup(); 
        }
        this.isShopOpen = !this.isShopOpen;
        if (this.isShopOpen) {
            this.createShopPopup();
            this.shopPopup.setVisible(true);
            this.refreshSquadDisplay(); 
        } else {
            this.shopPopup.setVisible(false);
            if (this.unitDetailPopup) {
                this.unitDetailPopup.destroy();
                this.unitDetailPopup = null;
            }
        }
    }

    buyUnit(unitConfig) {
        const currentCoins = this.registry.get('playerCoins');
        if (currentCoins >= unitConfig.cost) {
            const newCoins = currentCoins - unitConfig.cost;
            this.registry.set('playerCoins', newCoins);
            this.coinText.setText(`💰 ${newCoins}냥`);
            
            const squad = this.registry.get('playerSquad');
            // [Modified] 유닛 구매 시 레벨1, 경험치0 초기화
            squad.push({ role: unitConfig.role, level: 1, xp: 0 });
            this.registry.set('playerSquad', squad);
            
            this.refreshSquadDisplay();
            //this.cameras.main.shake(50, 0.005);
        } else {
            this.cameras.main.shake(100, 0.01); 
        }
    }

    getSquadCount() {
        return this.registry.get('playerSquad').length;
    }

    updateUIState() {
        if (!this.undoBtnObj || !this.endTurnBtnObj || !this.shopBtnObj) return;
        if (this.hasMoved && this.previousLeaderId !== null) {
            this.undoBtnObj.container.setVisible(true);
            this.shopBtnObj.container.setVisible(false); 
        } else {
            this.undoBtnObj.container.setVisible(false);
            this.shopBtnObj.container.setVisible(true);
        }
        if (this.selectedTargetId !== null && this.selectedTargetId !== undefined) {
            this.endTurnBtnObj.textObj.setText("전투 시작");
            this.endTurnBtnObj.bgObj.setFillStyle(0xff0000); 
        } else {
            this.endTurnBtnObj.textObj.setText("턴 종료");
            this.endTurnBtnObj.bgObj.setFillStyle(0xcc0000); 
        }
    }

    resizeUI() {
        this.uiCamera.setViewport(0, 0, this.scale.width, this.scale.height);
        this.drawUIElements();
    }
    moveLeaderToken(targetNode, onCompleteCallback) {
        this.input.enabled = false; 
        if (targetNode.x < this.leaderObj.x) { this.leaderObj.setFlipX(false); } else { this.leaderObj.setFlipX(true); }
        this.leaderObj.play('leader_walk');
        this.tweens.add({
            targets: this.leaderObj, x: targetNode.x, y: targetNode.y, duration: 1000, ease: 'Power2',
            onComplete: () => {
                this.leaderObj.play('leader_idle');
                this.registry.set('leaderPosition', targetNode.id);
                this.input.enabled = true;
                if (onCompleteCallback) onCompleteCallback();
            }
        });
    }
    undoMove() {
        if (!this.hasMoved || this.previousLeaderId === null) return;
        const prevNode = this.mapNodes.find(n => n.id === this.previousLeaderId);
        if (!prevNode) return;
        this.statusText.setText("↩️ 원래 위치로 복귀 중...");
        this.moveLeaderToken(prevNode, () => {
            this.hasMoved = false; this.previousLeaderId = null; this.selectedTargetId = null; 
            this.statusText.setText(`📍 복귀 완료: ${prevNode.name}`);
            this.updateUIState();
            if (this.selectionTween) { this.selectionTween.stop(); this.selectionTween = null; }
            this.nodeContainer.getChildren().forEach(c => { if (c instanceof Phaser.GameObjects.Arc) c.setAlpha(0.5); c.scale = 1; });
        });
    }
    selectTerritory(circleObj) {
        const node = circleObj.nodeData;
        const currentLeaderId = this.registry.get('leaderPosition');
        const currentNode = this.mapNodes.find(n => n.id === currentLeaderId);
        if (node.owner === 'neutral') { this.statusText.setText("⛔ 아직 지나갈 수 없다! 여기는 합정파의 영역이다냥!"); this.shakeNode(circleObj); return; }
        if (this.hasMoved) {
            if (this.previousLeaderId !== null && node.id === this.previousLeaderId) { this.undoMove(); return; }
            this.statusText.setText("🚫 이미 이동했습니다. [취소]하거나 [턴 종료] 하세요."); this.shakeStatusText(); return;
        }
        if (node.id === currentLeaderId) { this.statusText.setText(`📍 현재 위치: ${node.name}`); return; }
        const isConnected = currentNode.connectedTo.includes(node.id);
        if (!isConnected) { this.statusText.setText("🚫 너무 멉니다! 연결된 지역(1칸)으로만 이동 가능합니다."); this.shakeNode(circleObj); return; }
        if (this.selectionTween) { this.selectionTween.stop(); this.selectionTween = null; this.nodeContainer.getChildren().forEach(c => { if (c instanceof Phaser.GameObjects.Arc) c.setAlpha(0.5); c.scale = 1; }); }
        this.nodeContainer.getChildren().forEach(c => { if (c instanceof Phaser.GameObjects.Arc) c.setAlpha(0.5); });
        circleObj.setAlpha(1.0);
        this.selectionTween = this.tweens.add({ targets: circleObj, scale: { from: 1, to: 1.3 }, yoyo: true, repeat: -1, duration: 600 });
        this.previousLeaderId = currentLeaderId;
        this.registry.set('lastSafeNodeId', currentLeaderId); 
        if (node.owner !== 'player') { this.selectedTargetId = node.id; } else { this.selectedTargetId = null; }
        this.statusText.setText(`🚶 ${node.name}(으)로 이동 중...`);
        this.moveLeaderToken(node, () => {
            this.hasMoved = true; 
            if (this.selectedTargetId) {
                let infoText = ""; if (node.army) infoText = ` (적군: ${node.army.count}마리)`;
                this.statusText.setText(`⚔️ ${node.name} 진입!${infoText} 전투하려면 [전투 시작]`);
            } else { this.statusText.setText(`✅ ${node.name} 도착. (취소 가능)`); }
            this.updateUIState();
        });
    }
    shakeNode(target) { this.tweens.add({ targets: target, x: target.x + 5, duration: 50, yoyo: true, repeat: 3 }); this.cameras.main.shake(100, 0.005); }
    shakeStatusText() { this.tweens.add({ targets: this.statusText, alpha: 0.5, duration: 100, yoyo: true, repeat: 1 }); }
    handleTurnEnd() {
        this.hasMoved = false; this.previousLeaderId = null; this.selectedTargetId = null; 
        if (this.selectionTween) { this.selectionTween.stop(); this.selectionTween = null; }
        this.nodeContainer.getChildren().forEach(c => { if (c instanceof Phaser.GameObjects.Arc) c.setAlpha(0.5); c.scale = 1; });
        this.cameras.main.flash(500, 0, 0, 0); 
        this.statusText.setText("🌙 턴 종료. 행동력이 회복되었습니다.");
        this.updateUIState();
    }
    startBattle() {
        const targetNode = this.mapNodes.find(n => n.id === this.selectedTargetId);
        if (!targetNode) return;
        const selectedLevelIndex = targetNode ? (targetNode.levelIndex || 0) : 0;
        this.scene.start('BattleScene', {
            isStrategyMode: true, targetNodeId: this.selectedTargetId, levelIndex: selectedLevelIndex,
            currentCoins: this.registry.get('playerCoins') || 100, armyConfig: targetNode.army || null, bgmKey: targetNode.bgm 
        });
    }
    createAnimations() {
        if (!this.anims.exists('leader_idle')) { this.anims.create({ key: 'leader_idle', frames: this.anims.generateFrameNumbers('leader_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!this.anims.exists('leader_walk')) { this.anims.create({ key: 'leader_walk', frames: this.anims.generateFrameNumbers('leader_token', { frames: [1, 2] }), frameRate: 6, repeat: -1 }); }
        if (!this.anims.exists('dog_idle')) { this.anims.create({ key: 'dog_idle', frames: this.anims.generateFrameNumbers('dog_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!this.anims.exists('runner_idle')) { this.anims.create({ key: 'runner_idle', frames: this.anims.generateFrameNumbers('runner_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
    }
    update(time, delta) {
        if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
            const distance = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
            if (this.prevPinchDistance > 0) {
                const distanceDiff = (distance - this.prevPinchDistance) * 0.005; 
                const newZoom = this.cameras.main.zoom + distanceDiff;
                const clampedZoom = Phaser.Math.Clamp(newZoom, this.minZoom, 3);
                this.cameras.main.setZoom(clampedZoom);
                this.updateCameraLayout(); 
            }
            this.prevPinchDistance = distance;
        } else { this.prevPinchDistance = 0; }
    }
    updateCameraLayout() {
        const screenWidth = this.scale.width; const screenHeight = this.scale.height;
        const isPC = this.sys.game.device.os.desktop;
        const zoomFitWidth = screenWidth / this.mapWidth; const zoomFitHeight = screenHeight / this.mapHeight;
        this.minZoom = isPC ? zoomFitHeight : zoomFitWidth;
        if (this.cameras.main.zoom < this.minZoom || this.cameras.main.zoom === 1) { this.cameras.main.setZoom(this.minZoom); }
        const currentZoom = this.cameras.main.zoom;
        const displayWidth = screenWidth / currentZoom; const displayHeight = screenHeight / currentZoom;
        const offsetX = Math.max(0, (displayWidth - this.mapWidth) / 2);
        const offsetY = Math.max(0, (displayHeight - this.mapHeight) / 2);
        this.cameras.main.setBounds(-offsetX, -offsetY, Math.max(this.mapWidth, displayWidth), Math.max(this.mapHeight, displayHeight));
    }
    setupCameraControls() {
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            const newZoom = this.cameras.main.zoom - deltaY * 0.001;
            const clampedZoom = Phaser.Math.Clamp(newZoom, this.minZoom, 3);
            this.cameras.main.setZoom(clampedZoom);
            this.updateCameraLayout(); 
        });
        this.input.on('pointermove', (pointer) => {
            if (this.input.pointer1.isDown && this.input.pointer2.isDown) return;
            if (pointer.isDown) {
                this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
                this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
            }
        });
    }
    parseMapData(map, dbArmyData = {}) {
        const existingData = this.registry.get('worldMapData');
        let objectLayer = map.getObjectLayer('territory');
        if (!objectLayer) {
            const layers = map.objects;
            if (layers && Object.keys(layers).length > 0) { objectLayer = layers[Object.keys(layers)[0]]; }
        }
        let nodes = [];
        if (objectLayer && objectLayer.objects) {
            nodes = objectLayer.objects.map(obj => {
                const config = territoryConfig.territories[obj.id.toString()] || territoryConfig.default;
                const levelIdx = LEVEL_KEYS.indexOf(config.mapId);
                const finalLevelIndex = levelIdx >= 0 ? levelIdx : 0;
                if (obj.id === 6) { return { id: obj.id, x: obj.x, y: obj.y, name: "???", owner: 'neutral', connectedTo: [], levelIndex: 0, desc: "Locked Path", army: { type: 'runner', count: 1 } }; }
                const savedNode = existingData ? existingData.find(n => n.id === obj.id) : null;
                const owner = savedNode ? savedNode.owner : 'enemy';
                let armyData = null;
                if (savedNode) {
                    if (savedNode.owner === 'player' || savedNode.army === null) { armyData = null; } 
                    else { if (dbArmyData && dbArmyData[obj.id.toString()]) { armyData = dbArmyData[obj.id.toString()]; } else { armyData = savedNode.army; } }
                } else { if (dbArmyData && dbArmyData[obj.id.toString()]) { armyData = dbArmyData[obj.id.toString()]; } }
                return {
                    id: obj.id, x: obj.x, y: obj.y, name: config.name || obj.name || `Territory ${obj.id}`,
                    owner: owner, connectedTo: [], levelIndex: finalLevelIndex, desc: config.description || "",
                    army: armyData, bgm: config.bgm || "stage1_bgm" 
                };
            });
        } else {
            nodes = [{ id: 1, x: 200, y: 300, owner: 'player', name: 'Base', connectedTo: [], levelIndex: 0 }, { id: 2, x: 400, y: 300, owner: 'enemy', name: 'Target', connectedTo: [], levelIndex: 0 }];
        }
        if (!existingData && nodes.length > 0) {
            let startNode = nodes.reduce((prev, curr) => { const prevScore = prev.y - prev.x; const currScore = curr.y - curr.x; return (currScore > prevScore) ? curr : prev; });
            startNode.owner = 'player'; startNode.name = "유니타워";
        }
        nodes.forEach(node => {
            const others = nodes.filter(n => n.id !== node.id).map(n => ({ id: n.id, dist: Phaser.Math.Distance.Between(node.x, node.y, n.x, n.y) }));
            others.sort((a, b) => a.dist - b.dist);
            const neighbors = others.slice(0, 2);
            neighbors.forEach(nb => {
                if (!node.connectedTo.includes(nb.id)) node.connectedTo.push(nb.id);
                const targetNode = nodes.find(n => n.id === nb.id);
                if (targetNode && !targetNode.connectedTo.includes(node.id)) { targetNode.connectedTo.push(node.id); }
            });
        });
        this.registry.set('worldMapData', nodes);
    }
    createEnemyTokens() {
        if (!this.mapNodes) return;
        this.mapNodes.forEach(node => {
            if (node.owner !== 'player' && node.army) {
                let textureKey = 'dog_token'; if (node.army.type === 'runner') textureKey = 'runner_token'; else if (node.army.type === 'dog') textureKey = 'dog_token';
                const enemyObj = this.add.sprite(node.x, node.y, textureKey);
                let finalSize = 60;
                if (node.owner === 'neutral') { finalSize = 60; } 
                else { const armyCount = node.army.count || 1; finalSize = 50 + (armyCount - 5) * 5; finalSize = Phaser.Math.Clamp(finalSize, 30, 90); }
                enemyObj.setDisplaySize(finalSize, finalSize); enemyObj.setOrigin(0.5, 0.8); enemyObj.setFlipX(false); enemyObj.setDepth(10); 
                if (node.army.type === 'runner') enemyObj.play('runner_idle'); else enemyObj.play('dog_idle');
                this.tweens.add({ targets: enemyObj, scaleY: { from: enemyObj.scaleY, to: enemyObj.scaleY * 0.95 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
            }
        });
    }
    createPlayerToken() {
        let leaderNodeId = this.registry.get('leaderPosition');
        if (leaderNodeId === undefined) {
            const base = this.mapNodes.find(n => n.name === "Main Base") || this.mapNodes.find(n => n.owner === 'player');
            leaderNodeId = base ? base.id : this.mapNodes[0].id;
            this.registry.set('leaderPosition', leaderNodeId);
        }
        const currentNode = this.mapNodes.find(n => n.id === leaderNodeId);
        if (currentNode) {
            this.leaderObj = this.add.sprite(currentNode.x, currentNode.y, 'leader_token');
            this.leaderObj.setFlipX(true); this.leaderObj.setDisplaySize(60, 60); this.leaderObj.setOrigin(0.5, 0.8); this.leaderObj.setDepth(50); 
            this.leaderObj.play('leader_idle');
            this.tweens.add({ targets: this.leaderObj, scaleY: { from: this.leaderObj.scaleY, to: this.leaderObj.scaleY * 0.95 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
        }
    }
    createTerritoryNodes() {
        if (!this.mapNodes) return;
        this.nodeContainer = this.add.group();
        this.mapNodes.forEach(node => {
            let color = 0xff4444; if (node.owner === 'player') color = 0x4488ff; else if (node.owner === 'neutral') color = 0x888888; 
            const shadow = this.add.ellipse(node.x, node.y + 8, 20, 6, 0x000000, 0.3); shadow.setDepth(100); 
            const circle = this.add.circle(node.x, node.y, 13, color).setInteractive({ useHandCursor: true }).setStrokeStyle(2, 0xffffff);
            circle.setAlpha(0.5); circle.nodeData = node; circle.setDepth(100); 
            circle.on('pointerdown', () => this.selectTerritory(circle));
            this.nodeContainer.add(shadow); this.nodeContainer.add(circle);
        });
    }
    drawConnections() {
        if (!this.mapNodes) return;
        this.graphicsLayer.clear(); this.graphicsLayer.lineStyle(2, 0x888888, 0.5); 
        this.mapNodes.forEach(node => {
            node.connectedTo.forEach(targetId => {
                const target = this.mapNodes.find(n => n.id === targetId);
                if (target) { this.graphicsLayer.lineBetween(node.x, node.y, target.x, target.y); }
            });
        });
    }
    handleBattleResult(data) { }
}