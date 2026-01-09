import BaseScene from './BaseScene'; 
import Phaser from 'phaser';
import sangsuMap from '../../assets/maps/sangsu_map.json'; 
import territoryConfig from '../data/TerritoryConfig.json'; 
import { LEVEL_KEYS } from '../managers/LevelManager'; 
import leaderImg from '../../assets/units/leader.png';
import dogImg from '../../assets/units/dog.png';
import runnerImg from '../../assets/units/runner.png'; 
import sangsuTilesImg from '../../assets/tilesets/sangsu_map.jpg';
import openingBgm from '../../assets/sounds/opening.mp3';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";

// [New] 유닛 가격 정보 (BattleScene에서 가져옴)
const UNIT_COSTS = [
    { role: 'Tanker', name: '탱커', cost: 10 },
    { role: 'Shooter', name: '슈터', cost: 20 },
    { role: 'Healer', name: '힐러', cost: 25 },
    { role: 'Raccoon', name: '너구리', cost: 10 },
    { role: 'Runner', name: '러너', cost: 10 },
    { role: 'Normal', name: '일반냥', cost: 5 }
];

export default class StrategyScene extends BaseScene {
    constructor() {
        super('StrategyScene'); 
    }

    init(data) {
        if (data && data.battleResult) {
            this.battleResultData = data.battleResult;
        }
        // [New] 부대 정보 초기화 (없으면 리더만 존재)
        if (!this.registry.get('playerSquad')) {
            this.registry.set('playerSquad', [{ role: 'Leader' }]);
        }
        // [New] 코인 정보 초기화
        if (this.registry.get('playerCoins') === undefined) {
            this.registry.set('playerCoins', 50); // 기본 자금
        }
    }

    preload() {
        this.load.tilemapTiledJSON('strategy_map', sangsuMap);
        this.load.image('sangsu_tiles', sangsuTilesImg);
        this.load.spritesheet('leader_token', leaderImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('dog_token', dogImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('runner_token', runnerImg, { frameWidth: 100, frameHeight: 100 });
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
        this.isShopOpen = false; // 상점 열림 상태

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

    handleResize(gameSize) {
        this.updateCameraLayout();
        this.resizeUI();
    }

    createUI() {
        this.uiContainer = this.add.container(0, 0);
        this.uiContainer.setScrollFactor(0); 
        this.drawUIElements();
        this.createShopPopup(); // [New] 상점 팝업 생성
    }

    drawUIElements() {
        if (this.uiContainer.list.length > 0) {
            // 팝업 컨테이너는 유지하고 나머지만 재생성하거나, 전체 삭제 후 재생성
            // 여기서는 간단하게 전체 삭제 후 재생성 (팝업 포함)
            this.uiContainer.removeAll(true);
        }

        const w = this.scale.width;
        const h = this.scale.height;
        const headerH = 60;
        const footerH = 80;
        const headerY = h - footerH - headerH;

        // 1. 헤더 영역
        const headerBg = this.add.rectangle(0, headerY, w, headerH, 0x000000, 0.85).setOrigin(0, 0);
        const currentStatusMsg = (this.statusText && this.statusText.active) ? this.statusText.text : '이동할 영토를 선택하세요.';
        
        this.statusText = this.add.text(w - 20, headerY + headerH/2, currentStatusMsg, { 
            fontSize: '16px', color: '#dddddd', align: 'right' 
        }).setOrigin(1, 0.5);

        // [New] 코인 표시
        const coins = this.registry.get('playerCoins');
        this.coinText = this.add.text(20, headerY + headerH/2, `💰 ${coins}냥`, {
            fontSize: '20px', color: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0, 0.5);

        // 2. 푸터 영역
        const footerBg = this.add.rectangle(0, h, w, footerH, 0x000000, 0.85).setOrigin(0, 1);

        // [Modified] 버튼 배치 (좌: 상점, 중: 취소, 우: 턴종료/전투)
        const btnY = h - footerH/2;
        
        // 상점 버튼
        this.shopBtn = this.add.text(60, btnY, '🏰 부대편성', {
            fontSize: '20px', fontStyle: 'bold', backgroundColor: '#444444', padding: { x: 20, y: 10 }, color: '#ffffff'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        
        this.shopBtn.on('pointerdown', () => this.toggleShop());

        // 취소 버튼
        this.undoBtn = this.add.text(w/2, btnY, '이동 취소', {
            fontSize: '20px', fontStyle: 'bold', backgroundColor: '#666666', padding: { x: 20, y: 10 }, color: '#ffffff'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        this.undoBtn.on('pointerdown', () => this.undoMove());

        // 턴 종료 버튼
        this.endTurnBtn = this.add.text(w - 80, btnY, '턴 종료', {
            fontSize: '20px', fontStyle: 'bold', backgroundColor: '#cc0000', padding: { x: 20, y: 10 }, color: '#ffffff'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        
        this.endTurnBtn.on('pointerdown', () => {
            if (this.selectedTargetId !== null) this.startBattle();
            else this.handleTurnEnd();
        });

        this.uiContainer.add([headerBg, this.statusText, this.coinText, footerBg, this.shopBtn, this.undoBtn, this.endTurnBtn]);
        
        // BGM 버튼은 코인 옆이나 적절한 곳으로 이동 (여기서는 공간 부족으로 생략하거나 코인 옆에 배치)
        this.bgmBtn = this.add.text(140, headerY + headerH/2, "🔊", { fontSize: '20px' }).setOrigin(0, 0.5).setInteractive();
        this.bgmBtn.on('pointerdown', () => {
            const isMuted = this.toggleBgmMute();
            this.bgmBtn.setText(isMuted ? "🔇" : "🔊");
        });
        this.uiContainer.add(this.bgmBtn);

        this.updateUIState();
        this.createShopPopup(); // 팝업 재생성
    }

    // [New] 상점(부대 편성) 팝업 생성
    createShopPopup() {
        const { width, height } = this.scale;
        this.shopPopup = this.add.container(width/2, height/2).setDepth(2000).setVisible(false);
        
        const popupW = Math.min(600, width * 0.9);
        const popupH = Math.min(400, height * 0.7);
        
        const bg = this.add.rectangle(0, 0, popupW, popupH, 0x222222).setStrokeStyle(4, 0xffcc00);
        const title = this.add.text(0, -popupH/2 + 30, "용병 고용", { fontSize: '24px', fontStyle: 'bold', fill: '#ffcc00' }).setOrigin(0.5);
        
        const closeBtn = this.add.text(popupW/2 - 30, -popupH/2 + 30, "X", { fontSize: '24px', fill: '#ffffff' }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', () => this.toggleShop());

        this.shopPopup.add([bg, title, closeBtn]);

        // 유닛 리스트 (그리드 형태)
        const startX = -popupW/2 + 60;
        const startY = -popupH/2 + 80;
        const gapX = 120;
        const gapY = 100;
        
        UNIT_COSTS.forEach((unit, index) => {
            const row = Math.floor(index / 3); // 3열
            const col = index % 3;
            const x = startX + col * gapX;
            const y = startY + row * gapY;

            // 모바일 대응: 화면 좁으면 2열로
            // 간단하게 구현:
            
            const btn = this.add.container(x, y);
            const btnBg = this.add.rectangle(0, 0, 100, 80, 0x444444).setInteractive();
            const nameTxt = this.add.text(0, -15, unit.name, { fontSize: '16px' }).setOrigin(0.5);
            const costTxt = this.add.text(0, 15, `💰 ${unit.cost}`, { fontSize: '14px', color: '#ffff00' }).setOrigin(0.5);
            
            btn.add([btnBg, nameTxt, costTxt]);
            
            btnBg.on('pointerdown', () => this.buyUnit(unit));
            
            this.shopPopup.add(btn);
        });
        
        // 현재 부대 정보 표시
        const squadInfoY = popupH/2 - 40;
        this.squadCountText = this.add.text(0, squadInfoY, `현재 부대원: ${this.getSquadCount()}명`, { fontSize: '18px', color: '#aaaaaa' }).setOrigin(0.5);
        this.shopPopup.add(this.squadCountText);

        this.uiContainer.add(this.shopPopup);
    }

    toggleShop() {
        if (!this.shopPopup) return;
        this.isShopOpen = !this.isShopOpen;
        this.shopPopup.setVisible(this.isShopOpen);
        
        if(this.isShopOpen) {
            this.squadCountText.setText(`현재 부대원: ${this.getSquadCount()}명`);
        }
    }

    buyUnit(unitConfig) {
        const currentCoins = this.registry.get('playerCoins');
        if (currentCoins >= unitConfig.cost) {
            // 코인 차감
            const newCoins = currentCoins - unitConfig.cost;
            this.registry.set('playerCoins', newCoins);
            this.coinText.setText(`💰 ${newCoins}냥`);
            
            // 부대 추가
            const squad = this.registry.get('playerSquad');
            squad.push({ role: unitConfig.role });
            this.registry.set('playerSquad', squad);
            
            this.squadCountText.setText(`현재 부대원: ${squad.length}명`);
            
            // 효과
            this.cameras.main.shake(50, 0.005);
        } else {
            this.cameras.main.shake(100, 0.01); // 돈 부족 피드백
        }
    }

    getSquadCount() {
        return this.registry.get('playerSquad').length;
    }

    updateUIState() {
        if (!this.undoBtn || !this.endTurnBtn) return;

        if (this.hasMoved && this.previousLeaderId !== null) {
            this.undoBtn.setVisible(true);
            this.shopBtn.setVisible(false); // 이동 후에는 상점 이용 불가 (선택사항)
        } else {
            this.undoBtn.setVisible(false);
            this.shopBtn.setVisible(true);
        }

        if (this.selectedTargetId !== null && this.selectedTargetId !== undefined) {
            this.endTurnBtn.setText("전투 시작");
            this.endTurnBtn.setStyle({ backgroundColor: '#ff0000' });
        } else {
            this.endTurnBtn.setText("턴 종료");
            this.endTurnBtn.setStyle({ backgroundColor: '#cc0000' });
        }
    }

    // ... (resizeUI, moveLeaderToken 등 기존 로직 동일) ...
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
            startNode.owner = 'player'; startNode.name = "Main Base";
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