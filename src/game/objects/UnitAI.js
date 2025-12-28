import Phaser from 'phaser';

export default class UnitAI {
    // [CHANGE] config 수신
    constructor(unit, config) {
        this.unit = unit;
        this.scene = unit.scene;
        this.config = config; // 설정값 저장
        this.thinkTimer = 0;
        this.roamAngle = Math.random() * Math.PI * 2; 
    }

    update(delta) {
        if (this.unit.role === 'Runner' && this.unit.fleeTimer > 0) {
            this.runTowardsSafety();
            this.unit.currentTarget = null; 
            return; 
        }

        this.thinkTimer -= delta;

        if (this.thinkTimer <= 0) {
            // [CONFIG] 생각 주기 동적 적용
            const { thinkTimeMin, thinkTimeVar } = this.config.common;
            this.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;

            const role = this.unit.role;

            if (role === 'Runner') {
                this.updateRunnerAI();
            } else if (role === 'Dealer') {
                this.updateKitingAI();
            } else {
                this.updateMeleeAI(); 
            }
        }
    }

    onTakeDamage() {
        if (this.unit.role === 'Runner') {
            // [CONFIG] 도망 시간 적용
            this.unit.fleeTimer = this.config.runner.fleeDuration;
            this.unit.currentTarget = null;
        }
    }

    updateMeleeAI() {
        if (!this.unit.currentTarget || !this.unit.currentTarget.active) {
            this.unit.currentTarget = this.findNearestEnemy();
        }
    }

    updateRunnerAI() {
        const engagingEnemy = this.findEnemyEngagingAlly();

        if (engagingEnemy) {
            // [CONFIG] 암살 거리 적용
            const ambushPoint = this.calculateAmbushPoint(engagingEnemy);
            const distToAmbush = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, ambushPoint.x, ambushPoint.y);
            
            if (distToAmbush > 30) {
                this.unit.currentTarget = { x: ambushPoint.x, y: ambushPoint.y, active: true };
            } else {
                this.unit.currentTarget = engagingEnemy;
            }
        } else {
            this.roamBattlefield();
        }
    }

    roamBattlefield() {
        const centerX = 800; 
        const centerY = 600;
        const radius = 400; 
        this.roamAngle += 0.05; 
        const targetX = centerX + Math.cos(this.roamAngle) * radius;
        const targetY = centerY + Math.sin(this.roamAngle) * radius;
        this.unit.currentTarget = { x: targetX, y: targetY, active: true };
    }

    calculateAmbushPoint(enemy) {
        let angle;
        if (enemy.body.velocity.length() > 10) {
            angle = Math.atan2(enemy.body.velocity.y, enemy.body.velocity.x) + Math.PI;
        } else {
            const nearestAlly = this.findNearestAllyTo(enemy);
            if (nearestAlly) {
                angle = Phaser.Math.Angle.Between(nearestAlly.x, nearestAlly.y, enemy.x, enemy.y);
            } else {
                angle = Phaser.Math.Angle.Between(this.unit.x, this.unit.y, enemy.x, enemy.y);
            }
        }
        // [CONFIG] 암살 거리 사용
        const distance = this.config.runner.ambushDistance; 
        return {
            x: enemy.x + Math.cos(angle) * distance,
            y: enemy.y + Math.sin(angle) * distance
        };
    }

    updateKitingAI() {
        const nearestEnemy = this.findNearestEnemy();
        if (!nearestEnemy) {
            this.unit.currentTarget = null;
            return;
        }

        const distToEnemy = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, nearestEnemy.x, nearestEnemy.y);
        // [CONFIG] 딜러 안전 거리
        const safeDistance = this.config.dealer.safeDistance; 

        const friendlyTanker = this.findFriendlyTanker();

        if (friendlyTanker) {
            const targetOfTanker = this.findEnemyAttackingUnit(friendlyTanker);
            if (targetOfTanker) {
                this.unit.currentTarget = targetOfTanker;
            } else {
                const distToTanker = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, friendlyTanker.x, friendlyTanker.y);
                // [CONFIG] 탱커 호위 거리
                const followDistance = this.config.dealer.followDistance; 

                if (distToTanker > followDistance) {
                    this.unit.currentTarget = { x: friendlyTanker.x, y: friendlyTanker.y, active: true };
                } else {
                    this.unit.currentTarget = null;
                    this.unit.setVelocity(0, 0);
                }
            }
        } else {
            if (distToEnemy < safeDistance) {
                this.fleeFrom(nearestEnemy);
                this.unit.currentTarget = null; 
            } else {
                this.unit.currentTarget = nearestEnemy;
            }
        }
    }

    // ... (이하 Helper 함수들은 변경 없음, 그대로 유지)
    fleeFrom(enemy) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.unit.x, this.unit.y); 
        const speed = this.unit.moveSpeed * 1.5; 
        this.unit.body.velocity.x = Math.cos(angle) * speed;
        this.unit.body.velocity.y = Math.sin(angle) * speed;
        this.updateFlipX();
    }
    runTowardsSafety() {
        const myGroup = (this.unit.team === 'blue') ? this.scene.blueTeam : this.scene.redTeam;
        const units = myGroup.getChildren();
        let avgX = 0, avgY = 0, count = 0;
        units.forEach(u => { if (u.active && u !== this.unit) { avgX += u.x; avgY += u.y; count++; } });
        if (count > 0) {
            const targetX = avgX / count;
            const targetY = avgY / count;
            this.scene.physics.moveTo(this.unit, targetX, targetY, this.unit.moveSpeed * 1.5);
            this.updateFlipX();
        } else {
            const nearestEnemy = this.findNearestEnemy();
            if (nearestEnemy) this.fleeFrom(nearestEnemy);
        }
    }
    updateFlipX() {
        if (this.unit.body.velocity.x < 0) this.unit.setFlipX(this.unit.team === 'blue' ? false : true);
        else if (this.unit.body.velocity.x > 0) this.unit.setFlipX(this.unit.team === 'blue' ? true : false);
    }
    findNearestEnemy() {
        let closestDist = Infinity;
        let closestTarget = null;
        const enemies = this.unit.targetGroup.getChildren();
        for (let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i];
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(this.unit.x, this.unit.y, enemy.x, enemy.y);
                if (distSq < closestDist) { closestDist = distSq; closestTarget = enemy; }
            }
        }
        return closestTarget;
    }
    findEnemyEngagingAlly() {
        const myGroup = (this.unit.team === 'blue') ? this.scene.blueTeam : this.scene.redTeam;
        const enemies = this.unit.targetGroup.getChildren();
        const allies = myGroup.getChildren();
        let bestTarget = null;
        let minHp = Infinity;
        for (let enemy of enemies) {
            if (!enemy.active) continue;
            for (let ally of allies) {
                if (!ally.active || ally === this.unit) continue;
                const distSq = Phaser.Math.Distance.Squared(enemy.x, enemy.y, ally.x, ally.y);
                if (distSq < 100 * 100) {
                    if (enemy.hp < minHp) { minHp = enemy.hp; bestTarget = enemy; }
                }
            }
        }
        return bestTarget;
    }
    findFriendlyTanker() {
        const myGroup = (this.unit.team === 'blue') ? this.scene.blueTeam : this.scene.redTeam;
        const units = myGroup.getChildren();
        for(let unit of units) { if (unit.active && unit.role === 'Tanker') return unit; }
        return null;
    }
    findEnemyAttackingUnit(friendlyUnit) {
        if (!friendlyUnit) return null;
        const enemies = this.unit.targetGroup.getChildren();
        for (let enemy of enemies) {
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(friendlyUnit.x, friendlyUnit.y, enemy.x, enemy.y);
                if (distSq < 100 * 100) return enemy;
            }
        }
        return null;
    }
    findNearestAllyTo(target) {
        const myGroup = (this.unit.team === 'blue') ? this.scene.blueTeam : this.scene.redTeam;
        const allies = myGroup.getChildren();
        let closest = null, minDist = Infinity;
        for(let ally of allies) {
            if(ally !== this.unit && ally.active) {
                const d = Phaser.Math.Distance.Squared(ally.x, ally.y, target.x, target.y);
                if(d < minDist) { minDist = d; closest = ally; }
            }
        }
        return closest;
    }
    findFriendlyLeader() {
         const myGroup = (this.unit.team === 'blue') ? this.scene.blueTeam : this.scene.redTeam;
         const units = myGroup.getChildren();
         for(let unit of units) { if (unit.active && unit.isLeader) return unit; }
         return null;
    }
}