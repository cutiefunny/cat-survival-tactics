// src/game/data/UnitData.js

export const ROLE_TEXTURES = {
    'Tanker': 'tanker',
    'Shooter': 'shooter',
    'Runner': 'runner',
    'Dealer': 'leader',
    'Leader': 'leader',
    'Normal': 'normal',
    'Healer': 'healer',
    'Raccoon': 'raccoon',
    'NormalDog': 'dog'
};

export const NORMAL_NAMES = [
  "나비", "야옹", "미미", "초코", "보리",
  "루나", "코코", "두부", "망고", "레오",
  "별이", "달이", "콩이", "사랑", "행복",
  "구름", "하늘", "바람", "바다", "산이",
  "강산", "호랑", "사자", "치즈", "크림",
  "라떼", "모카", "쿠키", "캔디", "젤리",
  "푸딩", "만두", "찐빵", "호떡", "밤이",
  "감이", "귤이", "자두", "앵두", "포도",
  "체리", "키위", "멜론", "수박", "땅콩",
  "호두", "대추", "쌀이", "보라", "연두"
];

export const RUNNER_NAMES = [
    "번개", "질주", "스피드", "돌풍", "화살", "레이서",
    "질주왕", "빠름이", "순간이동", "질풍", "광속"
];

export const RACCOON_NAMES = [
    "도둑이", "꾸러기", "꼬마도둑", "야행성", "은신술사",
    "먹보", "탐험가", "모험가", "숨바꼭질", "밤도둑"
];

export const TANKER_NAMES = [
    "철벽", "방패", "수호자", "강철이", "튼튼이",
    "거인", "대장장이", "수문장", "보호자", "방어왕"
];

export const SHOOTER_NAMES = [
    "명사수", "저격수", "호크아이", "원거리", "정조준", "데드샷",
    "총잡이", "사격왕", "스나이퍼", "원샷"
];

export const HEALER_NAMES = [
    "치유냥", "힐러냥", "뿌뿌뿡", "회복왕", "의사냥",
    "치료냥", "보건냥", "수호냥", "회복냥"
];

export const UNIT_COSTS = [
    { role: 'Tanker', name: '탱커', cost: 10, desc: "높은 체력과 방어력으로 아군을 보호합니다." },
    { role: 'Shooter', name: '슈터', cost: 20, desc: "긴 사거리로 멀리서 적을 제압합니다." },
    { role: 'Healer', name: '힐러', cost: 25, desc: "근처 아군의 체력을 회복시킵니다." },
    { role: 'Raccoon', name: '너구리', cost: 10, desc: "빠른 공격 속도로 적을 괴롭힙니다." },
    { role: 'Runner', name: '러너', cost: 10, desc: "매우 빠른 이동 속도로 전장을 누빕니다." },
    { role: 'Normal', name: '일반냥', cost: 5, desc: "가장 기본이 되는 병사입니다." }
];

export const ROLE_BASE_STATS = {
    'Leader': { 
        hp: 200, attackPower: 25, moveSpeed: 90, 
        defense: 2, 
        attackRange: 50, 
        skillCooldown: 30000, skillRange: 300, skillDuration: 10000,
        killReward: 100,
        missChance: 0.02 // [New] 기본 2%
    },
    'Tanker': { 
        hp: 300, attackPower: 10, moveSpeed: 50, 
        defense: 5, 
        attackRange: 50, 
        skillCooldown: 10000, skillRange: 200,
        killReward: 30,
        missChance: 0.02 // [New]
    },
    'Healer': { 
        hp: 100, attackPower: 15, moveSpeed: 110, 
        defense: 0, 
        attackRange: 50, 
        skillCooldown: 3000, aggroStackLimit: 10,
        killReward: 25,
        missChance: 0.02 // [New]
    },
    'Raccoon': { 
        hp: 150, attackPower: 20, moveSpeed: 100, 
        defense: 0, 
        attackRange: 50, 
        skillCooldown: 8000,
        killReward: 20,
        missChance: 0.02 // [New]
    },
    'Shooter': { 
        hp: 80, attackPower: 30, moveSpeed: 80, 
        defense: 0, 
        attackRange: 250, 
        killReward: 20,
        missChance: 0.02 // [New] 원거리는 명중률이 더 중요할 수 있음 (조정 가능)
    },
    'Runner': { 
        hp: 120, attackPower: 18, moveSpeed: 120, 
        defense: 0, 
        attackRange: 50,
        killReward: 15,
        missChance: 0.02 // [New]
    },
    'Normal': { 
        hp: 140, attackPower: 15, moveSpeed: 70, 
        defense: 0, 
        attackRange: 50,
        killReward: 10,
        missChance: 0.02 // [New]
    },
    'NormalDog': { 
        hp: 140, attackPower: 15, moveSpeed: 70, 
        defense: 0, 
        attackRange: 50,
        killReward: 10,
        missChance: 0.02 // [New]
    }
};

export const DEFAULT_AI_SETTINGS = {
    common: { thinkTimeMin: 150, thinkTimeVar: 100, fleeHpThreshold: 0.2, hpRegenRate: 0.01 },
    runner: { ambushDistance: 60, fleeDuration: 1500 },
    dealer: { safeDistance: 150, followDistance: 50 },
    shooter: { attackRange: 250, kiteDistance: 200 } // AI 이동 목표 거리
};

// [New] 랜덤 이름 생성 헬퍼 함수
export const getRandomUnitName = (role) => {
    let pool = NORMAL_NAMES;

    switch (role) {
        case 'Runner': pool = RUNNER_NAMES; break;
        case 'Raccoon': pool = RACCOON_NAMES; break;
        case 'Tanker': pool = TANKER_NAMES; break;
        case 'Shooter': pool = SHOOTER_NAMES; break;
        case 'Healer': pool = HEALER_NAMES; break;
        default: pool = NORMAL_NAMES; break;
    }

    // 풀에서 랜덤하게 하나 선택
    if (!pool || pool.length === 0) return "이름없음";
    return pool[Math.floor(Math.random() * pool.length)];
};