import Unit from '../Unit';

export default class Tanker extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Tanker';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    updateAI(delta) {
        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            // 탱커는 반응이 좀 느려도 됨 (묵직함)
            this.thinkTimer = 200 + Math.random() * 100;
            
            // 타겟이 없거나 죽었으면 가장 가까운 적 찾기
            if (!this.currentTarget || !this.currentTarget.active) {
                this.currentTarget = this.findNearestEnemy();
            }
        }

        // 단순 돌진 (복잡한 회피 로직 없음)
        if (this.currentTarget && this.currentTarget.active) {
            this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
            this.updateFlipX();
        } else {
            this.setVelocity(0, 0);
        }
    }
    
    // 탱커는 맞아도 잘 안 도망감 (Override 안함 -> 기본 Unit 동작)
}