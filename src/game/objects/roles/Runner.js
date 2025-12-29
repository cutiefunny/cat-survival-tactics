import Unit from '../Unit';
import Phaser from 'phaser';

export default class Runner extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Runner';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    updateAI(delta) {
        // 1. 도망 상태 체크
        if (this.fleeTimer > 0) {
            this.runTowardsSafety();
            this.currentTarget = null;
            return;
        }

        this.thinkTimer -= delta;

        // 2. 타겟 선정
        if (this.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            
            this.decideNextMove();
        }

        // 3. 이동 실행
        if (this.currentTarget && this.currentTarget.active) {
            // 암살자 이동 (장애물 회피 + 타겟 추적)
            this.moveIdeallyTowards(this.currentTarget);
            this.updateFlipX(); 
        } else {
            // 타겟 없으면 리더 따라다니기 (포메이션 유지)
            this.followLeader();
        }
    }

    decideNextMove() {
        // [우선순위 1] 적 슈터 탐색
        const enemyShooter = this.findEnemyShooter();

        if (enemyShooter) {
            // 슈터의 뒤쪽(암살 포인트) 계산
            const ambushPoint = this.calculateAmbushPoint(enemyShooter);
            const distSq = Phaser.Math.Distance.Squared(this.x, this.y, ambushPoint.x, ambushPoint.y);
            
            // 아직 뒤를 못 잡았으면 암살 포인트로 이동
            if (distSq > 50 * 50) {
                this.currentTarget = { 
                    x: ambushPoint.x, 
                    y: ambushPoint.y, 
                    active: true, 
                    isAmbushPoint: true, 
                    actualTarget: enemyShooter // 진짜 목표 저장
                };
            } else {
                // 가까워지면 슈터 직접 타겟팅
                this.currentTarget = enemyShooter;
            }
        } 
        else {
            // [우선순위 2] 슈터 없으면 교전 중인 적 or 가까운 적
            const engagingEnemy = this.findEnemyEngagingAlly();
            if (engagingEnemy) {
                this.currentTarget = engagingEnemy;
            } else {
                this.currentTarget = this.findNearestEnemy();
            }
        }
    }

    // [핵심 변경] 피격 시 반응 로직
    onTakeDamage() {
        const target = this.currentTarget;
        
        // 현재 쫓고 있는 대상이 'Shooter'라면(직접 타겟팅 or 암살 경로 이동 중),
        // 데미지를 입어도 도망가지 않고(return) 계속 돌진합니다.
        if (target) {
            // 1. 슈터를 직접 때리러 가는 중
            if (target.role === 'Shooter') return;
            
            // 2. 슈터의 뒤를 잡으러 우회하는 중
            if (target.isAmbushPoint && target.actualTarget?.role === 'Shooter') return;
        }

        // 그 외(일반 적 상대)의 경우에는 맞으면 생존을 위해 도망
        this.fleeTimer = this.aiConfig.runner?.fleeDuration || 1500;
        this.currentTarget = null;
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
        // 목표 방향 벡터
        const angleToTarget = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        let forceX = Math.cos(angleToTarget);
        let forceY = Math.sin(angleToTarget);

        // 장애물 회피 벡터 (슈터가 아닌 다른 적들은 피해서 감)
        const avoidanceForce = this.calculateAvoidanceForce(target.actualTarget || target);
        
        // 회피 힘 적용
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
            // 죽었거나, 내 진짜 목표물이면 피하지 않음
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