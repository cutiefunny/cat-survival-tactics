// src/game/managers/LevelManager.js

// Vite의 기능을 사용하여 assets/maps 폴더의 level*.json 파일을 모두 가져옵니다 (eager: true로 즉시 로드)
const levelModules = import.meta.glob('../../assets/maps/level*.json', { eager: true });

const levels = [];

for (const path in levelModules) {
    // 파일 경로에서 파일명(키) 추출 (예: .../level1.json -> level1)
    const match = path.match(/\/([^\/]+)\.json$/);
    if (match) {
        const key = match[1];
        // 정렬을 위해 숫자만 추출 (level1 -> 1, level2 -> 2)
        // 숫자가 없으면 맨 뒤로 보냅니다.
        const order = parseInt(key.replace('level', '')) || 999;
        
        levels.push({
            key: key,
            data: levelModules[path].default || levelModules[path], // JSON 데이터
            order: order
        });
    }
}

// 레벨 번호 순으로 정렬 (1 -> 2 -> 3 ...)
levels.sort((a, b) => a.order - b.order);

// 외부에서 사용할 키 리스트 (['level1', 'level2', 'level3', ...])
export const LEVEL_KEYS = levels.map(l => l.key);

// 키를 통해 데이터에 접근할 수 있는 객체 ({ level1: {...}, level2: {...} })
export const LEVEL_DATA = levels.reduce((acc, curr) => {
    acc[curr.key] = curr.data;
    return acc;
}, {});