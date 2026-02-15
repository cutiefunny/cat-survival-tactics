import Unit from '../Unit';

// [New] EliteDog 클래스: 일반 들개 레벨5 기반의 정예 개
// 기본 AI는 Normal.js와 동일하게 Unit.js의 기본 동작을 사용
export default class EliteDog extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'EliteDog';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }
}
