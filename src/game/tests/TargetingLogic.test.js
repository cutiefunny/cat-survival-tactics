import { describe, it, expect, vi } from 'vitest';

// Phaser 객체 Mocking
const Phaser = {
    Math: {
        Distance: {
            Between: (x1, y1, x2, y2) => Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
        }
    }
};

// [Update] Tie-breaker 제거된 로직 반영
function findBestTarget(me, enemies) {
    let bestTarget = null;
    let bestIsAggro = false;
    let bestDist = Infinity;
    let bestHp = Infinity;

    for (const enemy of enemies) {
        if (!enemy.active) continue;

        // [Priority 1] Aggro
        const isAggro = (enemy.ai && enemy.ai.currentTarget === me);
        
        // [Priority 2] Distance
        const dist = Phaser.Math.Distance.Between(me.x, me.y, enemy.x, enemy.y);
        
        // [Priority 3] HP
        const hp = enemy.hp;

        if (!bestTarget) {
            bestTarget = enemy;
            bestIsAggro = isAggro;
            bestDist = dist;
            bestHp = hp;
            continue;
        }

        // 1순위: Aggro
        if (isAggro !== bestIsAggro) {
            if (isAggro) { 
                bestTarget = enemy;
                bestIsAggro = isAggro;
                bestDist = dist;
                bestHp = hp;
            }
            continue; 
        }

        // 2순위: Distance (5px Hysteresis 적용)
        const distDiff = dist - bestDist;
        if (distDiff < -5) { 
            bestTarget = enemy;
            bestIsAggro = isAggro;
            bestDist = dist;
            bestHp = hp;
            continue;
        } else if (distDiff > 5) {
            continue;
        }

        // 3순위: HP (거리 차이가 5px 이내일 때)
        if (hp < bestHp) {
            bestTarget = enemy;
            bestIsAggro = isAggro;
            bestDist = dist;
            bestHp = hp;
        } 
        // [Fix] Distance Tie-breaker 제거: 체력이 같고 거리도 비슷하면 기존 타겟 유지
    }
    return bestTarget;
}

describe('🎯 타겟 선정 로직 (Priority System)', () => {
    const me = { x: 0, y: 0, id: 'me' };

    it('우선순위 2: 어그로가 없다면, 거리가 더 가까운 적을 선택해야 한다', () => {
        const enemyFar = { id: 'far', x: 100, y: 0, hp: 100, active: true, ai: {} };
        const enemyClose = { id: 'close', x: 50, y: 0, hp: 100, active: true, ai: {} };

        const target = findBestTarget(me, [enemyFar, enemyClose]);
        expect(target.id).toBe('close');
    });

    it('우선순위 3: 거리가 비슷하다면(5px 이내), 체력이 낮은 적을 선택해야 한다', () => {
        const enemyHighHp = { id: 'highHp', x: 100, y: 0, hp: 100, active: true, ai: {} };
        const enemyLowHp = { id: 'lowHp', x: 102, y: 0, hp: 10, active: true, ai: {} };

        const target = findBestTarget(me, [enemyHighHp, enemyLowHp]);
        expect(target.id).toBe('lowHp');
    });

    it('우선순위 1: 거리가 멀어도 나를 공격하는(Aggro) 적을 최우선으로 선택해야 한다', () => {
        const enemyCloseIdle = { 
            id: 'idle', x: 50, y: 0, hp: 100, active: true, ai: { currentTarget: null } 
        };
        const enemyFarAggro = { 
            id: 'aggro', x: 200, y: 0, hp: 100, active: true, ai: { currentTarget: me } 
        };

        const target = findBestTarget(me, [enemyCloseIdle, enemyFarAggro]);
        expect(target.id).toBe('aggro');
    });

    it('Hysteresis: 거리가 5px 이내로 조금만 더 가까운 경우는 타겟을 바꾸지 말아야 한다 (기존 타겟 유지 시뮬레이션)', () => {
        const enemy1 = { id: 'e1', x: 100, y: 0, hp: 100, active: true, ai: {} };
        const enemy2 = { id: 'e2', x: 97, y: 0, hp: 100, active: true, ai: {} }; // 3px 더 가까움

        // 배열 순서가 [e1, e2] 일 때, 3px 차이로는 e2로 교체되지 않아야 함
        const target = findBestTarget(me, [enemy1, enemy2]);
        
        expect(target.id).toBe('e1'); 
    });
});