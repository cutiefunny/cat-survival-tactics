import Unit from '../Unit';

export default class Normal extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Normal';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    // updateAI(delta) {
    //     // [필수] 도발 상태인지 확인 (이 부분이 없으면 어그로가 안 끌림)
    //     this.ai.processAggro(delta);
    //     if (this.ai.isProvoked) {
    //         if (this.ai.currentTarget && this.ai.currentTarget.active) {
    //             this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
    //             this.updateFlipX();
    //         }
    //         return; // 도발 상태면 여기서 리턴하여 아래의 타겟 변경 로직을 실행하지 않음
    //     }

    //     // 기존 로직
    //     this.ai.thinkTimer -= delta;
    //     if (this.ai.thinkTimer <= 0) {
    //         this.ai.thinkTimer = 150 + Math.random() * 100;
    //         if (!this.ai.currentTarget || !this.ai.currentTarget.active) {
    //             this.ai.currentTarget = this.ai.findNearestEnemy();
    //         }
    //     }

    //     if (this.ai.currentTarget && this.ai.currentTarget.active) {
    //         this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
    //         this.updateFlipX();
    //     } else {
    //         this.setVelocity(0, 0);
    //     }
    // }
}