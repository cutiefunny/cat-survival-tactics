import Unit from '../Unit';
import Phaser from 'phaser';

export default class Runner extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Runner';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    updateAI(delta) {
        // 도망 중이면 최우선 처리
        if (this.fleeTimer > 0) {
            this.runTowardsSafety();
            this.currentTarget = null;
            return;
        }

        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            
            this.decideNextMove();
        }

        if (this.currentTarget && this.currentTarget.active) {
            // 암살자 돌진
            this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
            this.updateFlipX(); // Runner는 이동 방향을 봄
        } else {
            this.setVelocity(0, 0);
        }
    }

    decideNextMove() {
        // 아군과 교전 중인 적(암살 타겟) 찾기
        const engagingEnemy = this.findEnemyEngagingAlly();
        
        if (engagingEnemy) {
            const ambushPoint = this.calculateAmbushPoint(engagingEnemy);
            const dist = Phaser.Math.Distance.Between(this.x, this.y, ambushPoint.x, ambushPoint.y);
            
            // 암살 위치로 우회 이동 후 타겟 변경
            if (dist > 30) {
                this.currentTarget = { x: ambushPoint.x, y: ambushPoint.y, active: true };
            } else {
                this.currentTarget = engagingEnemy;
            }
        } else {
            // 없으면 그냥 배회
            this.currentTarget = this.findNearestEnemy();
        }
    }

    calculateAmbushPoint(enemy) {
        // 적의 뒤편 계산
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

    onTakeDamage() {
        // Runner는 맞으면 길게 도망
        this.fleeTimer = this.aiConfig.runner?.fleeDuration || 1500;
        this.currentTarget = null;
    }
}