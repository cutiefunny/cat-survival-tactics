import Phaser from 'phaser';

export default class PathfindingManager {
    constructor(scene) {
        this.scene = scene;
        this.grid = []; // 0: 이동 가능, 1: 장애물
        this.tileSize = 32; 
        this.mapWidth = 0;
        this.mapHeight = 0;
    }

    setup(tilemap, obstaclesLayers) {
        this.mapWidth = tilemap.width;
        this.mapHeight = tilemap.height;
        this.tileSize = tilemap.tileWidth;
        
        // 1. 그리드 초기화
        this.grid = Array(this.mapHeight).fill().map(() => Array(this.mapWidth).fill(0));

        // 2. 타일 레이어(Walls, Blocks) 분석
        obstaclesLayers.forEach(layer => {
            if (!layer) return;
            layer.forEachTile(tile => {
                if (tile.collides || tile.index !== -1) { 
                    this.grid[tile.y][tile.x] = 1;
                }
            });
        });

        // 3. Object Group (Blocks Object) 분석
        if (this.scene.blockObjectGroup) {
            this.scene.blockObjectGroup.getChildren().forEach(obj => {
                const bounds = obj.getBounds();
                const startX = Math.max(0, Math.floor(bounds.x / this.tileSize));
                const startY = Math.max(0, Math.floor(bounds.y / this.tileSize));
                const endX = Math.min(this.mapWidth - 1, Math.floor(bounds.right / this.tileSize));
                const endY = Math.min(this.mapHeight - 1, Math.floor(bounds.bottom / this.tileSize));

                for (let y = startY; y <= endY; y++) {
                    for (let x = startX; x <= endX; x++) {
                        this.grid[y][x] = 1;
                    }
                }
            });
        }
        
        console.log(`🧩 Pathfinding Grid Reset: ${this.mapWidth}x${this.mapHeight}`);
    }

    isValidTile(x, y) {
        return x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight;
    }

    // 직선 경로 체크 (장애물 유무만 판단)
    isLineClear(startWorld, endWorld) {
        const x0 = Math.floor(startWorld.x / this.tileSize);
        const y0 = Math.floor(startWorld.y / this.tileSize);
        const x1 = Math.floor(endWorld.x / this.tileSize);
        const y1 = Math.floor(endWorld.y / this.tileSize);

        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1;
        let sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        let cx = x0;
        let cy = y0;

        while (true) {
            if (!this.isValidTile(cx, cy) || this.grid[cy][cx] === 1) {
                return false; // 장애물 발견
            }
            if (cx === x1 && cy === y1) break; 

            let e2 = 2 * err;
            if (e2 > -dy) { err -= dy; cx += sx; }
            if (e2 < dx) { err += dx; cy += sy; }
        }
        return true; 
    }

    // 기본 A* 알고리즘
    findPath(startWorld, endWorld) {
        const startX = Math.floor(startWorld.x / this.tileSize);
        const startY = Math.floor(startWorld.y / this.tileSize);
        const endX = Math.floor(endWorld.x / this.tileSize);
        const endY = Math.floor(endWorld.y / this.tileSize);

        if (!this.isValidTile(startX, startY) || !this.isValidTile(endX, endY)) return null;
        if (this.grid[endY][endX] === 1) return null; 

        const startNode = { x: startX, y: startY, g: 0, h: 0, f: 0, parent: null };
        const openList = [startNode];
        const closedList = new Set();
        
        let loopCount = 0;
        const maxLoops = 1500; 

        while (openList.length > 0 && loopCount < maxLoops) {
            loopCount++;
            
            let lowestIndex = 0;
            for (let i = 1; i < openList.length; i++) {
                if (openList[i].f < openList[lowestIndex].f) lowestIndex = i;
            }
            const currentNode = openList[lowestIndex];

            if (currentNode.x === endX && currentNode.y === endY) {
                return this.reconstructPath(currentNode);
            }

            openList.splice(lowestIndex, 1);
            closedList.add(`${currentNode.x},${currentNode.y}`);

            const neighbors = [
                { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
                { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 } 
            ];

            for (const neighbor of neighbors) {
                const nx = currentNode.x + neighbor.x;
                const ny = currentNode.y + neighbor.y;

                if (!this.isValidTile(nx, ny) || this.grid[ny][nx] === 1 || closedList.has(`${nx},${ny}`)) continue;

                // 대각선 벽 뚫기 방지 (Corner Cutting Check)
                if (neighbor.x !== 0 && neighbor.y !== 0) {
                    if (this.grid[currentNode.y][currentNode.x + neighbor.x] === 1 || 
                        this.grid[currentNode.y + neighbor.y][currentNode.x] === 1) {
                        continue; 
                    }
                }

                const moveCost = (neighbor.x !== 0 && neighbor.y !== 0) ? 1.4 : 1;
                const gScore = currentNode.g + moveCost;

                let neighborNode = openList.find(n => n.x === nx && n.y === ny);

                if (!neighborNode) {
                    neighborNode = { x: nx, y: ny, g: gScore, h: 0, f: 0, parent: currentNode };
                    neighborNode.h = Math.abs(nx - endX) + Math.abs(ny - endY);
                    neighborNode.f = neighborNode.g + neighborNode.h;
                    openList.push(neighborNode);
                } else if (gScore < neighborNode.g) {
                    neighborNode.g = gScore;
                    neighborNode.f = neighborNode.g + neighborNode.h;
                    neighborNode.parent = currentNode;
                }
            }
        }
        return null; 
    }

    reconstructPath(node) {
        const path = [];
        let curr = node;
        while (curr.parent) {
            path.push({ 
                x: curr.x * this.tileSize + this.tileSize / 2, 
                y: curr.y * this.tileSize + this.tileSize / 2 
            });
            curr = curr.parent;
        }
        return path.reverse();
    }
}