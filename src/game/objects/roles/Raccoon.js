import Unit from '../Unit';

export default class Raccoon extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        // Raccoon 역할 강제 지정
        stats.role = 'Raccoon';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    updateAI(delta) {
        this.thinkTimer -= delta;

        // [저돌적 행동 양식 구현]
        // 1. 빠른 반응 속도: Normal(평균 200ms)보다 3배 정도 빠른 판단 주기 (평균 75ms)
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 50 + Math.random() * 50;

            // 2. 집요한 추적 (Aggressive Retargeting)
            // Normal은 타겟이 죽어야만 새 타겟을 찾지만,
            // Raccoon은 현재 타겟이 있어도 '더 가까운 적'이 나타나면 즉시 목표를 변경합니다.
            this.currentTarget = this.findNearestEnemy();
        }

        if (this.currentTarget && this.currentTarget.active) {
            // 3. 이동: 망설임 없이 대상에게 직진
            this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
            this.updateFlipX();
        } else {
            this.setVelocity(0, 0);
        }
    }
}