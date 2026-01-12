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
import { ROLE_BASE_STATS, UNIT_COSTS } from '../data/UnitData'; 

import SaveManager from '../managers/SaveManager';

// [New] 분리된 모달 클래스 임포트
import ShopModal from '../ui/ShopModal';
import SystemModal from '../ui/SystemModal';

export default class StrategyScene extends BaseScene {
    constructor() {
        super('StrategyScene'); 
    }

    init(data) {
        if (data && data.battleResult) {
            this.battleResultData = data.battleResult;
        }
        
        const savedData = SaveManager.loadGame();

        if (this.registry.get('playerCoins') === undefined) {
            this.registry.set('playerCoins', savedData?.playerCoins ?? 50);
        }

        if (!this.registry.get('playerSquad')) {
            this.registry.set('playerSquad', savedData?.playerSquad || [{ role: 'Leader', level: 1, xp: 0 }]);
        }

        if (!this.registry.get('unlockedRoles')) {
            this.registry.set('unlockedRoles', savedData?.unlockedRoles || ['Normal']);
        }

        if (savedData && savedData.worldMapData) {
            this.registry.set('worldMapData', savedData.worldMapData);
        }

        if (savedData && savedData.leaderPosition) {
            this.registry.set('leaderPosition', savedData.leaderPosition);
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

    getCurrentGameData() {
        return {
            playerCoins: this.registry.get('playerCoins'),
            playerSquad: this.registry.get('playerSquad'),
            unlockedRoles: this.registry.get('unlockedRoles'),
            worldMapData: this.registry.get('worldMapData'),
            leaderPosition: this.registry.get('leaderPosition'),
            lastSafeNodeId: this.registry.get('lastSafeNodeId')
        };
    }

    saveProgress() {
        const data = this.getCurrentGameData();
        SaveManager.saveGame(data);
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

        this.drawUIElements();
    }

    drawUIElements() {
        if (this.uiContainer.list.length > 0) {
            this.uiContainer.removeAll(true);
            this.shopModal = new ShopModal(this, this.uiContainer);
            this.systemModal = new SystemModal(this, this.uiContainer);
        }

        const w = this.scale.width;
        const h = this.scale.height;
        const isMobile = w < 600; 
        const topBarH = isMobile ? 60 : 50;
        const fontSize = isMobile ? '13px' : '16px'; 

        const topBarBg = this.add.rectangle(0, 0, w, topBarH, 0x000000, 0.6).setOrigin(0, 0);
        const coins = this.registry.get('playerCoins');
        this.coinText = this.add.text(isMobile ? 10 : 20, topBarH/2, `💰 ${coins}냥`, { fontSize: isMobile ? '16px' : '18px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0, 0.5);
        
        const rightMargin = isMobile ? 15 : 20;
        const btnSpacing = isMobile ? 40 : 50;

        this.sysBtn = this.add.text(w - rightMargin, topBarH/2, "⚙️", { fontSize: isMobile ? '20px' : '24px' })
            .setOrigin(1, 0.5)
            .setInteractive();
        
        this.sysBtn.on('pointerdown', () => {
            if (this.shopModal.isOpen) this.shopModal.toggle();
            this.systemModal.toggle();
        });

        this.bgmBtn = this.add.text(w - rightMargin - btnSpacing, topBarH/2, "🔊", { fontSize: isMobile ? '20px' : '24px' })
            .setOrigin(1, 0.5)
            .setInteractive();
        
        this.bgmBtn.on('pointerdown', () => {
            const isMuted = this.toggleBgmMute();
            this.bgmBtn.setText(isMuted ? "🔇" : "🔊");
        });

        const currentStatusMsg = (this.statusText && this.statusText.active) ? this.statusText.text : '이동할 영토를 선택하세요.';
        const safeTextWidth = w - (isMobile ? 180 : 300); 
        this.statusText = this.add.text(w / 2, topBarH/2, currentStatusMsg, { fontSize: fontSize, color: '#ffffff', align: 'center', wordWrap: { width: safeTextWidth, useAdvancedWrap: true } }).setOrigin(0.5, 0.5);

        const btnMargin = isMobile ? 50 : 60;
        this.endTurnBtnObj = this.createStyledButton(w - (isMobile ? 85 : 100), h - btnMargin, '턴 종료', 0xcc0000, () => {
            if (this.selectedTargetId !== null) this.startBattle();
            else this.handleTurnEnd();
        });
        
        this.shopBtnObj = this.createStyledButton(isMobile ? 85 : 100, h - btnMargin, '🏰 부대편성', 0x444444, () => {
            if (this.systemModal.isOpen) this.systemModal.toggle();
            this.shopModal.toggle();
        });

        this.undoBtnObj = this.createStyledButton(w / 2, h - (btnMargin + 20), '이동 취소', 0x666666, () => this.undoMove());
        this.undoBtnObj.container.setVisible(false);

        if (isMobile) {
            this.endTurnBtnObj.container.setScale(0.85);
            this.shopBtnObj.container.setScale(0.85);
            this.undoBtnObj.container.setScale(0.85);
        }

        this.uiContainer.add([topBarBg, this.coinText, this.bgmBtn, this.sysBtn, this.statusText]);
        this.uiContainer.add([this.shopBtnObj.container, this.endTurnBtnObj.container, this.undoBtnObj.container]);
        
        this.updateUIState();
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
    }

    resizeUI() { this.uiCamera.setViewport(0, 0, this.scale.width, this.scale.height); this.drawUIElements(); }

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
        const squad = this.registry.get('playerSquad') || [];
        const recoveryAmount = this.hasMoved ? 1 : 3;
        
        // 1. 피로도 회복 및 유지비 계산
        let recoveredCount = 0;
        let totalMaintenanceCost = 0;

        squad.forEach(unit => {
            // 피로도 회복
            if (unit.fatigue > 0) {
                unit.fatigue = Math.max(0, unit.fatigue - recoveryAmount);
                recoveredCount++;
            }
            
            // 유지비 계산
            if (unit.role === 'Leader') {
                totalMaintenanceCost += 3; // [Modified] 리더 급식비 3냥 고정
            } else {
                const shopInfo = UNIT_COSTS.find(u => u.role === unit.role);
                const baseCost = shopInfo ? shopInfo.cost : 100;
                totalMaintenanceCost += Math.floor(baseCost * 0.2);
            }
        });
        
        // 2. 유지비 차감
        let currentCoins = this.registry.get('playerCoins');
        let isBankrupt = false;
        
        currentCoins -= totalMaintenanceCost;
        console.log(`💸 [Maintenance] Cost: ${totalMaintenanceCost}, Remaining: ${currentCoins}`);

        if (currentCoins < 0) {
            isBankrupt = true;
            currentCoins = 0;
            
            // 파산 시 리더 제외 전원 해고
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

        // 3. UI 피드백
        this.cameras.main.flash(500, 0, 0, 0); 
        
        if (isBankrupt) {
            this.statusText.setText(`💸 급식비 부족! 용병들이 모두 떠났습니다...`);
            this.statusText.setColor('#ff4444');
        } else {
            const maintenanceMsg = totalMaintenanceCost > 0 ? ` (급식비 ${totalMaintenanceCost}냥 지출)` : "";
            this.statusText.setText(`🌙 턴 종료. 행동력 회복.${maintenanceMsg}`);
            this.statusText.setColor('#ffffff');
            
            // 급식비 지출 플로팅 텍스트
            if (totalMaintenanceCost > 0) {
                this.showFloatingText(this.scale.width / 2, this.scale.height / 2, `-${totalMaintenanceCost}냥`, '#ff4444');
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
            circle.on('pointerdown', () => {
                // 모달이 열려있으면 닫기
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