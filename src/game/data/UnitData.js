// src/game/data/UnitData.js

export const ROLE_TEXTURES = {
    'Tanker': 'tanker',
    'Shooter': 'shooter',
    'Runner': 'runner',
    'Dealer': 'leader',
    'Leader': 'leader',
    'Normal': 'leader',
    'Healer': 'healer',
    'Raccoon': 'raccoon',
    'NormalDog': 'dog'
};

export const UNIT_COSTS = [
    { role: 'Tanker', name: '탱커', cost: 10, desc: "높은 체력과 방어력으로 아군을 보호합니다." },
    { role: 'Shooter', name: '슈터', cost: 20, desc: "긴 사거리로 멀리서 적을 제압합니다." },
    { role: 'Healer', name: '힐러', cost: 25, desc: "근처 아군의 체력을 회복시킵니다." },
    { role: 'Raccoon', name: '너구리', cost: 10, desc: "빠른 공격 속도로 적을 괴롭힙니다." },
    { role: 'Runner', name: '러너', cost: 10, desc: "매우 빠른 이동 속도로 전장을 누빕니다." },
    { role: 'Normal', name: '일반냥', cost: 5, desc: "가장 기본이 되는 병사입니다." }
];

export const ROLE_BASE_STATS = {
    // [Updated] killReward(처치 보상) 추가
    'Leader': { 
        hp: 200, attackPower: 25, moveSpeed: 90, 
        defense: 2, 
        attackRange: 50, 
        skillCooldown: 30000, skillRange: 300, skillDuration: 10000,
        killReward: 100 // 보스급 보상
    },
    'Tanker': { 
        hp: 300, attackPower: 10, moveSpeed: 50, 
        defense: 5, 
        attackRange: 50, 
        skillCooldown: 10000, skillRange: 200,
        killReward: 30 // 튼튼한 적 보상
    },
    'Healer': { 
        hp: 100, attackPower: 15, moveSpeed: 110, 
        defense: 0, 
        attackRange: 50, 
        skillCooldown: 3000, aggroStackLimit: 10,
        killReward: 25 // 우선 순위 타겟 보상
    },
    'Raccoon': { 
        hp: 150, attackPower: 20, moveSpeed: 100, 
        defense: 0, 
        attackRange: 50, 
        skillCooldown: 8000,
        killReward: 20
    },
    'Shooter': { 
        hp: 80, attackPower: 30, moveSpeed: 80, 
        defense: 0, 
        attackRange: 250, // [Important] 원거리
        killReward: 20
    },
    'Runner': { 
        hp: 120, attackPower: 18, moveSpeed: 120, 
        defense: 0, 
        attackRange: 50,
        killReward: 15
    },
    'Normal': { 
        hp: 140, attackPower: 15, moveSpeed: 70, 
        defense: 0, 
        attackRange: 50,
        killReward: 10
    },
    'NormalDog': { 
        hp: 140, attackPower: 15, moveSpeed: 70, 
        defense: 0, 
        attackRange: 50,
        killReward: 10 // 기본 잡몹 보상
    }
};

export const DEFAULT_AI_SETTINGS = {
    common: { thinkTimeMin: 150, thinkTimeVar: 100, fleeHpThreshold: 0.2, hpRegenRate: 0.01 },
    runner: { ambushDistance: 60, fleeDuration: 1500 },
    dealer: { safeDistance: 150, followDistance: 50 },
    shooter: { attackRange: 250, kiteDistance: 200 } // AI 이동 목표 거리
};