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

        if (this.currentTarget) {
            if (this.currentTarget.active) { 
                this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
                this.updateFlipX(); 
            } else if (this.currentTarget.x !== undefined) { 
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

        // [Optimization] 제곱 거리 사용
        const distToEnemySq = Phaser.Math.Distance.Squared(this.x, this.y, nearestEnemy.x, nearestEnemy.y);
        const safeDistance = this.aiConfig.dealer?.safeDistance || 150; 
        const safeDistanceSq = safeDistance * safeDistance;

        const friendlyTanker = this.findFriendlyTanker();

        if (friendlyTanker) {
            const targetOfTanker = this.findEnemyAttackingUnit(friendlyTanker);
            
            if (targetOfTanker) {
                this.currentTarget = targetOfTanker;
            } else {
                const distToTankerSq = Phaser.Math.Distance.Squared(this.x, this.y, friendlyTanker.x, friendlyTanker.y);
                const followDistance = this.aiConfig.dealer?.followDistance || 50; 
                const followDistanceSq = followDistance * followDistance;

                if (distToTankerSq > followDistanceSq) {
                    this.currentTarget = { x: friendlyTanker.x, y: friendlyTanker.y };
                } else {
                    this.currentTarget = null; 
                }
            }
        } else {
            if (distToEnemySq < safeDistanceSq) {
                this.fleeFrom(nearestEnemy);
                this.currentTarget = null; 
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
        const rangeSq = 100 * 100;
        for (let enemy of enemies) {
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(friendlyUnit.x, friendlyUnit.y, enemy.x, enemy.y);
                if (distSq < rangeSq) return enemy; 
            }
        }
        return null;
    }

    fleeFrom(enemy) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.x, this.y); 
        const speed = this.moveSpeed * 1.2;
        this.body.velocity.x = Math.cos(angle) * speed;
        this.body.velocity.y = Math.sin(angle) * speed;
        this.updateFlipX();
    }
}