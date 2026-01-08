import Phaser from 'phaser';
import sangsuMap from '../../assets/maps/sangsu_map.json'; 
import territoryConfig from '../data/TerritoryConfig.json'; 
import { LEVEL_KEYS } from '../managers/LevelManager'; 
import leaderImg from '../../assets/units/leader.png';
import dogImg from '../../assets/units/dog.png';
import sangsuTilesImg from '../../assets/tilesets/sangsu_map.jpg';

import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";

export default class StrategyScene extends Phaser.Scene {
    constructor() {
        super({ key: 'StrategyScene' });
    }

    init(data) {
        if (data && data.battleResult) {
            this.battleResultData = data.battleResult;
        }
    }

    preload() {
        this.load.tilemapTiledJSON('strategy_map', sangsuMap);
        this.load.image('sangsu_tiles', sangsuTilesImg);
        
        this.load.spritesheet('leader_token', leaderImg, { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('dog_token', dogImg, { frameWidth: 100, frameHeight: 100 });
    }

    create() {
        this.scene.stop('UIScene');
        this.cameras.main.setBackgroundColor('#111');

        this.input.addPointer(1);
        this.createAnimations();

        const map = this.make.tilemap({ key: 'strategy_map' });
        const tilesetName = map.tilesets[0].name;
        const tileset = map.addTilesetImage(tilesetName, 'sangsu_tiles');

        if (tileset) {
            map.layers.forEach(layerData => {
                map.createLayer(layerData.name, tileset, 0, 0);
            });
        }

        // DB 설정 로드 (비동기) -> 이후 initializeGameWorld 호출
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
        // [Init] 턴 상태 변수 초기화
        this.hasMoved = false;
        this.previousLeaderId = null;

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
                battleResultMessage = "🏳️ 패배... 본부로 후퇴합니다.";
            }
            this.battleResultData = null;
        }

        this.graphicsLayer = this.add.graphics();
        this.drawConnections();
        this.createTerritoryNodes();
        this.createPlayerToken();
        this.createEnemyTokens();

        // UI 카메라 설정
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        this.uiCamera.ignore(this.children.list);
        
        // [Important] UI 생성 함수 호출
        this.createUI();
        
        if (battleResultMessage) {
            this.statusText.setText(battleResultMessage);
        }
        
        // 초기 UI 상태 업데이트
        this.updateUIState();

        this.cameras.main.ignore(this.uiContainer);

        this.mapWidth = map.widthInPixels;
        this.mapHeight = map.heightInPixels;
        this.updateCameraLayout();

        this.scale.on('resize', (gameSize, baseSize, displaySize, previousWidth, previousHeight) => {
            this.updateCameraLayout();
            this.resizeUI();
        }, this);

        this.setupCameraControls();

        this.selectedTargetId = null;
        this.prevPinchDistance = 0;
    }

    // [Fix] 누락되었던 createUI 메서드 정의
    createUI() {
        this.uiContainer = this.add.container(0, 0);
        this.uiContainer.setScrollFactor(0); 
        this.drawUIElements();
    }

    // [Fix] UI 요소 그리기 메서드
    drawUIElements() {
        if (this.uiContainer.list.length > 0) {
            this.uiContainer.removeAll(true);
        }

        const w = this.scale.width;
        const h = this.scale.height;
        const headerH = 60;
        const footerH = 80;

        const headerBg = this.add.rectangle(0, 0, w, headerH, 0x000000, 0.85).setOrigin(0, 0);
        
        const currentStatusMsg = (this.statusText && this.statusText.active) ? this.statusText.text : '이동할 영토를 선택하세요.';
        this.statusText = this.add.text(w - 20, headerH/2, currentStatusMsg, { 
            fontSize: '16px', color: '#dddddd', align: 'right' 
        }).setOrigin(1, 0.5);

        const footerBg = this.add.rectangle(0, h, w, footerH, 0x000000, 0.85).setOrigin(0, 1);

        // 취소(Undo) 버튼
        this.undoBtn = this.add.text(w/2 - 120, h - footerH/2, '취소', {
            fontSize: '24px', fontStyle: 'bold', backgroundColor: '#666666', padding: { x: 30, y: 15 }, color: '#ffffff', align: 'center'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        this.undoBtn.on('pointerover', () => this.undoBtn.setBackgroundColor('#888888'));
        this.undoBtn.on('pointerout', () => this.undoBtn.setBackgroundColor('#666666'));
        this.undoBtn.on('pointerdown', () => this.undoMove());

        // 턴 종료 버튼
        this.endTurnBtn = this.add.text(w/2 + 40, h - footerH/2, '턴 종료', {
            fontSize: '24px', fontStyle: 'bold', backgroundColor: '#cc0000', padding: { x: 40, y: 15 }, color: '#ffffff', align: 'center'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        this.endTurnBtn.on('pointerover', () => this.endTurnBtn.setBackgroundColor('#ff4444'));
        this.endTurnBtn.on('pointerout', () => this.endTurnBtn.setBackgroundColor('#cc0000'));
        this.endTurnBtn.on('pointerdown', () => {
            if (this.selectedTargetId !== null) {
                this.startBattle();
            } else {
                this.handleTurnEnd();
            }
        });

        this.uiContainer.add([headerBg, footerBg, this.statusText, this.undoBtn, this.endTurnBtn]);
        this.updateUIState();
    }

    updateUIState() {
        if (!this.undoBtn || !this.endTurnBtn) return;

        if (this.hasMoved && this.previousLeaderId !== null) {
            this.undoBtn.setVisible(true);
            this.endTurnBtn.setX(this.scale.width / 2 + 50); 
            this.undoBtn.setX(this.scale.width / 2 - 90);
        } else {
            this.undoBtn.setVisible(false);
            this.endTurnBtn.setX(this.scale.width / 2);
        }
    }

    resizeUI() {
        this.uiCamera.setViewport(0, 0, this.scale.width, this.scale.height);
        this.drawUIElements();
    }

    moveLeaderToken(targetNode, onCompleteCallback) {
        this.input.enabled = false; 

        if (targetNode.x < this.leaderObj.x) {
            this.leaderObj.setFlipX(false);
        } else {
            this.leaderObj.setFlipX(true);
        }

        this.leaderObj.play('leader_walk');

        this.tweens.add({
            targets: this.leaderObj,
            x: targetNode.x,
            y: targetNode.y,
            duration: 1000,
            ease: 'Power2',
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
            this.hasMoved = false;
            this.previousLeaderId = null;
            this.statusText.setText(`📍 복귀 완료: ${prevNode.name}`);
            this.updateUIState();
        });
    }

    selectTerritory(circleObj) {
        const node = circleObj.nodeData;
        const currentLeaderId = this.registry.get('leaderPosition');
        const currentNode = this.mapNodes.find(n => n.id === currentLeaderId);

        if (this.hasMoved) {
            this.statusText.setText("🚫 이미 이동했습니다. [취소]하거나 [턴 종료] 하세요.");
            this.tweens.add({ targets: this.statusText, alpha: 0.5, duration: 100, yoyo: true, repeat: 1 });
            return;
        }

        if (node.id === currentLeaderId) {
            this.statusText.setText(`📍 현재 위치: ${node.name}`);
            return;
        }

        const isConnected = currentNode.connectedTo.includes(node.id);

        if (!isConnected) {
            this.statusText.setText("🚫 너무 멉니다! 연결된 지역(1칸)으로만 이동 가능합니다.");
            this.tweens.add({ targets: circleObj, x: circleObj.x + 5, duration: 50, yoyo: true, repeat: 3 });
            return;
        }

        if (node.owner === 'player') {
            this.statusText.setText(`🚶 이동 중: ${node.name}...`);
            
            if (this.selectionTween) {
                this.selectionTween.stop();
                this.selectionTween = null;
                this.nodeContainer.getChildren().forEach(c => {
                    if (c instanceof Phaser.GameObjects.Arc) c.setAlpha(0.5); 
                    c.scale = 1;
                });
            }
            this.selectedTargetId = null;

            this.previousLeaderId = currentLeaderId;

            this.moveLeaderToken(node, () => {
                this.hasMoved = true; 
                this.statusText.setText(`✅ ${node.name} 도착. (취소 가능)`);
                this.updateUIState();
            });
            return;
        }

        this.selectedTargetId = node.id;
        
        let infoText = "";
        if (node.army) {
            infoText = ` (적군 발견: ${node.army.count}마리)`;
        }
        this.statusText.setText(`🎯 목표 설정: ${node.name}${infoText}`);
        
        this.nodeContainer.getChildren().forEach(c => {
            if (c instanceof Phaser.GameObjects.Arc) c.setAlpha(0.5); 
        });
        circleObj.setAlpha(1.0);
        
        if (this.selectionTween) this.selectionTween.stop();
        this.selectionTween = this.tweens.add({
            targets: circleObj, scale: { from: 1, to: 1.3 }, yoyo: true, repeat: -1, duration: 600
        });
    }

    handleTurnEnd() {
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

        this.cameras.main.flash(500, 0, 0, 0); 
        this.statusText.setText("🌙 턴 종료. 행동력이 회복되었습니다.");
        
        this.updateUIState();
    }

    startBattle() {
        const targetNode = this.mapNodes.find(n => n.id === this.selectedTargetId);
        console.log(`⚔️ Attacking ${targetNode.name}`);
        
        this.previousLeaderId = null;
        this.updateUIState();

        this.moveLeaderToken(targetNode, () => {
            const selectedLevelIndex = targetNode ? (targetNode.levelIndex || 0) : 0;
            
            this.scene.start('BattleScene', {
                isStrategyMode: true,
                targetNodeId: this.selectedTargetId,
                levelIndex: selectedLevelIndex,
                currentCoins: this.registry.get('playerCoins') || 100,
                armyConfig: targetNode.army || null
            });
        });
    }

    createAnimations() {
        if (!this.anims.exists('leader_idle')) {
            this.anims.create({ key: 'leader_idle', frames: this.anims.generateFrameNumbers('leader_token', { frames: [0] }), frameRate: 1, repeat: -1 });
        }
        if (!this.anims.exists('leader_walk')) {
            this.anims.create({ key: 'leader_walk', frames: this.anims.generateFrameNumbers('leader_token', { frames: [1, 2] }), frameRate: 6, repeat: -1 });
        }
        if (!this.anims.exists('dog_idle')) {
            this.anims.create({ key: 'dog_idle', frames: this.anims.generateFrameNumbers('dog_token', { frames: [0] }), frameRate: 1, repeat: -1 });
        }
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
        } else {
            this.prevPinchDistance = 0;
        }
    }

    updateCameraLayout() {
        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;
        const isPC = this.sys.game.device.os.desktop;
        const zoomFitWidth = screenWidth / this.mapWidth;
        const zoomFitHeight = screenHeight / this.mapHeight;
        this.minZoom = isPC ? zoomFitHeight : zoomFitWidth;
        if (this.cameras.main.zoom < this.minZoom || this.cameras.main.zoom === 1) {
            this.cameras.main.setZoom(this.minZoom);
        }
        const currentZoom = this.cameras.main.zoom;
        const displayWidth = screenWidth / currentZoom;
        const displayHeight = screenHeight / currentZoom;
        const offsetX = Math.max(0, (displayWidth - this.mapWidth) / 2);
        const offsetY = Math.max(0, (displayHeight - this.mapHeight) / 2);
        this.cameras.main.setBounds(-offsetX, -offsetY, Math.max(this.mapWidth, displayWidth), Math.max(this.mapHeight, displayHeight));
        this.cameras.main.centerOn(this.mapWidth / 2, this.mapHeight / 2);
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
            if (layers && Object.keys(layers).length > 0) {
                objectLayer = layers[Object.keys(layers)[0]];
            }
        }

        let nodes = [];
        if (objectLayer && objectLayer.objects) {
            nodes = objectLayer.objects.map(obj => {
                const config = territoryConfig.territories[obj.id.toString()] || territoryConfig.default;
                const levelIdx = LEVEL_KEYS.indexOf(config.mapId);
                const finalLevelIndex = levelIdx >= 0 ? levelIdx : 0;
                
                const savedNode = existingData ? existingData.find(n => n.id === obj.id) : null;
                const owner = savedNode ? savedNode.owner : 'enemy';

                let armyData = null;
                if (savedNode) {
                    if (savedNode.owner === 'player' || savedNode.army === null) {
                        armyData = null;
                    } else {
                        if (dbArmyData && dbArmyData[obj.id.toString()]) {
                            armyData = dbArmyData[obj.id.toString()];
                        } else {
                            armyData = savedNode.army;
                        }
                    }
                } else {
                    if (dbArmyData && dbArmyData[obj.id.toString()]) {
                        armyData = dbArmyData[obj.id.toString()];
                    }
                }

                return {
                    id: obj.id, x: obj.x, y: obj.y,
                    name: config.name || obj.name || `Territory ${obj.id}`,
                    owner: owner, 
                    connectedTo: [], 
                    levelIndex: finalLevelIndex, 
                    desc: config.description || "",
                    army: armyData 
                };
            });
        } else {
            nodes = [{ id: 1, x: 200, y: 300, owner: 'player', name: 'Base', connectedTo: [], levelIndex: 0 }, { id: 2, x: 400, y: 300, owner: 'enemy', name: 'Target', connectedTo: [], levelIndex: 0 }];
        }
        
        if (!existingData && nodes.length > 0) {
            let startNode = nodes.reduce((prev, curr) => {
                const prevScore = prev.y - prev.x;
                const currScore = curr.y - curr.x;
                return (currScore > prevScore) ? curr : prev;
            });
            startNode.owner = 'player';
            startNode.name = "Main Base";
        }

        nodes.forEach(node => {
            const others = nodes.filter(n => n.id !== node.id).map(n => ({
                id: n.id, dist: Phaser.Math.Distance.Between(node.x, node.y, n.x, n.y)
            }));
            others.sort((a, b) => a.dist - b.dist);
            const neighbors = others.slice(0, 2);
            neighbors.forEach(nb => {
                if (!node.connectedTo.includes(nb.id)) node.connectedTo.push(nb.id);
                const targetNode = nodes.find(n => n.id === nb.id);
                if (targetNode && !targetNode.connectedTo.includes(node.id)) {
                    targetNode.connectedTo.push(node.id);
                }
            });
        });

        this.registry.set('worldMapData', nodes);
    }

    createEnemyTokens() {
        if (!this.mapNodes) return;
        this.mapNodes.forEach(node => {
            if (node.owner !== 'player' && node.army) {
                const textureKey = node.army.type === 'dog' ? 'dog_token' : 'dog_token';
                const enemyObj = this.add.sprite(node.x, node.y, textureKey);
                enemyObj.setDisplaySize(50, 50);
                enemyObj.setOrigin(0.5, 0.8);
                enemyObj.setFlipX(false); 
                if (node.army.type === 'dog' || !node.army.type) { 
                    enemyObj.play('dog_idle');
                }
                this.tweens.add({
                    targets: enemyObj, scaleY: { from: enemyObj.scaleY, to: enemyObj.scaleY * 0.95 },
                    yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut'
                });
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
            this.leaderObj.setFlipX(true);
            this.leaderObj.setDisplaySize(60, 60); 
            this.leaderObj.setOrigin(0.5, 0.8);
            this.leaderObj.play('leader_idle');
            this.tweens.add({
                targets: this.leaderObj, scaleY: { from: this.leaderObj.scaleY, to: this.leaderObj.scaleY * 0.95 },
                yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut'
            });
        }
    }

    createTerritoryNodes() {
        if (!this.mapNodes) return;
        this.nodeContainer = this.add.group();
        this.mapNodes.forEach(node => {
            const color = node.owner === 'player' ? 0x4488ff : 0xff4444;
            const shadow = this.add.ellipse(node.x, node.y + 8, 20, 6, 0x000000, 0.3);
            const circle = this.add.circle(node.x, node.y, 13, color).setInteractive({ useHandCursor: true }).setStrokeStyle(2, 0xffffff);
            circle.setAlpha(0.5);
            circle.nodeData = node;
            circle.on('pointerdown', () => this.selectTerritory(circle));
            this.nodeContainer.add(shadow);
            this.nodeContainer.add(circle);
        });
    }

    drawConnections() {
        if (!this.mapNodes) return;
        this.graphicsLayer.clear();
        this.graphicsLayer.lineStyle(2, 0x888888, 0.5);
        this.mapNodes.forEach(node => {
            node.connectedTo.forEach(targetId => {
                const target = this.mapNodes.find(n => n.id === targetId);
                if (target) {
                    this.graphicsLayer.lineBetween(node.x, node.y, target.x, target.y);
                }
            });
        });
    }

    handleBattleResult(data) {
        // create 메서드에서 처리하므로 비워둠
    }
}