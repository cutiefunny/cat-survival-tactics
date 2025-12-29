import Unit from '../Unit';
import Phaser from 'phaser';

export default class Shooter extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Shooter';
        stats.attackRange = stats.attackRange || 250; 
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        this.isFlanking = false;
    }

    updateAI(delta) {
        // 1. [생존 최우선] 적과의 거리 체크
        const nearestThreat = this.findNearestEnemy(); 
        if (nearestThreat) {
            const distSq = Phaser.Math.Distance.Squared(this.x, this.y, nearestThreat.x, nearestThreat.y);
            const kiteDist = this.aiConfig.shooter?.kiteDistance || 200;
            const kiteDistSq = kiteDist * kiteDist;

            // 안전거리보다 가까우면 즉시 도망
            if (distSq < kiteDistSq) {
                this.fleeFrom(nearestThreat);
                this.lookAt(nearestThreat);
                return;
            }
        }

        this.thinkTimer -= delta;

        // 2. 타겟 선정
        if (this.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            
            this.decideTarget();
        }

        // 3. 이동 실행
        this.executeMovement();
        
        // 4. 시선 처리
        if (this.currentTarget && this.currentTarget.active) {
            this.lookAt(this.currentTarget);
        } else {
            super.updateFlipX();
        }
    }

    decideTarget() {
        const chasers = this.findEnemiesTargetingMe();
        
        if (chasers.length > 0) {
            this.currentTarget = this.getClosestUnit(chasers);
            this.isFlanking = false; 
        } 
        else {
            const weakest = this.findWeakestEnemy();
            if (weakest) {
                this.currentTarget = weakest;
                this.isFlanking = true; 
            } else {
                this.currentTarget = this.findNearestEnemy();
                this.isFlanking = false;
            }
        }
    }

    executeMovement() {
        const target = this.currentTarget;
        if (!target || !target.active) {
            this.setVelocity(0, 0);
            return;
        }

        const distSq = Phaser.Math.Distance.Squared(this.x, this.y, target.x, target.y);
        const atkRange = this.attackRange;
        const atkRangeSq = atkRange * atkRange;

        if (this.isFlanking) {
            // [우회 모드]
            const flankPos = this.calculateFlankPosition(target);
            if (distSq > atkRangeSq * 0.8) { 
                this.scene.physics.moveTo(this, flankPos.x, flankPos.y, this.moveSpeed);
            } else {
                this.setVelocity(0, 0);
            }
        } else {
            // [일반 모드]
            if (distSq > atkRangeSq) {
                this.scene.physics.moveToObject(this, target, this.moveSpeed);

                // [FIX] 미세 조절 시 좌우 떨림 방지
                // 목표와의 수평 거리 차이가 작으면(10px 미만), X축 이동을 생략하고 수직 이동만 수행
                if (Math.abs(this.x - target.x) < 10) {
                    this.setVelocityX(0);
                }
            } else {
                this.setVelocity(0, 0);
            }
        }
    }

    findEnemiesTargetingMe() {
        const enemies = this.targetGroup.getChildren();
        const chasers = [];
        for (let enemy of enemies) {
            if (enemy.active && enemy.currentTarget === this) {
                chasers.push(enemy);
            }
        }
        return chasers;
    }

    getClosestUnit(units) {
        let closest = null;
        let minDistSq = Infinity;
        for (let unit of units) {
            const dSq = Phaser.Math.Distance.Squared(this.x, this.y, unit.x, unit.y);
            if (dSq < minDistSq) {
                minDistSq = dSq;
                closest = unit;
            }
        }
        return closest;
    }

    calculateFlankPosition(target) {
        let angle;
        if (target.body && target.body.velocity.length() > 10) {
            angle = Math.atan2(target.body.velocity.y, target.body.velocity.x) + Math.PI; 
        } else {
            const angleToMe = Phaser.Math.Angle.Between(target.x, target.y, this.x, this.y);
            const flankDir = (Math.random() > 0.5 ? 1.5 : -1.5); 
            angle = angleToMe + flankDir;
        }

        const dist = this.attackRange * 0.9; 
        return {
            x: target.x + Math.cos(angle) * dist,
            y: target.y + Math.sin(angle) * dist
        };
    }

    fleeFrom(enemy) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.x, this.y); 
        const speed = this.moveSpeed * 1.3; 
        this.body.velocity.x = Math.cos(angle) * speed;
        this.body.velocity.y = Math.sin(angle) * speed;
    }

    lookAt(target) {
        // [FIX] 시선 떨림 방지 (Visual Jitter Prevention)
        // 목표가 내 중심 기준 좌우 5px 이내에 있다면 시선 방향을 바꾸지 않음
        if (Math.abs(target.x - this.x) < 5) return;

        const isBlue = this.team === 'blue';
        if (target.x < this.x) this.setFlipX(isBlue ? false : true);
        else this.setFlipX(isBlue ? true : false);
    }

    onTakeDamage() {}
}