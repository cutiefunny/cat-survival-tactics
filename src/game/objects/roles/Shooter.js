import Unit from '../Unit';
import Phaser from 'phaser';

export default class Shooter extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Shooter';
        stats.attackRange = stats.attackRange || 250; 
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        this.isFlanking = false;

        if (!isLeader && team === 'blue') this.setTint(0x99ff99);
    }

    updateAI(delta) {
        // 1. [생존 최우선] 적과의 거리 체크 (가장 가까운 위협 감지)
        // 타겟팅 여부와 상관없이, 내 몸 근처에 적이 붙으면 무조건 도망
        const nearestThreat = this.findNearestEnemy(); 
        if (nearestThreat) {
            const distSq = Phaser.Math.Distance.Squared(this.x, this.y, nearestThreat.x, nearestThreat.y);
            const kiteDist = this.aiConfig.shooter?.kiteDistance || 200;
            const kiteDistSq = kiteDist * kiteDist;

            // 안전거리보다 가까우면 즉시 도망 (Panic Mode)
            if (distSq < kiteDistSq) {
                this.fleeFrom(nearestThreat);
                // 도망치면서도 시선은 위협 대상을 주시 (Strafing)
                this.lookAt(nearestThreat);
                return; // 이후 로직(공격/이동) 무시
            }
        }

        this.thinkTimer -= delta;

        // 2. 타겟 선정 (Think Phase)
        if (this.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            
            this.decideTarget();
        }

        // 3. 이동 실행 (Movement Phase)
        this.executeMovement();
        
        // 4. 시선 처리
        if (this.currentTarget && this.currentTarget.active) {
            this.lookAt(this.currentTarget);
        } else {
            super.updateFlipX();
        }
    }

    decideTarget() {
        // [우선순위 1] 나를 노리는 적(Chaser) 찾기
        const chasers = this.findEnemiesTargetingMe();
        
        if (chasers.length > 0) {
            // 나를 노리는 놈들 중 가장 가까운 놈 선택
            this.currentTarget = this.getClosestUnit(chasers);
            this.isFlanking = false; // 맞대응 모드 (우회 안 함)
        } 
        else {
            // [우선순위 2] 나를 노리는 적이 없으면 -> 가장 약한 적 암살
            const weakest = this.findWeakestEnemy();
            if (weakest) {
                this.currentTarget = weakest;
                this.isFlanking = true; // 우회 모드 (길게 돌아가기)
            } else {
                // 적이 없거나 다 똑같으면 기본 가까운 적
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

        // 이미 flee 로직은 updateAI 최상단에서 처리했으므로, 여기서는 접근/공격만 신경 씀
        
        if (this.isFlanking) {
            // [우회 모드] 약한 적을 잡을 때는 정면이 아닌 측후방으로 크게 돔
            const flankPos = this.calculateFlankPosition(target);
            // 플랭크 지점으로 이동 (사거리 내에 들어와도, 더 유리한 위치를 잡기 위해 이동할 수 있음)
            // 다만 사거리 안이고 공격 쿨타임이 찼다면 멈춰서 쏘는 게 이득일 수 있으니, 
            // 여기서는 "사거리 밖이면 이동"으로 처리
            if (distSq > atkRangeSq * 0.8) { // 80% 거리까지는 접근
                this.scene.physics.moveTo(this, flankPos.x, flankPos.y, this.moveSpeed);
            } else {
                this.setVelocity(0, 0);
            }
        } else {
            // [일반/맞대응 모드] 나를 쫓는 적 상대로는 거리만 되면 바로 사격
            if (distSq > atkRangeSq) {
                this.scene.physics.moveToObject(this, target, this.moveSpeed);
            } else {
                this.setVelocity(0, 0);
            }
        }
    }

    // 나를 타겟팅하고 있는 적들의 목록 반환
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

    // 유닛 배열 중 가장 가까운 유닛 반환
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

    // 약한 적을 잡을 때: 적의 뒤쪽이나 측면 먼 곳을 목표로 잡음
    calculateFlankPosition(target) {
        let angle;
        // 적이 움직이고 있다면, 진행 방향의 정반대(뒤) + 약간의 오차
        if (target.body && target.body.velocity.length() > 10) {
            angle = Math.atan2(target.body.velocity.y, target.body.velocity.x) + Math.PI; 
        } else {
            // 멈춰 있다면 현재 내 위치에서 측면(90도)으로 크게 돌기
            const angleToMe = Phaser.Math.Angle.Between(target.x, target.y, this.x, this.y);
            // 랜덤하게 왼쪽(-90) 혹은 오른쪽(+90) 측면 잡기
            const flankDir = (Math.random() > 0.5 ? 1.5 : -1.5); // 약 90도
            angle = angleToMe + flankDir;
        }

        // 사거리의 90% 지점을 목표로 (너무 끝자락이면 못 쏠 수 있으므로)
        const dist = this.attackRange * 0.9; 
        return {
            x: target.x + Math.cos(angle) * dist,
            y: target.y + Math.sin(angle) * dist
        };
    }

    fleeFrom(enemy) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.x, this.y); 
        const speed = this.moveSpeed * 1.3; // 평소보다 조금 더 빨리 도망
        this.body.velocity.x = Math.cos(angle) * speed;
        this.body.velocity.y = Math.sin(angle) * speed;
    }

    lookAt(target) {
        const isBlue = this.team === 'blue';
        if (target.x < this.x) this.setFlipX(isBlue ? false : true);
        else this.setFlipX(isBlue ? true : false);
    }

    onTakeDamage() {
        // 맞으면 일단 잠깐 도망 (생존 본능 강화)
        // 위 updateAI의 거리 체크 로직이 곧바로 작동하겠지만,
        // 강제로 타겟을 끊거나 상태를 리셋할 필요가 있을 때 유용
    }
}