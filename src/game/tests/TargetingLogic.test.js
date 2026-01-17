import { describe, it, expect, vi } from 'vitest';
// [Fix] 실제 로직을 Import하여 테스트 (인라인 정의 제거)
import { calculateBestTarget } from '../objects/UnitAI';

// Phaser Mocking (UnitAI import 시 필요할 수 있음)
vi.mock('phaser', () => {
    return {
        default: {
            Math: {
                Vector2: class { constructor(x=0, y=0){this.x=x;this.y=y;} },
                Distance: {
                    Between: (x1, y1, x2, y2) => Math.sqrt((x1 - x2)**2 + (y1 - y2)**2),
                    Squared: (x1, y1, x2, y2) => (x1 - x2)**2 + (y1 - y2)**2
                },
                Angle: { Between: () => 0 }
            },
            Geom: { Line: class {}, Intersects: { LineToRectangle: () => false } }
        }
    };
});

describe('🎯 타겟 선정 로직 (Priority System)', () => {
    const me = { x: 0, y: 0, id: 'me', scene: { time: { now: 1000 } } };

    it('우선순위 2: 어그로가 없다면, 거리가 더 가까운 적을 선택해야 한다', () => {
        const enemyFar = { id: 'far', x: 100, y: 0, hp: 100, active: true, ai: {} };
        const enemyClose = { id: 'close', x: 50, y: 0, hp: 100, active: true, ai: {} };

        const target = calculateBestTarget(me, [enemyFar, enemyClose]);
        expect(target.id).toBe('close');
    });

    it('우선순위 3: 거리가 비슷하다면(5px 이내), 체력이 낮은 적을 선택해야 한다', () => {
        const enemyHighHp = { id: 'highHp', x: 100, y: 0, hp: 100, active: true, ai: {} };
        const enemyLowHp = { id: 'lowHp', x: 102, y: 0, hp: 10, active: true, ai: {} };

        const target = calculateBestTarget(me, [enemyHighHp, enemyLowHp]);
        expect(target.id).toBe('lowHp');
    });

    it('우선순위 1: 거리가 멀어도 나를 공격하는(Aggro) 적을 최우선으로 선택해야 한다', () => {
        const enemyCloseIdle = { 
            id: 'idle', x: 50, y: 0, hp: 100, active: true, ai: { currentTarget: null } 
        };
        const enemyFarAggro = { 
            id: 'aggro', x: 200, y: 0, hp: 100, active: true, ai: { currentTarget: me } 
        };

        const target = calculateBestTarget(me, [enemyCloseIdle, enemyFarAggro]);
        expect(target.id).toBe('aggro');
    });

    it('Hysteresis: 거리가 5px 이내로 조금만 더 가까운 경우는 타겟을 바꾸지 말아야 한다 (기존 타겟 유지 시뮬레이션)', () => {
        const enemy1 = { id: 'e1', x: 100, y: 0, hp: 100, active: true, ai: {} };
        const enemy2 = { id: 'e2', x: 97, y: 0, hp: 100, active: true, ai: {} }; // 3px 더 가까움

        // 배열 순서가 [e1, e2] 일 때, e1이 먼저 선택된 후 e2와 비교됨.
        // e2가 3px 더 가깝지만, 5px 임계값을 넘지 못하므로 e1 유지
        const target = calculateBestTarget(me, [enemy1, enemy2]);
        
        expect(target.id).toBe('e1'); 
    });
});