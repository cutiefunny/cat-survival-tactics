import Unit from '../Unit';
import Phaser from 'phaser';

export default class Dealer extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Dealer';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    updateAI(delta) {
        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            
            this.decideMove();
        }

        // 결정된 타겟이나 위치로 이동
        if (this.currentTarget) {
            if (this.currentTarget.active) { // 유닛인 경우
                this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
                // 카이팅 중(도망)일 때는 반대 방향을 보게 할 수도 있지만, 기본은 이동방향
                this.updateFlipX(); 
            } else if (this.currentTarget.x !== undefined) { // 좌표인 경우 (호위 위치 등)
                this.scene.physics.moveTo(this, this.currentTarget.x, this.currentTarget.y, this.moveSpeed);
                this.updateFlipX();
            }
        } else {
            this.setVelocity(0, 0);
        }
    }

    decideMove() {
        const nearestEnemy = this.findNearestEnemy();
        if (!nearestEnemy) {
            this.currentTarget = null;
            return;
        }

        const distToEnemy = Phaser.Math.Distance.Between(this.x, this.y, nearestEnemy.x, nearestEnemy.y);
        const safeDistance = this.aiConfig.dealer?.safeDistance || 150; 

        // 1. 아군 탱커가 있는지 확인
        const friendlyTanker = this.findFriendlyTanker();

        if (friendlyTanker) {
            const targetOfTanker = this.findEnemyAttackingUnit(friendlyTanker);
            
            // 탱커가 싸우고 있는 적을 같이 공격 (점사)
            if (targetOfTanker) {
                this.currentTarget = targetOfTanker;
            } else {
                // 탱커가 아직 안 싸우면 탱커 근처로 이동 (호위)
                const distToTanker = Phaser.Math.Distance.Between(this.x, this.y, friendlyTanker.x, friendlyTanker.y);
                const followDistance = this.aiConfig.dealer?.followDistance || 50; 

                if (distToTanker > followDistance) {
                    this.currentTarget = { x: friendlyTanker.x, y: friendlyTanker.y };
                } else {
                    this.currentTarget = null; // 대기
                }
            }
        } else {
            // 탱커가 없으면? "거리 유지(Kiting)" 시도
            if (distToEnemy < safeDistance) {
                // 적과 반대 방향으로 도망 (Flee)
                this.fleeFrom(nearestEnemy);
                this.currentTarget = null; // moveTo 로직 대신 직접 velocity 제어했으므로 타겟 null
            } else {
                this.currentTarget = nearestEnemy;
            }
        }
    }

    findFriendlyTanker() {
        const myGroup = (this.team === 'blue') ? this.scene.blueTeam : this.scene.redTeam;
        const units = myGroup.getChildren();
        for(let unit of units) { if (unit.active && unit.role === 'Tanker') return unit; }
        return null;
    }

    findEnemyAttackingUnit(friendlyUnit) {
        if (!friendlyUnit) return null;
        const enemies = this.targetGroup.getChildren();
        for (let enemy of enemies) {
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(friendlyUnit.x, friendlyUnit.y, enemy.x, enemy.y);
                if (distSq < 100 * 100) return enemy; // 교전 거리 내
            }
        }
        return null;
    }

    fleeFrom(enemy) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.x, this.y); 
        const speed = this.moveSpeed * 1.2; // 약간 빠르게 후퇴
        this.body.velocity.x = Math.cos(angle) * speed;
        this.body.velocity.y = Math.sin(angle) * speed;
        this.updateFlipX();
    }
}