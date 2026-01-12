import { describe, it, expect } from 'vitest';
import { ROLE_BASE_STATS } from '../data/UnitData';

/**
 * [테스트 1] 데이터 무결성 검증
 * 게임 밸런스 데이터를 수정하다가 실수로 값을 빠뜨리는 것을 방지합니다.
 */
describe('🛡️ Unit Data Integrity', () => {
    const requiredStats = ['hp', 'attackPower', 'moveSpeed'];

    it('모든 역할(Role)은 필수 스탯(HP, 공격력, 이속)을 가지고 있어야 한다', () => {
        for (const [role, stats] of Object.entries(ROLE_BASE_STATS)) {
            requiredStats.forEach(key => {
                // 값이 존재하는지 확인
                expect(stats[key], `Error in [${role}]: missing '${key}'`).toBeDefined();
                // 숫자가 맞는지 확인
                expect(typeof stats[key], `Error in [${role}]: '${key}' must be a number`).toBe('number');
                // 음수가 아닌지 확인
                expect(stats[key], `Error in [${role}]: '${key}' must be positive`).toBeGreaterThan(0);
            });
        }
    });

    it('리더(Leader)는 보스급 보상(killReward >= 100)을 가져야 한다', () => {
        expect(ROLE_BASE_STATS['Leader'].killReward).toBeGreaterThanOrEqual(100);
    });

    it('원거리 유닛(Shooter)은 사정거리가 200 이상이어야 한다', () => {
        expect(ROLE_BASE_STATS['Shooter'].attackRange).toBeGreaterThanOrEqual(200);
    });
});

/**
 * [테스트 2] 전투 공식 검증
 * Unit.js의 takeDamage 메서드에 있는 로직을 순수 함수로 추출하여 테스트합니다.
 */
describe('⚔️ Combat Mechanics', () => {
    // 실제 게임 로직: Math.max(1, amount - this.defense)
    const calculateDamage = (attackPower, defense) => Math.max(1, attackPower - (defense || 0));

    it('방어력이 0일 때, 공격력만큼 피해를 입어야 한다', () => {
        expect(calculateDamage(50, 0)).toBe(50);
    });

    it('방어력이 있으면, 데미지가 감소해야 한다 (공격 30 - 방어 10 = 20)', () => {
        expect(calculateDamage(30, 10)).toBe(20);
    });

    it('방어력이 공격력보다 높아도 최소 1의 피해는 입어야 한다 (Hardcap)', () => {
        expect(calculateDamage(10, 999)).toBe(1);
    });
});

/**
 * [테스트 3] 진형(Formation) 계산 로직
 * 리더 이동 시 유닛들이 따라갈 상대 좌표 계산이 맞는지 확인합니다.
 */
describe('📐 Formation Logic', () => {
    // Unit.js의 로직 시뮬레이션
    const calculateOffset = (leaderX, leaderY, unitX, unitY) => {
        return { x: unitX - leaderX, y: unitY - leaderY };
    };

    it('리더를 기준으로 유닛의 상대 위치(Offset)를 정확히 계산해야 한다', () => {
        const leaderPos = { x: 100, y: 100 };
        const unitPos = { x: 120, y: 80 }; // 리더보다 오른쪽(+20), 위쪽(-20)

        const offset = calculateOffset(leaderPos.x, leaderPos.y, unitPos.x, unitPos.y);

        expect(offset.x).toBe(20);
        expect(offset.y).toBe(-20);
    });
});

/**
 * [테스트 4] 쿨타임 로직
 * 공격 속도(Cooldown) 계산이 올바른지 확인합니다.
 */
describe('⏱️ Cooldown Logic', () => {
    // CombatManager.js 로직 시뮬레이션
    // if (now > attacker.lastAttackTime + attacker.attackCooldown)
    const canAttack = (now, lastAttackTime, cooldown) => {
        return now > lastAttackTime + cooldown;
    };

    it('쿨타임이 지나지 않았으면 공격 불가', () => {
        const now = 1000;
        const lastAttack = 800;
        const cooldown = 500; // 800 + 500 = 1300까지 기다려야 함
        
        expect(canAttack(now, lastAttack, cooldown)).toBe(false);
    });

    it('쿨타임이 지났으면 공격 가능', () => {
        const now = 1400;
        const lastAttack = 800;
        const cooldown = 500; // 1300 이후부터 가능
        
        expect(canAttack(now, lastAttack, cooldown)).toBe(true);
    });
});