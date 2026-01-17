import { describe, it, expect, vi, beforeEach } from 'vitest';
import UnitAI from '../objects/UnitAI';

// Phaser Mocking
vi.mock('phaser', () => {
    return {
        default: {
            Math: {
                Vector2: class {
                    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
                    set(x, y) { this.x = x; this.y = y; return this; }
                    copy(v) { this.x = v.x; this.y = v.y; return this; }
                    dot(v) { return this.x * v.x + this.y * v.y; }
                    negate() { this.x = -this.x; this.y = -this.y; return this; }
                    // [Fix] 실제 단위 벡터 변환 로직 추가
                    normalize() { 
                        const len = Math.sqrt(this.x * this.x + this.y * this.y);
                        if (len > 0) {
                            this.x /= len;
                            this.y /= len;
                        }
                        return this; 
                    }
                    scale(s) { this.x *= s; this.y *= s; return this; }
                    add(v) { this.x += v.x; this.y += v.y; return this; }
                },
                Distance: {
                    Between: (x1, y1, x2, y2) => Math.sqrt((x1 - x2)**2 + (y1 - y2)**2),
                    Squared: (x1, y1, x2, y2) => (x1 - x2)**2 + (y1 - y2)**2
                },
                Angle: {
                    Between: () => 0
                }
            },
            Geom: {
                Line: class {},
                Intersects: { LineToRectangle: () => false }
            }
        }
    };
});

describe('🚧 장애물 회피 및 끼임 탈출 테스트', () => {
    let ai;
    let mockUnit;
    let mockScene;

    beforeEach(() => {
        mockScene = {
            time: { now: 1000 },
            physics: { 
                moveTo: vi.fn(), 
                moveToObject: vi.fn() 
            },
            pathfindingManager: { 
                isLineClear: vi.fn(() => false), 
                findPath: vi.fn(() => [{x: 200, y: 200}]) 
            },
            wallLayer: null,
            blockLayer: null,
            blockObjectGroup: { getChildren: () => [], getLength: () => 0 }
        };
        
        mockUnit = {
            scene: mockScene,
            x: 100, y: 100,
            moveSpeed: 100,
            maxHp: 100, hp: 100,
            body: { 
                speed: 100, 
                velocity: { x: 0, y: 0 } 
            },
            setVelocity: vi.fn(),
            updateFlipX: vi.fn(),
            setFlipX: vi.fn(),
            resetVisuals: vi.fn(),
            setTint: vi.fn(),
            targetGroup: { getChildren: () => [] },
            team: 'blue',
            role: 'Normal',
            aiConfig: {}
        };

        ai = new UnitAI(mockUnit);
    });

    it('[Wall Slide] 오른쪽 장애물 충돌 시, 반발력(Repulsion)과 수직 방향(Sliding)이 합성되어야 한다', () => {
        const obstacle = { x: 150, y: 100, width: 32, height: 32 }; 
        ai.onWallCollision(obstacle);

        // [Fix] 테스트 기대값 수정: 반발력 때문에 왼쪽(-x)으로 밀려나야 정상
        expect(ai.wallCollisionVector.x).toBeLessThan(0); 
        expect(ai.wallCollisionVector.y).not.toBe(0); 
        expect(ai.wallCollisionTimer).toBe(250); 
    });

    it('[Stuck Detection] 이동 명령 중 속도가 0이면, 즉시 경로를 재탐색해야 한다', () => {
        ai.currentTarget = { x: 200, y: 200, active: true };
        ai.currentPath = [{ x: 150, y: 150 }, { x: 200, y: 200 }];
        
        mockUnit.body.speed = 0.1; 
        
        // [Fix] 실제 존재하는 메서드명으로 수정
        ai.moveToLocationSmart(ai.currentTarget.x, ai.currentTarget.y, 100);
        expect(ai.stuckTimer).toBe(100);
        
        // [Fix] 실제 존재하는 메서드명으로 수정
        ai.moveToLocationSmart(ai.currentTarget.x, ai.currentTarget.y, 150);
        
        expect(ai.stuckTimer).toBe(0); 
        expect(ai.currentPath.length).toBeGreaterThan(0); 
        expect(mockScene.pathfindingManager.findPath).toHaveBeenCalled();
    });

    it('[Normal Move] 끼임이 없다면 경로는 유지되어야 한다', () => {
        ai.currentTarget = { x: 200, y: 200, active: true };
        ai.currentPath = [{ x: 150, y: 150 }];
        
        mockUnit.body.speed = 100; 

        // [Fix] 실제 존재하는 메서드명으로 수정
        ai.moveToLocationSmart(ai.currentTarget.x, ai.currentTarget.y, 100);

        expect(ai.stuckTimer).toBe(0); 
        expect(ai.currentPath.length).toBe(1); 
    });
});