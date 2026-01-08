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