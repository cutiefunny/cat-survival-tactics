import Phaser from 'phaser';
import territoryConfig from '../data/TerritoryConfig.json'; 
import pathData from '../data/path.json'; 
import { LEVEL_KEYS } from '../managers/LevelManager'; 

export default class StrategyMapManager {
    constructor(scene) {
        this.scene = scene;
        this.mapNodes = [];
        this.nodeContainer = null;
        this.graphicsLayer = null;
        this.mapWidth = 0;
        this.mapHeight = 0;
    }

    // 맵 데이터 초기화 및 시각적 요소 생성
    initialize(map, dbArmyData) {
        this.mapWidth = map.widthInPixels;
        this.mapHeight = map.heightInPixels;

        // 1. 데이터 파싱
        this.parseMapData(map, dbArmyData);
        
        // 2. 그래픽 레이어 (연결선)
        this.graphicsLayer = this.scene.add.graphics();
        this.graphicsLayer.setDepth(100);
        this.drawConnections();

        // 3. 노드(영토) 생성
        this.createTerritoryNodes();
    }

    parseMapData(map, dbArmyData = {}) {
        const existingData = this.scene.registry.get('worldMapData');
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
                    // [Fix] config에서 조건(win 등)을 읽어오도록 추가
                    script_condition: config.script_condition || null,
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

        this.mapNodes = nodes;
        this.scene.registry.set('worldMapData', nodes);
    }

    createTerritoryNodes() {
        if (!this.mapNodes) return;
        
        // 기존 컨테이너가 있다면 제거
        if (this.nodeContainer) {
            this.nodeContainer.destroy();
        }

        this.nodeContainer = this.scene.add.group();
        
        this.mapNodes.forEach(node => {
            let color = 0xff4444; 
            if (node.owner === 'player') color = 0x4488ff; 
            else if (node.owner === 'neutral') color = 0x888888; 
            
            const shadow = this.scene.add.ellipse(node.x, node.y + 8, 20, 6, 0x000000, 0.3); 
            shadow.setDepth(100); 
            
            const circle = this.scene.add.circle(node.x, node.y, 13, color)
                .setInteractive({ useHandCursor: true })
                .setStrokeStyle(2, 0xffffff);
            
            circle.setAlpha(0.5); 
            circle.nodeData = node; 
            circle.setDepth(100); 
            
            circle.on('pointerdown', () => {
                // Scene의 메서드 호출
                // UI Manager 제어는 Scene이나 UI Manager가 담당하는 것이 좋지만,
                // 여기서는 Scene을 통해 중계합니다.
                if(this.scene.uiManager.shopModal.isOpen) this.scene.uiManager.shopModal.toggle();
                if(this.scene.uiManager.systemModal.isOpen) this.scene.uiManager.systemModal.toggle();
                
                this.scene.selectTerritory(circle);
            });
            
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

    findPath(startId, endId) {
        if (startId === endId) return [startId];
        
        const queue = [[startId]];
        const visited = new Set([startId]);
        
        while (queue.length > 0) {
            const path = queue.shift();
            const lastNodeId = path[path.length - 1];
            
            const node = this.mapNodes.find(n => n.id === lastNodeId);
            if (!node) continue;

            for (const neighborId of node.connectedTo) {
                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    const newPath = [...path, neighborId];
                    
                    if (neighborId === endId) {
                        return newPath; 
                    }
                    queue.push(newPath);
                }
            }
        }
        return null; 
    }

    // 특정 노드의 색상을 변경하는 헬퍼 메서드
    setNodeColor(nodeId, color) {
        if (!this.nodeContainer) return;
        const circle = this.nodeContainer.getChildren().find(c => c.nodeData && c.nodeData.id === nodeId);
        if (circle) circle.setFillStyle(color);
    }

    // 모든 노드의 알파값/스케일 리셋
    resetNodesVisual() {
        if (!this.nodeContainer) return;
        this.nodeContainer.getChildren().forEach(c => { 
            if (c instanceof Phaser.GameObjects.Arc) c.setAlpha(0.5); 
            c.scale = 1; 
        });
    }

    getNodeById(id) {
        return this.mapNodes.find(n => n.id === id);
    }

    getNodesByOwner(owner) {
        return this.mapNodes.filter(n => n.owner === owner);
    }
}