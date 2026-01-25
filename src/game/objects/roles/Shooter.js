import Unit from '../Unit';
import Phaser from 'phaser';

export default class Shooter extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Shooter';
        stats.attackRange = stats.attackRange || 250; 
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    // [Formation Logic] 대열 유지 중이라도 사거리 내 적은 공격
    updateNpcLogic(delta) {
        if (this.team === 'blue' && this.scene.squadState === 'FORMATION') {
            const nearest = this.ai.findNearestEnemy();
            if (nearest && nearest.active && !nearest.isDying) {
                const dist = Phaser.Math.Distance.Between(this.x, this.y, nearest.x, nearest.y);
                
                if (dist <= this.attackRange) {
                    this.updateAI(delta);
                    return;
                }
            }
        }
        
        super.updateNpcLogic(delta);
    }

    updateAI(delta) {
        const isFormationMode = (this.team === 'blue' && this.scene.squadState === 'FORMATION');

        // [Fix 1] UnitAI의 타이머 수동 갱신
        if (this.ai.wallCollisionTimer > 0) this.ai.wallCollisionTimer -= delta;
        if (this.ai.forcePathfindingTimer > 0) this.ai.forcePathfindingTimer -= delta;

        // [Fix 2] 벽 충돌 회피 우선
        if (this.ai.wallCollisionTimer > 0) {
            this.setVelocity(
                this.ai.wallCollisionVector.x * this.moveSpeed, 
                this.ai.wallCollisionVector.y * this.moveSpeed
            );
            this.updateFlipX();
            return; 
        }

        this.ai.processAggro(delta);

        // 타겟 유효성 체크 및 도발 해제
        if (!this.ai.currentTarget || !this.ai.currentTarget.active || this.ai.currentTarget.isDying) {
            this.ai.thinkTimer = 0;
            if (this.ai.isProvoked) this.ai.provokedTimer = 0;
        }

        // 1. [생존] 카이팅 (Kiting)
        if (!isFormationMode) {
            const nearestThreat = this.ai.findNearestEnemy(); 
            if (nearestThreat) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, nearestThreat.x, nearestThreat.y);
                const kiteDist = this.aiConfig.shooter?.kiteDistance || 200;
                const kiteDistSq = kiteDist * kiteDist;

                // [수정] 위험 반경(60%) 내로 적이 들어오면 무조건 그 적을 타겟으로 변경하고 도망침
                if (distSq < kiteDistSq * 0.6) { 
                    this.ai.currentTarget = nearestThreat; // 타겟 강제 변경 (시선 불일치 방지)
                    this.fleeFrom(nearestThreat);
                    this.lookAt(nearestThreat);
                    return;
                }
            }
        }

        this.ai.thinkTimer -= delta;

        // 2. [타겟팅] 스마트 타겟 선정
        if (!this.ai.isProvoked && this.ai.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.ai.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            
            this.decideTargetSmart();
        }

        // 3. [이동] 사거리 유지 및 추격
        this.executeMovement(delta); 
        
        // 4. [시선] 타겟 바라보기
        if (this.ai.currentTarget && this.ai.currentTarget.active) {
            this.lookAt(this.ai.currentTarget);
        } else {
            // 타겟이 없을 때는 이동 방향대로 시선 처리
            if (this.body.velocity.x < -5) this.setFlipX(false);
            else if (this.body.velocity.x > 5) this.setFlipX(true);
        }
    }

    decideTargetSmart() {
        // 1. 자기 방어 (나를 노리는 적 우선)
        const chasers = this.findEnemiesTargetingMe();
        if (chasers.length > 0) {
            this.ai.currentTarget = this.getClosestUnit(chasers);
            return;
        }

        // 2. 전략적 타겟 탐색 (기본 점수제)
        const enemies = this.targetGroup.getChildren();
        let bestTarget = null;
        let highestScore = -Infinity;

        const myX = this.x;
        const myY = this.y;

        const weights = { distance: 1.0, lowHp: 3.0 };
        const rolePriority = { 'Healer': 500, 'Shooter': 200 };
        const STICKY_BONUS = 300; 

        for (const enemy of enemies) {
            if (!enemy.active || enemy.isDying) continue;

            const dist = Phaser.Math.Distance.Between(myX, myY, enemy.x, enemy.y);
            
            let score = -(dist * weights.distance);
            score -= (enemy.hp * weights.lowHp);
            score += (rolePriority[enemy.role] || 0);

            if (enemy === this.ai.currentTarget) {
                score += STICKY_BONUS;
            }

            if (score > highestScore) {
                highestScore = score;
                bestTarget = enemy;
            }
        }

        let strategicTarget = bestTarget;

        // 3. [수정] 기회주의적 사격 + 근접 위협 즉시 대응
        const nearest = this.ai.findNearestEnemy();
        if (nearest && nearest.active && !nearest.isDying) {
            const distToNearest = Phaser.Math.Distance.Between(this.x, this.y, nearest.x, nearest.y);
            
            // [중요] 공격 사거리 내에 들어왔다면
            if (distToNearest <= this.attackRange) {
                let shouldSwitch = false;

                if (!strategicTarget) {
                    shouldSwitch = true;
                } else {
                    const distToStrategic = Phaser.Math.Distance.Between(this.x, this.y, strategicTarget.x, strategicTarget.y);
                    
                    // [버그 수정] 기존 타겟이 사거리 밖이거나, 
                    // 혹은 가장 가까운 적이 너무 가까워서(150px 이내) 당장 처리가 급할 때 타겟 변경
                    if (distToStrategic > this.attackRange || distToNearest < 150) {
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

    executeMovement(delta) {
        const target = this.ai.currentTarget;
        if (!target || !target.active) {
            this.setVelocity(0, 0);
            return;
        }

        if (this.team === 'blue' && this.scene.squadState === 'FORMATION') {
            this.setVelocity(0, 0);
            return;
        }

        const distSq = Phaser.Math.Distance.Squared(this.x, this.y, target.x, target.y);
        const atkRange = this.attackRange;
        const atkRangeSq = atkRange * atkRange;
        const kiteDistSq = (atkRange * 0.8) ** 2;

        if (distSq > atkRangeSq) {
            if (this.ai.moveToTargetSmart) {
                this.ai.moveToTargetSmart(delta);
            } else {
                this.ai.moveToLocationSmart(target.x, target.y, delta);
            }
        } else if (distSq < kiteDistSq) {
            // Micro-Kiting
            const angle = Phaser.Math.Angle.Between(target.x, target.y, this.x, this.y);
            this.scene.physics.velocityFromRotation(angle, this.moveSpeed * 0.5, this.body.velocity);
            this.ai.currentPath = [];
        } else {
            this.setVelocity(0, 0);
            this.ai.currentPath = [];
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
        
        this.ai.currentPath = [];
    }

    // [수정] 팀 구분 로직 제거 및 시선 처리 단순화
    // 이동 방향(Velocity)과 바라보는 방향(FlipX)의 로직을 일치시켜 흔들림 방지
    lookAt(target) {
        const diffX = target.x - this.x;
        if (Math.abs(diffX) < 10) return; // 10px 이내는 현상 유지

        // Unit.js의 updateFlipX 로직(속도 < 0 일때 FlipX=false)과 일치시킴
        // 타겟이 왼쪽에 있으면 false, 오른쪽에 있으면 true
        if (target.x < this.x) {
            this.setFlipX(false);
        } else {
            this.setFlipX(true);
        }
    }

    onTakeDamage() {}
}