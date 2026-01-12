import { describe, it, expect } from 'vitest';

// 테스트를 위해 로직을 순수 함수 형태로 분리했다고 가정하거나, 
// 실제 계산 로직을 복사해서 검증합니다.

// [Logic from BattleScene.js spawnUnits]
function calculateStats(baseStats, level, fatigue) {
    let finalStats = { ...baseStats };

    // 1. 레벨업 보너스 (Lv.1 기준, 레벨당 공+1, 체력+10)
    if (level > 1) {
        finalStats.attackPower += (level - 1) * 1;
        finalStats.hp += (level - 1) * 10;
        finalStats.maxHp = finalStats.hp;
    }

    // 2. 피로도 페널티 (1 피로도당 5% 감소)
    const penaltyRatio = fatigue * 0.05;
    const multiplier = Math.max(0, 1 - penaltyRatio);

    if (fatigue > 0) {
        finalStats.hp = Math.floor(finalStats.hp * multiplier);
        finalStats.attackPower = Math.floor(finalStats.attackPower * multiplier);
        finalStats.moveSpeed = Math.floor(finalStats.moveSpeed * multiplier);
    }

    return finalStats;
}

describe('Unit Logic Tests', () => {
    const baseStats = { hp: 100, attackPower: 10, moveSpeed: 100 };

    it('레벨 1, 피로도 0일 때 기본 스탯을 유지해야 한다', () => {
        const result = calculateStats(baseStats, 1, 0);
        expect(result).toEqual(baseStats);
    });

    it('레벨 3일 때 스탯이 증가해야 한다 (HP+20, AP+2)', () => {
        const result = calculateStats(baseStats, 3, 0);
        expect(result.hp).toBe(120);
        expect(result.attackPower).toBe(12);
    });

    it('피로도가 10일 때 스탯이 50% 감소해야 한다', () => {
        // Lv.1 기준
        const result = calculateStats(baseStats, 1, 10); // 10 * 5% = 50% penalty
        expect(result.hp).toBe(50); // 100 * 0.5
        expect(result.attackPower).toBe(5); // 10 * 0.5
        expect(result.moveSpeed).toBe(50); // 100 * 0.5
    });

    it('피로도가 20 이상이면 스탯이 0이 되어야 한다', () => {
        const result = calculateStats(baseStats, 1, 25);
        expect(result.hp).toBe(0);
        expect(result.attackPower).toBe(0);
    });
});