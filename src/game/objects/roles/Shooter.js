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
        // 1. [생존 최우선] 적과의 거리 체크 (Kiting)
        const nearestThreat = this.ai.findNearestEnemy(); 
        if (nearestThreat) {
            const distSq = Phaser.Math.Distance.Squared(this.x, this.y, nearestThreat.x, nearestThreat.y);
            const kiteDist = this.aiConfig.shooter?.kiteDistance || 200;
            const kiteDistSq = kiteDist * kiteDist;

            // 너무 가까우면 공격보다 도망 우선
            if (distSq < kiteDistSq * 0.6) { 
                this.fleeFrom(nearestThreat);
                this.lookAt(nearestThreat);
                return;
            }
        }

        this.ai.thinkTimer -= delta;

        // 2. 타겟 선정 (점사 로직)
        if (this.ai.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.ai.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            
            this.decideTargetSmart();
        }

        // 3. 이동 실행
        this.executeMovement();
        
        // 4. 시선 처리
        if (this.ai.currentTarget && this.ai.currentTarget.active) {
            this.lookAt(this.ai.currentTarget);
        } else {
            super.updateFlipX();
        }
    }

    decideTargetSmart() {
        const chasers = this.findEnemiesTargetingMe();
        if (chasers.length > 0) {
            this.ai.currentTarget = this.getClosestUnit(chasers);
            this.isFlanking = false;
            return;
        }

        // UnitAI에 추가된 findStrategicTarget 사용
        this.ai.currentTarget = this.ai.findStrategicTarget({
            distance: 1.0,
            lowHp: 3.0, 
            rolePriority: { 'Healer': 500, 'Shooter': 200 }
        });
    }

    executeMovement() {
        const target = this.ai.currentTarget;
        if (!target || !target.active) {
            this.setVelocity(0, 0);
            return;
        }

        const distSq = Phaser.Math.Distance.Squared(this.x, this.y, target.x, target.y);
        const atkRange = this.attackRange;
        const atkRangeSq = atkRange * atkRange;
        const kiteDistSq = (atkRange * 0.8) ** 2;

        if (distSq > atkRangeSq) {
            this.scene.physics.moveToObject(this, target, this.moveSpeed);
        } else if (distSq < kiteDistSq) {
            const angle = Phaser.Math.Angle.Between(target.x, target.y, this.x, this.y);
            this.scene.physics.velocityFromRotation(angle, this.moveSpeed * 0.5, this.body.velocity);
        } else {
            this.setVelocity(0, 0);
        }
    }

    findEnemiesTargetingMe() {
        const enemies = this.targetGroup.getChildren();
        const chasers = [];
        for (let enemy of enemies) {
            if (enemy.active && enemy.ai && enemy.ai.currentTarget === this) {
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

    fleeFrom(enemy) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.x, this.y); 
        const speed = this.moveSpeed * 1.3; 
        
        this.body.velocity.x = Math.cos(angle) * speed;
        this.body.velocity.y = Math.sin(angle) * speed;
    }

    lookAt(target) {
        // [Fix] 시선 처리 데드존 추가 (떨림 방지)
        const diffX = target.x - this.x;
        if (Math.abs(diffX) < 10) return; // 기존 5 -> 10으로 증가

        const isBlue = this.team === 'blue';
        if (target.x < this.x) this.setFlipX(isBlue ? false : true);
        else this.setFlipX(isBlue ? true : false);
    }

    onTakeDamage() {}
}