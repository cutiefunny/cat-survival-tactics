import Unit from '../Unit';
import Phaser from 'phaser';

export default class Shooter extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Shooter';
        stats.attackRange = stats.attackRange || 250; 
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        this.isFlanking = false;
    }

    // [Formation Logic] 대열 유지 중이라도 사거리 내 적은 공격
    updateNpcLogic(delta) {
        if (this.team === 'blue' && this.scene.squadState === 'FORMATION') {
            const nearest = this.ai.findNearestEnemy();
            if (nearest && nearest.active && !nearest.isDying) {
                const dist = Phaser.Math.Distance.Between(this.x, this.y, nearest.x, nearest.y);
                
                // 적이 사거리 안에 있으면 전투 로직(updateAI) 실행
                if (dist <= this.attackRange) {
                    this.updateAI(delta);
                    return;
                }
            }
        }
        
        // 적이 없으면 리더 따라가기
        super.updateNpcLogic(delta);
    }

    updateAI(delta) {
        const isFormationMode = (this.team === 'blue' && this.scene.squadState === 'FORMATION');

        // [Fix 1] 도발(Taunt) 상태 체크 (필수)
        // 이 로직이 없으면 탱커가 도발해도 무시하고 도망가거나 다른 적을 쏨
        this.ai.processAggro(delta);
        if (this.ai.isProvoked) {
            if (this.ai.currentTarget && this.ai.currentTarget.active) {
                // 도발 상태에서는 카이팅(도망) 하지 않고 도발자에게 끌려감
                this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
                this.updateFlipX();
            }
            return; // 여기서 리턴하여 아래의 타겟 변경/카이팅 로직 차단
        }

        // [Fix 2] 타겟이 없거나 죽었으면 즉시 반응
        if (!this.ai.currentTarget || !this.ai.currentTarget.active || this.ai.currentTarget.isDying) {
            this.ai.thinkTimer = 0;
        }

        // 1. [생존] 카이팅 (Kiting)
        // 대열 유지 모드가 아닐 때만 도망가기 허용
        if (!isFormationMode) {
            const nearestThreat = this.ai.findNearestEnemy(); 
            if (nearestThreat) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, nearestThreat.x, nearestThreat.y);
                const kiteDist = this.aiConfig.shooter?.kiteDistance || 200;
                const kiteDistSq = kiteDist * kiteDist;

                // 너무 가까우면 공격보다 거리 벌리기 우선
                if (distSq < kiteDistSq * 0.6) { 
                    this.fleeFrom(nearestThreat);
                    this.lookAt(nearestThreat);
                    return;
                }
            }
        }

        this.ai.thinkTimer -= delta;

        // 2. [타겟팅] 스마트 타겟 선정
        if (this.ai.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.ai.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            
            this.decideTargetSmart();
        }

        // 3. [이동] 사거리 유지 및 추격
        this.executeMovement();
        
        // 4. [시선] 타겟 바라보기
        if (this.ai.currentTarget && this.ai.currentTarget.active) {
            this.lookAt(this.ai.currentTarget);
        } else {
            if (this.body.velocity.x < -5) this.setFlipX(false);
            else if (this.body.velocity.x > 5) this.setFlipX(true);
        }
    }

    decideTargetSmart() {
        // 1. 나를 노리는 적(Chasers)이 있으면 최우선 처리 (자기 방어)
        const chasers = this.findEnemiesTargetingMe();
        if (chasers.length > 0) {
            this.ai.currentTarget = this.getClosestUnit(chasers);
            this.isFlanking = false;
            return;
        }

        // 2. 전략적 타겟 탐색 (Scoring System with Stickiness)
        // UnitAI의 findStrategicTarget을 직접 구현하여 Stickiness(가산점)를 추가함
        const enemies = this.targetGroup.getChildren();
        let bestTarget = null;
        let highestScore = -Infinity;

        const myX = this.x;
        const myY = this.y;

        // 가중치 설정
        const weights = { distance: 1.0, lowHp: 3.0 };
        const rolePriority = { 'Healer': 500, 'Shooter': 200 };
        const STICKY_BONUS = 300; // 현재 타겟 유지 보너스

        for (const enemy of enemies) {
            if (!enemy.active || enemy.isDying) continue;

            const dist = Phaser.Math.Distance.Between(myX, myY, enemy.x, enemy.y);
            
            // 점수 계산: (거리 점수) + (체력 점수) + (직업 보너스)
            let score = -(dist * weights.distance);
            score -= (enemy.hp * weights.lowHp);
            score += (rolePriority[enemy.role] || 0);

            // [Stickiness] 현재 타겟에게 큰 가산점을 주어 잦은 변경 방지
            if (enemy === this.ai.currentTarget) {
                score += STICKY_BONUS;
            }

            if (score > highestScore) {
                highestScore = score;
                bestTarget = enemy;
            }
        }

        let strategicTarget = bestTarget;

        // 3. 기회주의적 사격 (Opportunistic Fire)
        // 전략적 타겟(예: 멀리 있는 힐러)을 잡았더라도, 당장 내 코앞(사거리 내)에 적이 있으면 그 놈부터 쏨
        const nearest = this.ai.findNearestEnemy();
        if (nearest && nearest.active && !nearest.isDying) {
            const distToNearest = Phaser.Math.Distance.Between(this.x, this.y, nearest.x, nearest.y);
            
            if (distToNearest <= this.attackRange) {
                let shouldSwitch = false;

                if (!strategicTarget) {
                    shouldSwitch = true;
                } else {
                    const distToStrategic = Phaser.Math.Distance.Between(this.x, this.y, strategicTarget.x, strategicTarget.y);
                    // 전략 타겟이 사거리 밖이라면, 사거리 안의 가까운 적 선택
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

        // 대열 유지 모드라면 제자리 사수 (이동 금지)
        if (this.team === 'blue' && this.scene.squadState === 'FORMATION') {
            this.setVelocity(0, 0);
            return;
        }

        const distSq = Phaser.Math.Distance.Squared(this.x, this.y, target.x, target.y);
        const atkRange = this.attackRange;
        const atkRangeSq = atkRange * atkRange;
        const kiteDistSq = (atkRange * 0.8) ** 2;

        if (distSq > atkRangeSq) {
            // 사거리 밖이면 접근
            this.scene.physics.moveToObject(this, target, this.moveSpeed);
        } else if (distSq < kiteDistSq) {
            // 너무 가까우면 뒤로 살짝 빠짐 (Micro-Kiting)
            const angle = Phaser.Math.Angle.Between(target.x, target.y, this.x, this.y);
            this.scene.physics.velocityFromRotation(angle, this.moveSpeed * 0.5, this.body.velocity);
        } else {
            // 적정 거리면 정지
            this.setVelocity(0, 0);
        }
    }

    findEnemiesTargetingMe() {
        const enemies = this.targetGroup.getChildren();
        return enemies.filter(enemy => enemy.active && enemy.ai && enemy.ai.currentTarget === this);
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