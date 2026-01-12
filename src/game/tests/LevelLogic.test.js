import { describe, it, expect } from 'vitest';

/**
 * [테스트 대상 로직]
 * BattleScene.js의 finishGame 메서드에 있는 레벨업 로직을 함수화한 것입니다.
 * 실제 게임 코드와 동일한 알고리즘을 사용합니다.
 */
function processLevelUp(currentLevel, currentXp, gainedXp) {
    let level = currentLevel || 1;
    let xp = (currentXp || 0) + gainedXp;
    const logs = []; // 테스트 디버깅용 로그

    // 레벨업 요구 경험치: 현재 레벨 * 100
    // 예: Lv.1 -> 100xp, Lv.2 -> 200xp, Lv.3 -> 300xp 필요
    let reqXp = level * 100;

    while (xp >= reqXp) {
        xp -= reqXp;
        level++;
        logs.push(`Level Up! ${level - 1} -> ${level} (Consumed ${reqXp} XP)`);
        
        // 다음 레벨의 요구 경험치 갱신
        reqXp = level * 100;
    }

    return { level, xp, logs };
}

/**
 * [테스트 대상 로직]
 * BattleScene.js의 spawnUnits 메서드에 있는 스탯 보너스 로직입니다.
 */
function calculateStatsByLevel(baseStats, level) {
    const finalStats = { ...baseStats };
    
    // Lv.1 기준, 레벨당 공격력+1, 체력+10
    if (level > 1) {
        finalStats.attackPower += (level - 1) * 1;
        finalStats.hp += (level - 1) * 10;
        finalStats.maxHp = finalStats.hp;
    }
    
    return finalStats;
}

describe('🆙 Level Up System', () => {
    
    describe('XP & Level Calculation', () => {
        it('정확히 요구 경험치(100)를 얻으면 레벨 2가 되어야 한다', () => {
            // Lv.1, 0 XP + 100 XP
            const result = processLevelUp(1, 0, 100);
            
            expect(result.level).toBe(2);
            expect(result.xp).toBe(0); // 잔여 XP는 0이어야 함
        });

        it('요구 경험치보다 많이 얻으면(110) 레벨업 후 잔여 경험치(10)가 남아야 한다', () => {
            // Lv.1, 0 XP + 110 XP
            const result = processLevelUp(1, 0, 110);
            
            expect(result.level).toBe(2);
            expect(result.xp).toBe(10);
        });

        it('기존 경험치(50)와 합쳐서 레벨업을 해야 한다', () => {
            // Lv.1, 50 XP + 60 XP = 110 XP (100 소모, 10 남음)
            const result = processLevelUp(1, 50, 60);
            
            expect(result.level).toBe(2);
            expect(result.xp).toBe(10);
        });

        it('한 번에 많은 경험치를 얻으면 다중 레벨업(Lv.1 -> Lv.3)을 해야 한다', () => {
            // Lv.1 -> Lv.2 필요 XP: 100
            // Lv.2 -> Lv.3 필요 XP: 200
            // 총 필요: 300 XP
            // 획득: 350 XP -> Lv.3 되고 50 남음
            const result = processLevelUp(1, 0, 350);
            
            expect(result.level).toBe(3);
            expect(result.xp).toBe(50);
            expect(result.logs.length).toBe(2); // 레벨업 이벤트가 2번 발생했는지 확인
        });
        
        it('높은 레벨(Lv.5)에서는 더 많은 경험치(500)가 필요하다', () => {
            // Lv.5 -> Lv.6 필요 XP: 500
            const result = processLevelUp(5, 0, 400); // 400으로는 부족함
            expect(result.level).toBe(5);
            
            const resultSuccess = processLevelUp(5, 0, 500); // 500이면 레벨업
            expect(resultSuccess.level).toBe(6);
        });
    });

    describe('Stat Growth', () => {
        const baseStats = { hp: 100, attackPower: 10, maxHp: 100 };

        it('레벨 1일 때는 기본 스탯과 같아야 한다', () => {
            const stats = calculateStatsByLevel(baseStats, 1);
            expect(stats).toEqual(baseStats);
        });

        it('레벨 2가 되면 체력+10, 공격력+1이 증가해야 한다', () => {
            const stats = calculateStatsByLevel(baseStats, 2);
            expect(stats.hp).toBe(110);
            expect(stats.attackPower).toBe(11);
        });

        it('레벨 10이 되면 체력+90, 공격력+9가 증가해야 한다', () => {
            // (10 - 1) * 10 = +90 HP
            // (10 - 1) * 1 = +9 AP
            const stats = calculateStatsByLevel(baseStats, 10);
            expect(stats.hp).toBe(190);
            expect(stats.attackPower).toBe(19);
        });
    });

});