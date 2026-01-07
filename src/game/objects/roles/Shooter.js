import Unit from '../Unit';
import Phaser from 'phaser';

export default class Shooter extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Shooter';
        stats.attackRange = stats.attackRange || 250; 
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        this.isFlanking = false;
    }

    // 대열 유지 모드에서도 사거리 내 적 공격 허용
    updateNpcLogic(delta) {
        if (this.team === 'blue' && this.scene.squadState === 'FORMATION') {
            const nearest = this.ai.findNearestEnemy();
            if (nearest && nearest.active && !nearest.isDying) {
                const dist = Phaser.Math.Distance.Between(this.x, this.y, nearest.x, nearest.y);
                
                // 적이 공격 사거리 안에 들어왔다면? -> AI 로직(updateAI)으로 넘겨서 공격 처리
                if (dist <= this.attackRange) {
                    this.updateAI(delta);
                    return;
                }
            }
        }
        
        // 적이 없거나 멀면 -> 리더 따라가기 (기존 로직)
        super.updateNpcLogic(delta);
    }

    updateAI(delta) {
        const isFormationMode = (this.team === 'blue' && this.scene.squadState === 'FORMATION');

        // [Fix 1] 현재 타겟이 없거나 죽었다면, 멍하니 기다리지 말고 즉시 생각(Targeting)하게 함
        if (!this.ai.currentTarget || !this.ai.currentTarget.active || this.ai.currentTarget.isDying) {
            this.ai.thinkTimer = 0;
        }

        // 1. [생존 최우선] 적과의 거리 체크 (Kiting)
        // 대열유지 모드일 때는 카이팅(도망) 금지 -> 대열 고수
        if (!isFormationMode) {
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
            if (this.body.velocity.x < -5) this.setFlipX(false);
            else if (this.body.velocity.x > 5) this.setFlipX(true);
        }
    }

    decideTargetSmart() {
        // 1. 나를 노리는 적(Chasers) 우선 처리
        const chasers = this.findEnemiesTargetingMe();
        if (chasers.length > 0) {
            this.ai.currentTarget = this.getClosestUnit(chasers);
            this.isFlanking = false;
            return;
        }

        // 2. 전략적 타겟 탐색 (Healer, Shooter 등 우선순위)
        let strategicTarget = this.ai.findStrategicTarget({
            distance: 1.0,
            lowHp: 3.0, 
            rolePriority: { 'Healer': 500, 'Shooter': 200 }
        });

        // [Fix 2] 기회주의적 사격 (Opportunistic Fire)
        // 전략적 타겟이 사거리 밖이거나 없을 때, 내 바로 근처(사거리 내)에 적이 있다면 그 놈을 쏜다.
        // 이는 Formation 모드뿐만 아니라 일반 전투에서도 "눈앞의 적을 무시하는" 문제를 해결함.
        const nearest = this.ai.findNearestEnemy();
        
        if (nearest && nearest.active && !nearest.isDying) {
            const distToNearest = Phaser.Math.Distance.Between(this.x, this.y, nearest.x, nearest.y);
            
            // 가장 가까운 적이 사거리 내에 있음
            if (distToNearest <= this.attackRange) {
                let shouldSwitch = false;

                if (!strategicTarget) {
                    shouldSwitch = true; // 타겟이 아예 없으면 가까운 놈 선택
                } else {
                    const distToStrategic = Phaser.Math.Distance.Between(this.x, this.y, strategicTarget.x, strategicTarget.y);
                    // 전략적 타겟이 사거리 밖이라면, 사거리 안의 가까운 적을 우선함
                    if (distToStrategic > this.attackRange) {
                        shouldSwitch = true;
                    }
                }

                if (shouldSwitch) {
                    strategicTarget = nearest;
                }
            }
        }

        this.ai.currentTarget = strategicTarget;
    }

    executeMovement() {
        const target = this.ai.currentTarget;
        if (!target || !target.active) {
            this.setVelocity(0, 0);
            return;
        }

        // 대열 유지 모드라면? -> 적 추격도 안 하고, 뒷걸음질도 안 함. 제자리 사수.
        if (this.team === 'blue' && this.scene.squadState === 'FORMATION') {
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
        const diffX = target.x - this.x;
        if (Math.abs(diffX) < 10) return;

        const isBlue = this.team === 'blue';
        if (target.x < this.x) this.setFlipX(isBlue ? false : true);
        else this.setFlipX(isBlue ? true : false);
    }

    onTakeDamage() {}
}