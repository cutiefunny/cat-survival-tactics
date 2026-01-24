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

        // [Fix 1] UnitAI의 타이머 수동 갱신 (Shooter가 ai.update를 안 쓰므로 직접 해줘야 함)
        if (this.ai.wallCollisionTimer > 0) this.ai.wallCollisionTimer -= delta;
        if (this.ai.forcePathfindingTimer > 0) this.ai.forcePathfindingTimer -= delta;

        // [Fix 2] 벽 충돌 중이라면 AI의 회피 기동(미끄러짐)을 우선 수행하고 리턴
        if (this.ai.wallCollisionTimer > 0) {
            this.setVelocity(
                this.ai.wallCollisionVector.x * this.moveSpeed, 
                this.ai.wallCollisionVector.y * this.moveSpeed
            );
            this.updateFlipX();
            return; 
        }

        // [Logic] 도발 상태 처리 (타이머 감소)
        this.ai.processAggro(delta);

        // 타겟 유효성 체크
        if (!this.ai.currentTarget || !this.ai.currentTarget.active || this.ai.currentTarget.isDying) {
            this.ai.thinkTimer = 0;
            // 타겟이 죽거나 사라지면 도발 상태도 해제
            if (this.ai.isProvoked) this.ai.provokedTimer = 0;
        }

        // 1. [생존] 카이팅 (Kiting) - 도발 상태여도 생존을 위해 너무 가까운 적에게서는 도망침
        if (!isFormationMode) {
            const nearestThreat = this.ai.findNearestEnemy(); 
            if (nearestThreat) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, nearestThreat.x, nearestThreat.y);
                const kiteDist = this.aiConfig.shooter?.kiteDistance || 200;
                const kiteDistSq = kiteDist * kiteDist;

                if (distSq < kiteDistSq * 0.6) { 
                    this.fleeFrom(nearestThreat);
                    this.lookAt(nearestThreat);
                    return;
                }
            }
        }

        this.ai.thinkTimer -= delta;

        // 2. [타겟팅] 스마트 타겟 선정
        // [Modified] 도발 상태(isProvoked)가 아닐 때만 새로운 타겟을 탐색
        // 도발 상태라면 현재 타겟(도발 시전자)을 계속 유지함
        if (!this.ai.isProvoked && this.ai.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.ai.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            
            this.decideTargetSmart();
        }

        // 3. [이동] 사거리 유지 및 추격
        // [Modified] 도발 상태일 때도 무조건 돌진하지 않고, 이 메서드를 통해 사거리 유지(카이팅)를 수행함
        this.executeMovement(delta); 
        
        // 4. [시선] 타겟 바라보기
        if (this.ai.currentTarget && this.ai.currentTarget.active) {
            this.lookAt(this.ai.currentTarget);
        } else {
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

        // 2. 전략적 타겟 탐색 (점수제)
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

        // 3. 기회주의적 사격 (가까운 적 우선 전환)
        const nearest = this.ai.findNearestEnemy();
        if (nearest && nearest.active && !nearest.isDying) {
            const distToNearest = Phaser.Math.Distance.Between(this.x, this.y, nearest.x, nearest.y);
            
            if (distToNearest <= this.attackRange) {
                let shouldSwitch = false;

                if (!strategicTarget) {
                    shouldSwitch = true;
                } else {
                    const distToStrategic = Phaser.Math.Distance.Between(this.x, this.y, strategicTarget.x, strategicTarget.y);
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

    executeMovement(delta) {
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
            // [Fix 3] 사거리 밖이면 접근: UnitAI에 추가된 moveToTargetSmart 사용
            if (this.ai.moveToTargetSmart) {
                this.ai.moveToTargetSmart(delta);
            } else {
                // 혹시 UnitAI 업데이트가 안 되었을 경우를 대비한 폴백
                this.ai.moveToLocationSmart(target.x, target.y, delta);
            }
        } else if (distSq < kiteDistSq) {
            // 너무 가까우면 뒤로 살짝 빠짐 (Micro-Kiting)
            const angle = Phaser.Math.Angle.Between(target.x, target.y, this.x, this.y);
            this.scene.physics.velocityFromRotation(angle, this.moveSpeed * 0.5, this.body.velocity);
            
            // 직접 이동 중에는 경로 배열을 비워 꼬임 방지
            this.ai.currentPath = [];
        } else {
            // 적정 거리면 정지
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
        
        // 도망갈 때도 경로는 초기화
        this.ai.currentPath = [];
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