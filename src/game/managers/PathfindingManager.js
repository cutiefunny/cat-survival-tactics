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

        // 4. Object Group (Walls Object) 분석
        if (this.scene.wallObjectGroup) {
            this.scene.wallObjectGroup.getChildren().forEach(obj => {
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

    /**
     * 특정 위치(x, y)에서 unitSize(타일 개수)만큼의 공간이 확보되었는지 확인
     * 예: unitSize가 2라면 (x,y), (x+1,y), (x,y+1), (x+1,y+1) 4칸을 검사
     */
    hasClearance(x, y, unitSize) {
        // 맵 범위를 벗어나는지 먼저 체크
        if (x + unitSize > this.mapWidth || y + unitSize > this.mapHeight) {
            return false;
        }

        for (let dy = 0; dy < unitSize; dy++) {
            for (let dx = 0; dx < unitSize; dx++) {
                const checkX = x + dx;
                const checkY = y + dy;

                if (!this.isValidTile(checkX, checkY) || this.grid[checkY][checkX] === 1) {
                    return false; // 장애물 발견
                }
            }
        }
        return true;
    }

    // 직선 경로 체크 (유닛 크기 고려)
    isLineClear(startWorld, endWorld, unitSize = 1) {
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
            // 해당 지점에서 유닛 크기만큼 공간이 있는지 체크
            if (!this.hasClearance(cx, cy, unitSize)) {
                return false; 
            }
            if (cx === x1 && cy === y1) break; 

            let e2 = 2 * err;
            if (e2 > -dy) { err -= dy; cx += sx; }
            if (e2 < dx) { err += dx; cy += sy; }
        }
        return true; 
    }

    /**
     * A* 경로 탐색
     * @param {object} startWorld - 시작 월드 좌표 {x, y}
     * @param {object} endWorld - 도착 월드 좌표 {x, y}
     * @param {number} unitSize - 유닛의 타일 단위 크기 (1: 일반, 2: 탱커 등)
     */
    findPath(startWorld, endWorld, unitSize = 1) {
        const startX = Math.floor(startWorld.x / this.tileSize);
        const startY = Math.floor(startWorld.y / this.tileSize);
        const endX = Math.floor(endWorld.x / this.tileSize);
        const endY = Math.floor(endWorld.y / this.tileSize);

        // 시작점과 목표 지점 유효성 및 공간 확보 체크
        if (!this.isValidTile(startX, startY) || !this.isValidTile(endX, endY)) return null;
        if (!this.hasClearance(endX, endY, unitSize)) return null; 

        const startNode = { x: startX, y: startY, g: 0, h: 0, f: 0, parent: null };
        const openList = [startNode];
        const closedList = new Set();
        
        let loopCount = 0;
        const maxLoops = 2000; // 큰 유닛일수록 탐색이 복잡할 수 있어 약간 늘림

        while (openList.length > 0 && loopCount < maxLoops) {
            loopCount++;
            
            let lowestIndex = 0;
            for (let i = 1; i < openList.length; i++) {
                if (openList[i].f < openList[lowestIndex].f) lowestIndex = i;
            }
            const currentNode = openList[lowestIndex];

            // 목표 도달 (목표 타일이 유닛의 좌상단 기준점이 됨)
            if (currentNode.x === endX && currentNode.y === endY) {
                return this.reconstructPath(currentNode, unitSize);
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

                // 이미 방문했거나 맵 밖인 경우 패스
                if (closedList.has(`${nx},${ny}`)) continue;

                // [핵심 변경] 단순 1x1 장애물 체크가 아니라, 유닛 크기(NxN)만큼 공간이 비었는지 확인
                if (!this.hasClearance(nx, ny, unitSize)) continue;

                // 대각선 이동 시 벽 뚫기 방지 (Corner Cutting Check)
                // 유닛 사이즈가 1보다 크면 hasClearance가 면적을 체크하므로 어느 정도 커버되지만,
                // 더욱 엄격하게 하려면 대각선 이동 시 인접한 두 축의 공간도 확인해야 함.
                if (neighbor.x !== 0 && neighbor.y !== 0) {
                     // 예: 오른쪽 아래로 갈 때, 오른쪽과 아래쪽 공간도 각각 확보되어야 함
                     if (!this.hasClearance(currentNode.x + neighbor.x, currentNode.y, unitSize) ||
                         !this.hasClearance(currentNode.x, currentNode.y + neighbor.y, unitSize)) {
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

    reconstructPath(node, unitSize) {
        const path = [];
        let curr = node;
        
        // 유닛 크기에 따른 중심점 오프셋 계산
        // unitSize가 1이면: 16 (기존과 동일)
        // unitSize가 2이면: 32 (2칸의 정중앙)
        const centerOffset = (this.tileSize * unitSize) / 2;

        while (curr.parent) {
            path.push({ 
                // 좌상단 좌표(curr.x * tileSize) + 유닛 전체 크기의 절반
                x: curr.x * this.tileSize + centerOffset, 
                y: curr.y * this.tileSize + centerOffset 
            });
            curr = curr.parent;
        }
        return path.reverse();
    }
}