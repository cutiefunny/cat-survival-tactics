import Phaser from 'phaser';
import sangsuMap from '../../assets/maps/sangsu_map.json'; 
import territoryConfig from '../data/TerritoryConfig.json'; 
import { LEVEL_KEYS } from '../managers/LevelManager'; 

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
        this.load.image('sangsu_tiles', 'src/assets/tilesets/sangsu_map.jpg');
    }

    create() {
        this.scene.stop('UIScene');
        this.cameras.main.setBackgroundColor('#111');

        const map = this.make.tilemap({ key: 'strategy_map' });
        const tilesetName = map.tilesets[0].name;
        const tileset = map.addTilesetImage(tilesetName, 'sangsu_tiles');

        if (tileset) {
            map.layers.forEach(layerData => {
                map.createLayer(layerData.name, tileset, 0, 0);
            });
        }

        // 1. UI 생성
        this.createUI();

        // 2. 데이터 로드 및 파싱
        if (!this.registry.get('worldMapData')) {
            this.parseMapData(map);
        }
        this.mapNodes = this.registry.get('worldMapData');

        // 3. 전투 결과 데이터 업데이트
        if (this.battleResultData) {
            this.handleBattleResult(this.battleResultData);
            this.battleResultData = null;
        }

        // 4. 시각화
        this.graphicsLayer = this.add.graphics();
        this.drawConnections();
        this.createTerritoryNodes();

        // 5. 카메라 설정
        this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.cameras.main.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
        this.cameras.main.setZoom(1);
        this.setupCameraControls();

        this.createEndTurnButton();
        this.selectedTargetId = null;
    }

    parseMapData(map) {
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

                return {
                    id: obj.id,
                    x: obj.x,
                    y: obj.y,
                    name: config.name || obj.name || `Territory ${obj.id}`,
                    owner: 'enemy',
                    connectedTo: [],
                    levelIndex: finalLevelIndex,
                    desc: config.description || ""
                };
            });
        } else {
            nodes = [
                { id: 1, x: 200, y: 300, owner: 'player', name: 'Base', connectedTo: [], levelIndex: 0 },
                { id: 2, x: 400, y: 300, owner: 'enemy', name: 'Target', connectedTo: [], levelIndex: 0 }
            ];
        }

        // 시작 지점(왼쪽 아래) 설정
        if (nodes.length > 0) {
            let startNode = nodes.reduce((prev, curr) => {
                const prevScore = prev.y - prev.x;
                const currScore = curr.y - curr.x;
                return (currScore > prevScore) ? curr : prev;
            });
            startNode.owner = 'player';
            startNode.name = "Main Base";
        }

        // 거리 기반 자동 연결
        nodes.forEach(node => {
            const others = nodes.filter(n => n.id !== node.id).map(n => ({
                id: n.id,
                dist: Phaser.Math.Distance.Between(node.x, node.y, n.x, n.y)
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

    createUI() {
        this.add.text(20, 20, '🗺️ STRATEGY MAP', { fontSize: '32px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4 }).setScrollFactor(0);
        this.statusText = this.add.text(20, 60, 'Choose a territory to invade.', { fontSize: '18px', color: '#eeeeee', stroke: '#000000', strokeThickness: 2 }).setScrollFactor(0);
    }

    setupCameraControls() {
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            const newZoom = this.cameras.main.zoom - deltaY * 0.001;
            this.cameras.main.setZoom(Phaser.Math.Clamp(newZoom, 0.5, 3));
        });
        this.input.on('pointermove', (pointer) => {
            if (pointer.isDown) {
                this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
                this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
            }
        });
    }

    selectTerritory(circleObj) {
        const node = circleObj.nodeData;

        if (node.owner === 'player') {
            this.statusText.setText(`Defense Mode: ${node.name} (Your Territory)`);
            return;
        }

        const canInvade = node.connectedTo.some(id => {
            const neighbor = this.mapNodes.find(n => n.id === id);
            return neighbor.owner === 'player';
        });

        if (!canInvade) {
            this.statusText.setText("🚫 Too far to invade!");
            this.tweens.add({ targets: circleObj, x: circleObj.x + 5, duration: 50, yoyo: true, repeat: 3 });
            return;
        }

        this.selectedTargetId = node.id;
        const desc = node.desc ? `\n"${node.desc}"` : "";
        this.statusText.setText(`⚔️ TARGET: ${node.name}${desc}\nPress [BATTLE START] to invade!`);
        
        this.nodeContainer.getChildren().forEach(c => {
            if (c instanceof Phaser.GameObjects.Arc) c.setAlpha(0.5); 
        });
        circleObj.setAlpha(1.0);
        
        if (this.selectionTween) this.selectionTween.stop();
        this.selectionTween = this.tweens.add({
            targets: circleObj,
            scale: { from: 1, to: 1.3 },
            yoyo: true,
            repeat: -1,
            duration: 600
        });
    }

    createEndTurnButton() {
        const btn = this.add.text(this.cameras.main.width - 20, this.cameras.main.height - 20, '⚔️ BATTLE START', {
            fontSize: '24px', backgroundColor: '#cc0000', padding: { x: 20, y: 10 }, fontStyle: 'bold'
        }).setOrigin(1, 1).setInteractive({ useHandCursor: true }).setScrollFactor(0);

        btn.on('pointerdown', () => {
            if (this.selectedTargetId !== null) {
                this.startBattle();
            } else {
                this.statusText.setText("⚠️ Please select a red territory first!");
            }
        });
    }

    startBattle() {
        const targetNode = this.mapNodes.find(n => n.id === this.selectedTargetId);
        const selectedLevelIndex = targetNode ? (targetNode.levelIndex || 0) : 0;

        console.log(`Starting Battle at ${targetNode.name} (Level Index: ${selectedLevelIndex})`);

        this.scene.start('BattleScene', {
            isStrategyMode: true,
            targetNodeId: this.selectedTargetId,
            levelIndex: selectedLevelIndex,
            currentCoins: this.registry.get('playerCoins') || 100
        });
    }

    createTerritoryNodes() {
        if (!this.mapNodes) return;
        this.nodeContainer = this.add.group();

        this.mapNodes.forEach(node => {
            const color = node.owner === 'player' ? 0x4488ff : 0xff4444;
            
            const shadow = this.add.ellipse(node.x, node.y + 8, 20, 6, 0x000000, 0.3);
            const circle = this.add.circle(node.x, node.y, 13, color)
                .setInteractive({ useHandCursor: true })
                .setStrokeStyle(2, 0xffffff);
            
            circle.setAlpha(0.5);

            circle.nodeData = node;
            
            // [Modified] 텍스트 라벨 생성 부분을 주석 처리하여 숨김
            /*
            const label = this.add.text(node.x, node.y - 25, node.name, { fontSize: '12px', backgroundColor: '#00000088', padding: { x: 4, y: 2 }, align: 'center' }).setOrigin(0.5);
            */

            circle.on('pointerdown', () => this.selectTerritory(circle));

            this.nodeContainer.add(shadow);
            this.nodeContainer.add(circle);
            // this.nodeContainer.add(label); // 라벨 추가 제외
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
        const { targetNodeId, isWin, remainingCoins } = data;
        this.registry.set('playerCoins', remainingCoins);

        if (isWin) {
            const node = this.mapNodes.find(n => n.id === targetNodeId);
            if (node) {
                node.owner = 'player';
                this.registry.set('worldMapData', this.mapNodes);
            }
            this.statusText.setText("🏆 VICTORY! Territory Captured!");
        } else {
            this.statusText.setText("🏳️ DEFEAT... Retreating to base.");
        }
    }
}