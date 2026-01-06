import Unit from '../Unit';
import Phaser from 'phaser';

export default class Runner extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Runner';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    updateAI(delta) {
        // 1. 도발 체크
        this.ai.processAggro(delta);
        if (this.ai.isProvoked) {
            // 도발당하면 암살/회피 로직 무시하고 타겟에게 직진
            if (this.ai.currentTarget && this.ai.currentTarget.active) {
                 this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
                 this.updateFlipX();
            }
            return;
        }

        // 2. 도망 상태 체크 (도발 아니면 도망 가능)
        if (this.ai.fleeTimer > 0) {
            this.runTowardsSafety();
            this.ai.currentTarget = null;
            return;
        }

        this.ai.thinkTimer -= delta;

        // 3. 타겟 선정
        if (this.ai.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.ai.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            this.decideNextMove();
        }

        // 4. 이동
        if (this.ai.currentTarget && this.ai.currentTarget.active) {
            this.moveIdeallyTowards(this.ai.currentTarget);
            this.updateFlipX(); 
        } else {
            this.ai.followLeader();
        }
    }

    runTowardsSafety() {
        const nearestEnemy = this.ai.findNearestEnemy();
        if (nearestEnemy) {
            const angle = Phaser.Math.Angle.Between(nearestEnemy.x, nearestEnemy.y, this.x, this.y);
            this.scene.physics.velocityFromRotation(angle, this.moveSpeed * 1.3, this.body.velocity);
            this.updateFlipX();
        } else {
            this.ai.followLeader();
        }
    }

    decideNextMove() {
        const enemyShooter = this.findEnemyShooter();

        if (enemyShooter) {
            const ambushPoint = this.calculateAmbushPoint(enemyShooter);
            const distSq = Phaser.Math.Distance.Squared(this.x, this.y, ambushPoint.x, ambushPoint.y);
            
            if (distSq > 50 * 50) {
                this.ai.currentTarget = { 
                    x: ambushPoint.x, 
                    y: ambushPoint.y, 
                    active: true, 
                    isAmbushPoint: true, 
                    actualTarget: enemyShooter 
                };
            } else {
                this.ai.currentTarget = enemyShooter;
            }
        } 
        else {
            const engagingEnemy = this.findEnemyEngagingAlly();
            if (engagingEnemy) {
                this.ai.currentTarget = engagingEnemy;
            } else {
                this.ai.currentTarget = this.ai.findNearestEnemy();
            }
        }
    }

    onTakeDamage() {
        // 도발 상태면 맞아도 도망가지 않음
        if (this.ai.isProvoked) return;

        const target = this.ai.currentTarget;
        if (target) {
            if (target.role === 'Shooter') return;
            if (target.isAmbushPoint && target.actualTarget?.role === 'Shooter') return;
        }

        this.ai.fleeTimer = this.aiConfig.runner?.fleeDuration || 1500;
        this.ai.currentTarget = null;
    }

    findEnemyShooter() {
        const enemies = this.targetGroup.getChildren();
        let closestShooter = null;
        let minDistSq = Infinity;
        for (let enemy of enemies) {
            if (enemy.active && enemy.role === 'Shooter') {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    closestShooter = enemy;
                }
            }
        }
        return closestShooter;
    }

    moveIdeallyTowards(target) {
        const angleToTarget = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        let forceX = Math.cos(angleToTarget);
        let forceY = Math.sin(angleToTarget);

        const avoidanceForce = this.calculateAvoidanceForce(target.actualTarget || target);
        
        forceX += avoidanceForce.x * 2.5;
        forceY += avoidanceForce.y * 2.5;

        const vec = new Phaser.Math.Vector2(forceX, forceY).normalize().scale(this.moveSpeed);
        this.setVelocity(vec.x, vec.y);
    }

    calculateAvoidanceForce(primaryTarget) {
        let pushX = 0;
        let pushY = 0;
        const detectionRadiusSq = 120 * 120; 

        const enemies = this.targetGroup.getChildren();
        for (let enemy of enemies) {
            if (!enemy.active || enemy === primaryTarget) continue;

            const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
            if (distSq < detectionRadiusSq) {
                const dist = Math.sqrt(distSq);
                const force = (120 - dist) / 120; 
                const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.x, this.y);
                pushX += Math.cos(angle) * force;
                pushY += Math.sin(angle) * force;
            }
        }
        return { x: pushX, y: pushY };
    }

    calculateAmbushPoint(enemy) {
        let angle;
        if (enemy.body && enemy.body.velocity.length() > 10) {
            angle = Math.atan2(enemy.body.velocity.y, enemy.body.velocity.x) + Math.PI;
        } else {
            angle = Phaser.Math.Angle.Between(this.x, this.y, enemy.x, enemy.y);
        }
        const dist = this.aiConfig.runner?.ambushDistance || 60;
        return {
            x: enemy.x + Math.cos(angle) * dist,
            y: enemy.y + Math.sin(angle) * dist
        };
    }
}