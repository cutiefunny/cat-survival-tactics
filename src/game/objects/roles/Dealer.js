import Unit from '../Unit';
import Phaser from 'phaser';

export default class Dealer extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Dealer';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    updateAI(delta) {
        // 1. 도발 체크
        this.ai.processAggro(delta);
        if (this.ai.isProvoked) {
            // 도발 상태면 안전거리 무시하고 타겟 추적/공격
            if (this.ai.currentTarget && this.ai.currentTarget.active) {
                 this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
                 this.updateFlipX();
            }
            return;
        }

        // 2. 일반 로직
        this.ai.thinkTimer -= delta;
        if (this.ai.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.ai.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            this.decideMove();
        }

        if (this.ai.currentTarget) {
            if (this.ai.currentTarget.active) { 
                this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
                this.updateFlipX(); 
            } else if (this.ai.currentTarget.x !== undefined) { 
                this.scene.physics.moveTo(this, this.ai.currentTarget.x, this.ai.currentTarget.y, this.moveSpeed);
                this.updateFlipX();
            }
        } else {
            this.setVelocity(0, 0);
        }
    }

    decideMove() {
        const nearestEnemy = this.ai.findNearestEnemy();
        if (!nearestEnemy) {
            this.ai.currentTarget = null;
            return;
        }

        const distToEnemySq = Phaser.Math.Distance.Squared(this.x, this.y, nearestEnemy.x, nearestEnemy.y);
        const safeDistance = this.aiConfig.dealer?.safeDistance || 150; 
        const safeDistanceSq = safeDistance * safeDistance;

        const friendlyTanker = this.findFriendlyTanker();

        if (friendlyTanker) {
            const targetOfTanker = this.findEnemyAttackingUnit(friendlyTanker);
            if (targetOfTanker) {
                this.ai.currentTarget = targetOfTanker;
            } else {
                const distToTankerSq = Phaser.Math.Distance.Squared(this.x, this.y, friendlyTanker.x, friendlyTanker.y);
                const followDistance = this.aiConfig.dealer?.followDistance || 50; 
                const followDistanceSq = followDistance * followDistance;
                if (distToTankerSq > followDistanceSq) {
                    this.ai.currentTarget = { x: friendlyTanker.x, y: friendlyTanker.y };
                } else {
                    this.ai.currentTarget = null; 
                }
            }
        } else {
            if (distToEnemySq < safeDistanceSq) {
                this.fleeFrom(nearestEnemy);
                this.ai.currentTarget = null; 
            } else {
                this.ai.currentTarget = nearestEnemy;
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