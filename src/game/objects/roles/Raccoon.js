import Unit from '../Unit';

export default class Raccoon extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Raccoon';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    updateAI(delta) {
        // 1. 도발 상태 체크
        this.ai.processAggro(delta);
        if (this.ai.isProvoked) {
            if (this.ai.currentTarget && this.ai.currentTarget.active) {
                this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
                this.updateFlipX();
            }
            return;
        }

        // 2. 저돌적 AI
        this.ai.thinkTimer -= delta;

        if (this.ai.thinkTimer <= 0) {
            this.ai.thinkTimer = 50 + Math.random() * 50;
            // 도발이 없을 때만 가장 가까운 적 찾기
            this.ai.currentTarget = this.ai.findNearestEnemy();
        }

        if (this.ai.currentTarget && this.ai.currentTarget.active) {
            this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
            this.updateFlipX();
        } else {
            this.setVelocity(0, 0);
        }
    }
}