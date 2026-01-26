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
import normalImg from '../../assets/units/normal.png';
import bossImg from '../../assets/units/boss.png'; 

import sangsuTilesImg from '../../assets/tilesets/sangsu_map.jpg';
import openingBgm from '../../assets/sounds/opening.mp3';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { ROLE_BASE_STATS, UNIT_COSTS } from '../data/UnitData'; 

import SaveManager from '../managers/SaveManager';

import ShopModal from '../ui/ShopModal';
import SystemModal from '../ui/SystemModal';
import pathData from '../data/path.json'; 

export default class StrategyScene extends BaseScene {
    constructor() {
        super('StrategyScene'); 
    }

    // ... (init, preload, create 등 기존 코드 유지) ...
    init(data) {
        this.isManualLoad = false;

        if (data && data.battleResult) {
            this.battleResultData = data.battleResult;
        }

        if (data && data.manualLoadData) {
            console.log("📂 [StrategyScene] Manual Load Data Applied", data.manualLoadData);
            const loadData = data.manualLoadData;
            
            this.isManualLoad = true;

            const keysToReset = ['playerCoins', 'playerSquad', 'unlockedRoles', 'worldMapData', 'leaderPosition', 'turnCount', 'lastSafeNodeId'];
            keysToReset.forEach(key => this.registry.remove(key));

            this.registry.set('playerCoins', loadData.playerCoins);
            this.registry.set('playerSquad', loadData.playerSquad);
            this.registry.set('unlockedRoles', loadData.unlockedRoles);
            this.registry.set('worldMapData', loadData.worldMapData);
            this.registry.set('leaderPosition', loadData.leaderPosition);
            this.registry.set('turnCount', loadData.turnCount || 1);
            this.registry.set('lastSafeNodeId', loadData.lastSafeNodeId);
            
            this.battleResultData = null;
        }

        if (!this.isManualLoad) {
            const savedData = SaveManager.loadGame();

            if (savedData) {
                if (this.registry.get('playerCoins') === undefined) {
                    this.registry.set('playerCoins', savedData.playerCoins ?? 10);
                }
                if (!this.registry.get('playerSquad')) {
                    this.registry.set('playerSquad', savedData.playerSquad || [{ role: 'Leader', level: 1, xp: 0 }]);
                }
                if (!this.registry.get('unlockedRoles')) {
                    this.registry.set('unlockedRoles', savedData.unlockedRoles || ['Normal']);
                }
                if (!this.registry.get('worldMapData') && savedData.worldMapData) {
                    this.registry.set('worldMapData', savedData.worldMapData);
                }
                if (this.registry.get('leaderPosition') === undefined && savedData.leaderPosition) {
                    this.registry.set('leaderPosition', savedData.leaderPosition);
                }
                if (this.registry.get('turnCount') === undefined) {
                    this.registry.set('turnCount', savedData.turnCount ?? 1);
                }
            }
        }

        const hasRegistryData = this.registry.get('playerCoins') !== undefined;
        this.isNewGame = !this.isManualLoad && !hasRegistryData; 
        
        console.log(`💾 [StrategyScene] Init - ManualLoad: ${this.isManualLoad}, Coins: ${this.registry.get('playerCoins')}`);
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
        this.load.spritesheet('normal_token', normalImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('boss_token', bossImg, { frameWidth: 100, frameHeight: 100 });

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

        this.events.on('resume', (scene, data) => {
            if (this.pendingNode) {
                this.handleNodeArrival(this.pendingNode);
                this.pendingNode = null;
            }
        });

        this.fetchStrategyConfig(map);
    }

    getCurrentGameData() {
        return {
            playerCoins: this.registry.get('playerCoins'),
            playerSquad: this.registry.get('playerSquad'),
            unlockedRoles: this.registry.get('unlockedRoles'),
            worldMapData: this.registry.get('worldMapData'),
            leaderPosition: this.registry.get('leaderPosition'),
            lastSafeNodeId: this.registry.get('lastSafeNodeId'),
            turnCount: this.registry.get('turnCount')
        };
    }

    saveProgress() {
        const data = this.getCurrentGameData();
        SaveManager.saveGame(data);
        console.log("💾 [StrategyScene] Progress Saved (Auto)");
    }

    async fetchStrategyConfig(map) {
        let armyData = {};
        this.strategySettings = null; 

        try {
            const docRef = doc(db, "settings", "tacticsConfig");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.territoryArmies) armyData = data.territoryArmies;
                
                this.strategySettings = {
                    gameSettings: data.gameSettings || {},
                    roleDefinitions: data.roleDefinitions || {}
                };

                if (data.gameSettings) {
                    this.registry.set('gameSettings', data.gameSettings);
                }

                if (data.roleDefinitions) {
                    this.registry.set('roleDefinitions', data.roleDefinitions);
                }
            }
        } catch (e) {
            console.error("❌ Failed to load strategy config:", e);
        }
        
        if (!this.isManualLoad) {
            const initialCoins = this.strategySettings?.gameSettings?.initialCoins ?? 50; 
            
            if (this.registry.get('playerCoins') === undefined) {
                 this.registry.set('playerCoins', initialCoins);
                 console.log(`💰 [StrategyScene] Initial Coins Set: ${initialCoins}`);
            }
            
            if (!this.registry.get('playerSquad')) {
                 this.registry.set('playerSquad', [{ role: 'Leader', level: 1, xp: 0 }]);
            }
            
            if (!this.registry.get('unlockedRoles')) {
                 this.registry.set('unlockedRoles', ['Normal']);
            }
            
            if (this.registry.get('turnCount') === undefined) {
                 this.registry.set('turnCount', 1);
            }
        }

        this.initializeGameWorld(map, armyData);
    }

    initializeGameWorld(map, dbArmyData) {
        this.hasMoved = false;
        this.previousLeaderId = null;
        this.selectedTargetId = null; 
        
        this.enemyTokens = [];

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
                    node.script = null; 
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
            
            this.saveProgress();
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

    handleStoryUnlocks(conqueredNodeId) {}

    unlockUnit(roleName) {
        const unlocked = this.registry.get('unlockedRoles') || [];
        if (!unlocked.includes(roleName)) {
            unlocked.push(roleName);
            this.registry.set('unlockedRoles', unlocked);
            this.statusText.setText(`🎉 새로운 동료 해금: ${roleName}!`);
            this.cameras.main.flash(500, 255, 255, 0); 
            this.saveProgress();
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

    updateCoinText(amount) {
        if(this.coinText) {
            this.coinText.setText(`💰 ${amount}냥`);
        }
    }

    createUI() {
        this.uiContainer = this.add.container(0, 0);
        this.uiContainer.setScrollFactor(0); 

        this.shopModal = new ShopModal(this, this.uiContainer);
        this.systemModal = new SystemModal(this, this.uiContainer);
        
        // [New] 동적 위치 메뉴 버튼을 담을 컨테이너 생성
        this.dynamicBtnContainer = this.add.container(0, 0);

        this.drawUIElements();
        
        // UI 컨테이너에 동적 버튼 컨테이너 추가
        this.uiContainer.add(this.dynamicBtnContainer);
    }

    drawUIElements() {
        if (this.uiContainer.list.length > 0) {
            // 완전히 지우지 않고 모달과 동적 컨테이너는 유지/재생성 관리
            // 여기서는 편의상 uiContainer를 클리어하지 않고 필요한 요소만 다시 그림
            // (기존 코드 구조상 removeAll을 하면 모달 참조가 끊길 수 있으므로 주의)
            // 간단하게 기존 요소들을 모두 지우고 다시 생성하는 방식 유지
            this.uiContainer.removeAll(true);
            this.shopModal = new ShopModal(this, this.uiContainer);
            this.systemModal = new SystemModal(this, this.uiContainer);
            
            // 재생성 후 다시 할당
            this.dynamicBtnContainer = this.add.container(0, 0);
        } else {
            this.shopModal = new ShopModal(this, this.uiContainer);
            this.systemModal = new SystemModal(this, this.uiContainer);
            this.dynamicBtnContainer = this.add.container(0, 0);
        }

        const w = this.scale.width;
        const h = this.scale.height;
        const isMobile = w < 600; 

        const safeAreaTop = isMobile ? 40 : 0; 
        const barHeight = isMobile ? 60 : 50;
        
        const topBarH = barHeight + safeAreaTop;
        const contentY = safeAreaTop + (barHeight / 2);

        const fontSize = isMobile ? '13px' : '16px'; 

        const topBarBg = this.add.rectangle(0, 0, w, topBarH, 0x000000, 0.6).setOrigin(0, 0);
        const coins = this.registry.get('playerCoins');
        this.coinText = this.add.text(isMobile ? 10 : 20, contentY, `💰 ${coins}냥`, { fontSize: isMobile ? '16px' : '18px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0, 0.5);
        
        const rightMargin = isMobile ? 15 : 20;
        const btnSpacing = isMobile ? 40 : 50;

        this.sysBtn = this.add.text(w - rightMargin, contentY, "⚙️", { fontSize: isMobile ? '20px' : '24px' })
            .setOrigin(1, 0.5)
            .setInteractive();
        
        this.sysBtn.on('pointerdown', () => {
            if (this.shopModal.isOpen) this.shopModal.toggle();
            this.systemModal.toggle();
        });

        this.bgmBtn = this.add.text(w - rightMargin - btnSpacing, contentY, "🔊", { fontSize: isMobile ? '20px' : '24px' })
            .setOrigin(1, 0.5)
            .setInteractive();
        
        this.bgmBtn.on('pointerdown', () => {
            const isMuted = this.toggleBgmMute();
            this.bgmBtn.setText(isMuted ? "🔇" : "🔊");
        });

        const currentStatusMsg = (this.statusText && this.statusText.active) ? this.statusText.text : '이동할 영토를 선택하세요.';
        const safeTextWidth = w - (isMobile ? 180 : 300); 
        this.statusText = this.add.text(w / 2, contentY, currentStatusMsg, { fontSize: fontSize, color: '#ffffff', align: 'center', wordWrap: { width: safeTextWidth, useAdvancedWrap: true } }).setOrigin(0.5, 0.5);

        const btnMargin = isMobile ? 50 : 60;
        this.endTurnBtnObj = this.createStyledButton(w - (isMobile ? 85 : 100), h - btnMargin, '턴 종료', 0xcc0000, () => {
            if (this.selectedTargetId !== null) this.startBattle();
            else this.handleTurnEnd();
        });
        
        this.shopBtnObj = this.createStyledButton(isMobile ? 100 : 100, h - btnMargin, '🏰 부대편성', 0x444444, () => {
            if (this.systemModal.isOpen) this.systemModal.toggle();
            this.shopModal.toggle();
        });

        this.undoBtnObj = this.createStyledButton(isMobile ? 100 : 100, h - btnMargin, '이동 취소', 0x666666, () => this.undoMove());
        this.undoBtnObj.container.setVisible(false);

        if (isMobile) {
            this.endTurnBtnObj.container.setScale(0.85);
            this.shopBtnObj.container.setScale(0.85);
            this.undoBtnObj.container.setScale(0.85);
        }

        this.uiContainer.add([topBarBg, this.coinText, this.bgmBtn, this.sysBtn, this.statusText]);
        this.uiContainer.add([this.shopBtnObj.container, this.endTurnBtnObj.container, this.undoBtnObj.container]);
        this.uiContainer.add(this.dynamicBtnContainer); // 동적 버튼 컨테이너 다시 추가
        
        this.updateUIState();
    }

    // [New] 다이소 오픈 함수 (플레이스홀더)
    openDaiso() {
        console.log("Open Daiso Shop");
        // 현재는 상점 기능이 구현되지 않았으므로 안내 메시지 표시
        this.statusText.setText("🛍️ 다이소에 오신 것을 환영합니다! (준비중)");
        this.cameras.main.flash(200, 255, 255, 255); // 화면 깜빡임 효과
    }

    // [New] 위치 기반 메뉴 업데이트
    updateLocationMenus() {
        if (!this.dynamicBtnContainer) return;
        this.dynamicBtnContainer.removeAll(true);
        
        const currentLeaderId = this.registry.get('leaderPosition');
        const currentNode = this.mapNodes.find(n => n.id === currentLeaderId);
        
        if (currentNode && currentNode.add_menu && Array.isArray(currentNode.add_menu)) {
            // 부대편성 버튼(왼쪽)과 턴 종료 버튼(오른쪽) 사이 공간 활용
            // 부대편성 버튼의 기본 위치가 x=100 정도이므로, 그 오른쪽부터 배치
            let xPos = 280; 
            const yPos = this.scale.height - (this.scale.width < 600 ? 50 : 60);
            const isMobile = this.scale.width < 600;
            
            if (isMobile) {
                xPos = 190; // 모바일에서는 좀 더 좁게 배치
            }

            currentNode.add_menu.forEach((menuName, index) => {
                if (menuName === "다이소") {
                    const btn = this.createStyledButton(xPos + (index * 120), yPos, "🛍️ 다이소", 0xff66cc, () => {
                        this.openDaiso();
                    });
                    
                    if (isMobile) btn.container.setScale(0.85);
                    this.dynamicBtnContainer.add(btn.container);
                }
                // 추후 다른 메뉴가 추가되면 여기에 분기 처리 (else if ...)
            });
        }
    }

    updateUIState() {
        if (!this.undoBtnObj || !this.endTurnBtnObj || !this.shopBtnObj) return;
        
        if (this.hasMoved && this.previousLeaderId !== null) {
            this.undoBtnObj.container.setVisible(true); this.shopBtnObj.container.setVisible(false); 
        } else {
            this.undoBtnObj.container.setVisible(false); this.shopBtnObj.container.setVisible(true);
        }
        
        if (this.selectedTargetId !== null && this.selectedTargetId !== undefined) {
            this.endTurnBtnObj.textObj.setText("전투 시작"); this.endTurnBtnObj.bgObj.setFillStyle(0xff0000); 
        } else {
            this.endTurnBtnObj.textObj.setText("턴 종료"); this.endTurnBtnObj.bgObj.setFillStyle(0xcc0000); 
        }

        // [New] 위치별 추가 메뉴 업데이트 호출
        this.updateLocationMenus();
    }

    resizeUI() { this.uiCamera.setViewport(0, 0, this.scale.width, this.scale.height); this.drawUIElements(); }

    // ... (이후 메서드들은 기존 코드 유지: moveLeaderToken, undoMove, selectTerritory, handleNodeArrival, handleNeutralEvent, handleEventResult 등) ...

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
                this.saveProgress();
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
        
        if (node.owner !== 'player' && node.owner !== 'neutral') { this.selectedTargetId = node.id; } else { this.selectedTargetId = null; }
        
        this.statusText.setText(`🚶 ${node.name}(으)로 이동 중...`);
        
        this.moveLeaderToken(node, () => {
            this.hasMoved = true; 
            
            // 스크립트가 있다면 EventScene 실행, 아니면 바로 도착 처리
            if (node.script) {
                this.pendingNode = node; // Resume 후 처리를 위해 저장
                this.scene.pause(); // 현재 씬 일시 정지
                this.scene.launch('EventScene', { 
                    mode: 'overlay', 
                    script: node.script, 
                    parentScene: 'StrategyScene' 
                });
            } else {
                this.handleNodeArrival(node);
            }
        });
    }

    handleNodeArrival(node) {
        // 1. 중립 지역 이벤트 처리 (기존 로직 유지)
        if (node.owner === 'neutral') {
            this.handleNeutralEvent(node);
            return; 
        }

        // 2. 현재 노드의 적군 수 계산
        let enemyCount = 0;
        if (node.army) {
            if (Array.isArray(node.army)) {
                enemyCount = node.army.reduce((sum, u) => sum + (u.count || 1), 0);
            } else {
                enemyCount = node.army.count || 1;
            }
        }

        // 3. 적 땅이지만 군대가 없는 경우 -> 자동 점령 처리
        if (node.owner !== 'player' && enemyCount <= 0) {
            console.log(`🚩 [StrategyScene] 빈 영토 자동 점령: ${node.name}`);

            // 소유권 변경 및 군대 정보 초기화
            node.owner = 'player';
            node.army = null;
            
            this.selectedTargetId = null;

            this.registry.set('worldMapData', this.mapNodes);
            this.saveProgress();

            const circle = this.nodeContainer.getChildren().find(c => c.nodeData && c.nodeData.id === node.id);
            if (circle) circle.setFillStyle(0x4488ff);

            this.statusText.setText(`🚩 ${node.name} 무혈 입성! 적군 없이 점령했습니다.`);
            
            this.updateUIState();
            return;
        }

        // 4. 적군이 있는 경우 (기존 전투 대기 로직)
        if (this.selectedTargetId) {
            let infoText = ""; 
            if (enemyCount > 0) {
                infoText = ` (적군: ${enemyCount}마리)`;
            }
            const battleMsg = `⚔️ ${node.name} 진입!${infoText} 전투하려면 [전투 시작]`;
            const finalMsg = node.text ? `${node.text}\n${battleMsg}` : battleMsg;
            this.statusText.setText(finalMsg);
        } else { 
            this.statusText.setText(`✅ ${node.name} 도착. (취소 가능)`); 
        }
        
        this.updateUIState();
    }

    // ... (handleNeutralEvent, handleEventResult, getCameraTarget, shakeNode, shakeStatusText, handleTurnEnd 등 기존 로직 유지) ...
    handleNeutralEvent(node) {
        let unlockedUnits = [];

        if (node.script && Array.isArray(node.script)) {
            const unlockCommand = node.script.find(cmd => cmd.type === 'unlock_unit');

            if (unlockCommand && Array.isArray(unlockCommand.unit)) {
                console.log(`🎁 [StrategyScene] 유닛 해금 이벤트 발생:`, unlockCommand.unit);

                unlockCommand.unit.forEach(roleName => {
                    this.unlockUnit(roleName); 
                    unlockedUnits.push(roleName);
                });
            }
        }

        node.owner = 'player';
        node.script = null; 
        node.army = null;   

        this.registry.set('worldMapData', this.mapNodes);
        
        const token = this.enemyTokens.find(t => 
            Math.abs(t.x - node.x) < 5 && Math.abs(t.y - node.y) < 5
        );
        if (token) {
            token.destroy();
            this.enemyTokens = this.enemyTokens.filter(t => t !== token);
        }

        const circle = this.nodeContainer.getChildren().find(c => c.nodeData && c.nodeData.id === node.id);
        if (circle) circle.setFillStyle(0x4488ff);

        this.saveProgress();
        this.updateUIState();
        this.input.enabled = true;
    }

    handleEventResult(result, node) {
        if (result === 'recruit') {
            if (node.army) {
                let firstUnit = Array.isArray(node.army) ? node.army[0] : node.army;
                if (firstUnit && firstUnit.type) {
                    const roleName = firstUnit.type.charAt(0).toUpperCase() + firstUnit.type.slice(1);
                    this.unlockUnit(roleName);
                    this.statusText.setText(`🤝 ${roleName} 영입 성공!`);
                    node.owner = 'player';
                    node.script = null; 
                    
                    const token = this.enemyTokens.find(t => 
                        Math.abs(t.x - node.x) < 5 && Math.abs(t.y - node.y) < 5
                    );
                    if (token) token.destroy();
                    
                    this.registry.set('worldMapData', this.mapNodes);
                    this.saveProgress();
                    
                    const circle = this.nodeContainer.getChildren().find(c => c.nodeData && c.nodeData.id === node.id);
                    if (circle) circle.setFillStyle(0x4488ff);
                }
            }
        } else {
            this.statusText.setText(`✅ ${node.name}에서 잠시 휴식을 취했습니다.`);
        }
        
        this.updateUIState();
        this.input.enabled = true;
    }

    getCameraTarget(speaker) {
        if (this.leaderObj) {
            return { x: this.leaderObj.x, y: this.leaderObj.y };
        }
        return null;
    }

    shakeNode(target) { this.tweens.add({ targets: target, x: target.x + 5, duration: 50, yoyo: true, repeat: 3 }); this.cameras.main.shake(100, 0.005); }
    shakeStatusText() { this.tweens.add({ targets: this.statusText, alpha: 0.5, duration: 100, yoyo: true, repeat: 1 }); }

    handleTurnEnd() {
        const squad = this.registry.get('playerSquad') || [];
        const recoveryAmount = this.hasMoved ? 1 : 3;
        
        let recoveredCount = 0;
        let totalMaintenanceCost = 0;

        const registryRoleDefs = this.registry.get('roleDefinitions') || {};
        const roleDefs = { ...ROLE_BASE_STATS, ...registryRoleDefs };

        squad.forEach(unit => {
            if (unit.fatigue > 0) {
                unit.fatigue = Math.max(0, unit.fatigue - recoveryAmount);
                recoveredCount++;
            }
            let maintenance = 0;
            if (roleDefs[unit.role] && roleDefs[unit.role].maintenance !== undefined) {
                maintenance = roleDefs[unit.role].maintenance;
            } else {
                if (unit.role === 'Leader') maintenance = 3;
                else {
                    const shopInfo = UNIT_COSTS.find(u => u.role === unit.role);
                    const baseCost = shopInfo ? shopInfo.cost : 100;
                    maintenance = Math.floor(baseCost * 0.2);
                }
            }
            totalMaintenanceCost += maintenance;
        });
        
        const ownedTerritories = this.mapNodes ? this.mapNodes.filter(n => n.owner === 'player').length : 0;
        const incomePerTerritory = this.strategySettings?.gameSettings?.territoryIncome ?? 2;
        const totalIncome = ownedTerritories * incomePerTerritory;

        let currentCoins = this.registry.get('playerCoins');
        let isBankrupt = false;
        
        currentCoins = currentCoins + totalIncome - totalMaintenanceCost;
        
        console.log(`💰 [Turn End] Income: +${totalIncome} (Terr: ${ownedTerritories}), Cost: -${totalMaintenanceCost}, Result: ${currentCoins}`);

        if (currentCoins < 0) {
            isBankrupt = true;
            currentCoins = 0;
            const leaderOnly = squad.filter(u => u.role === 'Leader');
            this.registry.set('playerSquad', leaderOnly);
            console.warn("⚠️ [Bankruptcy] Mercenaries dismissed.");
        } else {
            this.registry.set('playerSquad', squad);
        }

        this.registry.set('playerCoins', currentCoins);
        this.updateCoinText(currentCoins);

        this.hasMoved = false; 
        this.previousLeaderId = null; 
        this.selectedTargetId = null; 
        
        if (this.selectionTween) { 
            this.selectionTween.stop(); 
            this.selectionTween = null; 
        }
        
        this.nodeContainer.getChildren().forEach(c => { 
            if (c instanceof Phaser.GameObjects.Arc) c.setAlpha(0.5); 
            c.scale = 1; 
        });

        let turnCount = this.registry.get('turnCount') || 0;
        turnCount++;
        this.registry.set('turnCount', turnCount);

        const reinforceInterval = this.strategySettings?.gameSettings?.reinforcementInterval || 3;

        let warningMsg = "";
        
        // [수정] 적군 증원 로직 (플레이어 위치 회피 추가)
        if (turnCount % reinforceInterval === 0) {
            const playerNodes = this.mapNodes.filter(n => n.owner === 'player');
            
            if (playerNodes.length > 0) {
                // ID 내림차순 정렬 (큰 숫자 우선)
                playerNodes.sort((a, b) => b.id - a.id);
                
                let targetNode = playerNodes[0];
                const leaderPos = this.registry.get('leaderPosition');

                // [New] 가장 큰 숫자의 땅에 아군(리더)이 있는 경우
                if (targetNode.id === leaderPos) {
                    if (playerNodes.length > 1) {
                        // 바로 다음 숫자의 땅을 타겟으로 변경
                        targetNode = playerNodes[1];
                        console.log(`⚠️ [Invasion] Leader detected at Node ${leaderPos}. Targeting next node: ${targetNode.id}`);
                    } else {
                        // 땅이 하나뿐인데 거기 플레이어가 있다면 침공 스킵 (안전지대)
                        targetNode = null;
                        console.log("⚠️ [Invasion] Skipped: Player is defending the only territory.");
                    }
                }

                // 타겟이 유효할 경우에만 침공 진행
                if (targetNode) {
                    const spawnCount = 5 + Math.floor(turnCount / 10);
                    console.log(`⚠️ [Invasion] Node ${targetNode.id} (${targetNode.name}) taken by Enemy! Spawn: ${spawnCount}`);

                    targetNode.owner = 'enemy';
                    
                    // unit type: 'normalDog' (BattleScene 클래스 매핑용)
                    targetNode.army = { type: 'normalDog', count: spawnCount };

                    this.registry.set('worldMapData', this.mapNodes);

                    const circle = this.nodeContainer.getChildren().find(c => c.nodeData && c.nodeData.id === targetNode.id);

                    this.createEnemyTokens();

                    const token = this.enemyTokens.find(t => Math.abs(t.x - targetNode.x) < 5 && Math.abs(t.y - targetNode.y) < 5);
                    
                    if (token) {
                        const originalScale = token.scaleX; 
                        token.setScale(0); 
                        
                        this.tweens.killTweensOf(token);

                        this.tweens.add({
                            targets: token,
                            scaleX: originalScale,
                            scaleY: originalScale,
                            duration: 2000,
                            ease: 'Cubic.out',
                            onComplete: () => {
                                if (circle) circle.setFillStyle(0xff4444);
                                
                                this.tweens.add({ 
                                    targets: token, 
                                    scaleY: originalScale * 0.95, 
                                    yoyo: true, 
                                    repeat: -1, 
                                    duration: 900, 
                                    ease: 'Sine.easeInOut' 
                                });
                            }
                        });
                    } else {
                        if (circle) circle.setFillStyle(0xff4444);
                    }

                    warningMsg = `\n⚠️ [경고] 영토 침공! ${targetNode.name}을(를) 뺏겼습니다! (들개 ${spawnCount}마리)`;
                    this.cameras.main.flash(500, 255, 0, 0); 
                }
            }
        }

        if (!isBankrupt && !warningMsg) {
            this.cameras.main.flash(500, 0, 0, 0); 
        }
        
        if (isBankrupt) {
            this.statusText.setText(`💸 급식비 부족! 용병들이 모두 떠났습니다...`);
            this.statusText.setColor('#ff4444');
        } else {
            const incomeMsg = totalIncome > 0 ? ` (+${totalIncome})` : "";
            const maintenanceMsg = totalMaintenanceCost > 0 ? ` (-${totalMaintenanceCost})` : "";
            
            this.statusText.setText(`🌙 턴 종료${incomeMsg}${maintenanceMsg}${warningMsg}`);
            this.statusText.setColor(warningMsg ? '#ffaaaa' : '#ffffff');
            
            if (totalIncome > 0) {
                this.showFloatingText(this.scale.width / 2, this.scale.height / 2 - 80, `+${totalIncome}냥 (영토)`, '#44ff44');
            }
            if (totalMaintenanceCost > 0) {
                this.showFloatingText(this.scale.width / 2, this.scale.height / 2, `-${totalMaintenanceCost}냥 (유지비)`, '#ff4444');
            }
        }
        
        this.updateUIState();
        this.saveProgress();
    }

    showFloatingText(x, y, message, color) {
        const text = this.add.text(x, y, message, {
            fontSize: '32px', color: color, stroke: '#000000', strokeThickness: 4, fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(3000);
        
        this.tweens.add({
            targets: text, y: y - 100, alpha: 0, duration: 2000, ease: 'Power2',
            onComplete: () => text.destroy()
        });
    }

    startBattle() {
        const targetNode = this.mapNodes.find(n => n.id === this.selectedTargetId);
        if (!targetNode) return;
        const selectedLevelIndex = targetNode ? (targetNode.levelIndex || 0) : 0;
        
        const currentCoins = this.registry.get('playerCoins') ?? 0;

        const battleData = {
            isStrategyMode: true, 
            targetNodeId: this.selectedTargetId, 
            levelIndex: selectedLevelIndex,
            currentCoins: currentCoins, 
            armyConfig: targetNode.army || null, 
            bgmKey: targetNode.bgm 
        };

        this.scene.start('LoadingScene', {
            targetScene: 'BattleScene',
            targetData: battleData
        });
    }

    createAnimations() {
        if (!this.anims.exists('leader_idle')) { this.anims.create({ key: 'leader_idle', frames: this.anims.generateFrameNumbers('leader_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!this.anims.exists('leader_walk')) { this.anims.create({ key: 'leader_walk', frames: this.anims.generateFrameNumbers('leader_token', { frames: [1, 2] }), frameRate: 6, repeat: -1 }); }
        if (!this.anims.exists('dog_idle')) { this.anims.create({ key: 'dog_idle', frames: this.anims.generateFrameNumbers('dog_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!this.anims.exists('runner_idle')) { this.anims.create({ key: 'runner_idle', frames: this.anims.generateFrameNumbers('runner_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!this.anims.exists('boss_idle')) { this.anims.create({ key: 'boss_idle', frames: this.anims.generateFrameNumbers('boss_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!this.anims.exists('tanker_idle')) { this.anims.create({ key: 'tanker_idle', frames: this.anims.generateFrameNumbers('tanker_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!this.anims.exists('shooter_idle')) { this.anims.create({ key: 'shooter_idle', frames: this.anims.generateFrameNumbers('shooter_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!this.anims.exists('healer_idle')) { this.anims.create({ key: 'healer_idle', frames: this.anims.generateFrameNumbers('healer_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!this.anims.exists('raccoon_idle')) { this.anims.create({ key: 'raccoon_idle', frames: this.anims.generateFrameNumbers('raccoon_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!this.anims.exists('normal_idle')) { this.anims.create({ key: 'normal_idle', frames: this.anims.generateFrameNumbers('normal_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
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
                
                let initialOwner = config.neutral ? 'neutral' : 'enemy';
                
                if (obj.id === 1) {
                    initialOwner = 'player';
                }

                let text = config.text || "";
                
                const savedNode = existingData ? existingData.find(n => n.id === obj.id) : null;
                const owner = savedNode ? savedNode.owner : initialOwner;
                
                let configArmy = null;
                if (config.unit) {
                    configArmy = { type: config.unit.toLowerCase(), count: config.count || 1 };
                }

                let armyData = null;
                if (savedNode) {
                    if (savedNode.owner === 'player') armyData = null;
                    else if (savedNode.army !== undefined) { 
                        armyData = savedNode.army; 
                    }
                    else {
                         if (dbArmyData && dbArmyData[obj.id.toString()]) armyData = dbArmyData[obj.id.toString()];
                         else armyData = configArmy;
                    }
                } else {
                    if (owner === 'player') {
                        armyData = null;
                    } else {
                        if (dbArmyData && dbArmyData[obj.id.toString()]) armyData = dbArmyData[obj.id.toString()];
                        else armyData = configArmy;
                    }
                }

                return {
                    id: obj.id, 
                    x: obj.x, 
                    y: obj.y, 
                    name: config.name || obj.name || `Territory ${obj.id}`,
                    owner: owner, 
                    connectedTo: [], 
                    levelIndex: finalLevelIndex, 
                    desc: config.description || "",
                    text: text,
                    army: armyData, 
                    bgm: config.bgm || "stage1_bgm",
                    script: savedNode && savedNode.script !== undefined ? savedNode.script : (config.script || null),
                    // [New] 설정에서 add_menu 파싱
                    add_menu: config.add_menu || [] 
                };
            });
        }

        nodes.forEach(node => {
            const nodeIdStr = node.id.toString();
            if (pathData[nodeIdStr]) {
                pathData[nodeIdStr].forEach(targetId => {
                    if (targetId === node.id) return;
                    if (!node.connectedTo.includes(targetId)) {
                        node.connectedTo.push(targetId);
                    }
                    const targetNode = nodes.find(n => n.id === targetId);
                    if (targetNode && !targetNode.connectedTo.includes(node.id)) {
                        targetNode.connectedTo.push(node.id);
                    }
                });
            }
        });

        this.registry.set('worldMapData', nodes);
    }
    
    // ... (createEnemyTokens, createPlayerToken, createTerritoryNodes, drawConnections, handleBattleResult 등 기존 로직 유지) ...
    createEnemyTokens() {
        if (!this.mapNodes) return;
        if (this.enemyTokens && this.enemyTokens.length > 0) {
            this.enemyTokens.forEach(token => { if (token && token.active) token.destroy(); });
        }
        this.enemyTokens = [];
        
        this.mapNodes.forEach(node => {
            if (node.owner !== 'player' && node.army) {
                let topUnitType = 'dog';
                let totalCount = 0;

                if (Array.isArray(node.army)) {
                    const bossUnit = node.army.find(u => u.type && u.type.toLowerCase() === 'boss');
                    const tankerUnit = node.army.find(u => u.type && u.type.toLowerCase() === 'tanker');
                    
                    if (bossUnit) topUnitType = 'boss';
                    else if (tankerUnit) topUnitType = 'tanker';
                    else if (node.army.length > 0 && node.army[0].type) topUnitType = node.army[0].type.toLowerCase();

                    totalCount = node.army.reduce((sum, u) => sum + (u.count || 1), 0);
                } else {
                    topUnitType = node.army.type ? node.army.type.toLowerCase() : 'dog';
                    totalCount = node.army.count || 1;
                }

                let textureKey = 'dog_token';
                if (topUnitType === 'runner') textureKey = 'runner_token';
                else if (topUnitType === 'dog') textureKey = 'dog_token';
                else if (topUnitType === 'tanker') textureKey = 'tanker_token';
                else if (topUnitType === 'shooter') textureKey = 'shooter_token';
                else if (topUnitType === 'healer') textureKey = 'healer_token';
                else if (topUnitType === 'raccoon') textureKey = 'raccoon_token';
                else if (topUnitType === 'normal') textureKey = 'normal_token';
                else if (topUnitType === 'boss') textureKey = 'boss_token';
                
                const enemyObj = this.add.sprite(node.x, node.y, textureKey);
                if (this.uiCamera) this.uiCamera.ignore(enemyObj);

                let finalSize = 60; 
                if (node.owner === 'neutral') finalSize = 60;
                else { 
                    if (topUnitType === 'tanker') finalSize = 70; 
                    else if (topUnitType === 'boss') finalSize = 100; 
                    else { 
                        finalSize = 40 + (totalCount - 1) * 3; 
                        finalSize = Phaser.Math.Clamp(finalSize, 35, 75); 
                    }
                }
                enemyObj.setDisplaySize(finalSize, finalSize); 
                enemyObj.setOrigin(0.5, 0.8); 
                enemyObj.setFlipX(false); 
                enemyObj.setDepth(10); 
                
                const animKey = `${topUnitType}_idle`;
                if (this.anims.exists(animKey)) {
                    enemyObj.play(animKey);
                } else {
                    enemyObj.play('dog_idle');
                }
                
                this.tweens.add({ targets: enemyObj, scaleY: { from: enemyObj.scaleY, to: enemyObj.scaleY * 0.95 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
                this.enemyTokens.push(enemyObj);
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
            circle.on('pointerdown', () => {
                if(this.shopModal.isOpen) this.shopModal.toggle();
                if(this.systemModal.isOpen) this.systemModal.toggle();
                this.selectTerritory(circle);
            });
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