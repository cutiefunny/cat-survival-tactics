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
                    normalize() { return this; }
                    scale() { return this; }
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
                // 장애물이 있어 직선 이동 불가 -> A* 로직 진입 유도
                isLineClear: vi.fn(() => false), 
                // 재탐색 시 새로운 경로 반환
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

    it('[Wall Slide] 오른쪽 장애물 충돌 시, 수직 방향(Sliding)으로 벡터가 설정되어야 한다', () => {
        const obstacle = { x: 150, y: 100, width: 32, height: 32 }; 
        ai.onWallCollision(obstacle);

        expect(ai.wallCollisionVector.x).toBe(0); 
        expect(ai.wallCollisionVector.y).not.toBe(0); 
        expect(ai.wallCollisionTimer).toBe(500);
    });

    it('[Stuck Detection] 이동 명령 중 속도가 0이면, 즉시 경로를 재탐색해야 한다', () => {
        // [상황] 기존 경로 존재
        ai.currentTarget = { x: 200, y: 200, active: true };
        ai.currentPath = [{ x: 150, y: 150 }, { x: 200, y: 200 }];
        
        // [조건] 유닛 멈춤 (끼임 발생)
        mockUnit.body.speed = 0.1; 
        
        // 1. 100ms 경과 (아직 임계값 미달)
        ai.moveToTargetSmart(100);
        expect(ai.stuckTimer).toBe(100);
        
        // 2. 150ms 추가 경과 (총 250ms > 200ms) -> 끼임 감지 발동!
        //    -> 경로 초기화 -> 즉시 findPath 호출 -> 새 경로 설정
        ai.moveToTargetSmart(150);
        
        // [검증] stuckTimer가 리셋되었는지 확인 (감지 성공)
        expect(ai.stuckTimer).toBe(0); 
        
        // [검증] 경로가 비어있는게 아니라, "새로운 경로가 채워져 있어야" 함 (복구 성공)
        // pathfindingManager.findPath가 호출되어 결과가 들어감
        expect(ai.currentPath.length).toBeGreaterThan(0); 
        
        // [검증] 재탐색 함수가 실제로 호출되었는지 확인
        expect(mockScene.pathfindingManager.findPath).toHaveBeenCalled();
    });

    it('[Normal Move] 끼임이 없다면 경로는 유지되어야 한다', () => {
        ai.currentTarget = { x: 200, y: 200, active: true };
        ai.currentPath = [{ x: 150, y: 150 }];
        
        mockUnit.body.speed = 100; // 정상 속도

        ai.moveToTargetSmart(100);

        expect(ai.stuckTimer).toBe(0); 
        expect(ai.currentPath.length).toBe(1); 
    });
});