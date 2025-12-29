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

        // 2. 타겟 선정 (Think Phase)
        if (this.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            
            this.decideNextMove();
        }

        // 3. 이동 실행 (Movement Phase)
        if (this.currentTarget && this.currentTarget.active) {
            // [핵심] 암살자 이동 로직: 타겟을 향해 가되, 다른 적은 피해서 돌아감
            this.moveIdeallyTowards(this.currentTarget);
            this.updateFlipX(); 
        } else {
            this.setVelocity(0, 0);
        }
    }

    decideNextMove() {
        // [우선순위 1] 적 팀의 'Shooter'를 최우선으로 찾음
        const enemyShooter = this.findEnemyShooter();

        if (enemyShooter) {
            // 슈터가 있으면 그 녀석의 '뒤쪽(Ambush Point)'을 노림
            const ambushPoint = this.calculateAmbushPoint(enemyShooter);
            
            // 아직 도착 못했으면 암살 지점으로, 도착했거나 가까우면 슈터 자체를 타겟
            const distSq = Phaser.Math.Distance.Squared(this.x, this.y, ambushPoint.x, ambushPoint.y);
            
            if (distSq > 50 * 50) {
                this.currentTarget = { x: ambushPoint.x, y: ambushPoint.y, active: true, isAmbushPoint: true, actualTarget: enemyShooter };
            } else {
                this.currentTarget = enemyShooter;
            }
        } 
        else {
            // [우선순위 2] 슈터가 없으면 기존 로직 (교전 중인 적 or 가장 가까운 적)
            const engagingEnemy = this.findEnemyEngagingAlly();
            if (engagingEnemy) {
                this.currentTarget = engagingEnemy;
            } else {
                this.currentTarget = this.findNearestEnemy();
            }
        }
    }

    // [NEW] 적군 슈터 탐색
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

    // [NEW] 장애물 우회 이동 (Steering Behavior: Seek + Avoid)
    moveIdeallyTowards(target) {
        // 1. 목표를 향한 기본적인 힘 (Seek)
        const angleToTarget = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        let forceX = Math.cos(angleToTarget);
        let forceY = Math.sin(angleToTarget);

        // 2. 방해물(타겟이 아닌 다른 적들) 회피 힘 추가 (Avoidance)
        const avoidanceForce = this.calculateAvoidanceForce(target.actualTarget || target);
        
        // 회피 힘을 더함 (가중치 2.5배로 설정하여 회피를 우선시)
        forceX += avoidanceForce.x * 2.5;
        forceY += avoidanceForce.y * 2.5;

        // 최종 벡터 정규화 및 속도 적용
        const vec = new Phaser.Math.Vector2(forceX, forceY).normalize().scale(this.moveSpeed);
        this.setVelocity(vec.x, vec.y);
    }

    // [NEW] 회피 벡터 계산
    calculateAvoidanceForce(primaryTarget) {
        let pushX = 0;
        let pushY = 0;
        
        // 감지 범위 (이 거리 안의 방해물은 피함)
        const detectionRadiusSq = 120 * 120; 

        const enemies = this.targetGroup.getChildren();
        for (let enemy of enemies) {
            // 죽었거나, 내 진짜 목표물이면 피하지 않고 돌진
            if (!enemy.active || enemy === primaryTarget) continue;

            const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
            
            // 내 경로상의 방해물(탱커 등)이 너무 가까우면
            if (distSq < detectionRadiusSq) {
                const dist = Math.sqrt(distSq);
                // 거리가 가까울수록 더 강하게 밀어냄
                const force = (120 - dist) / 120; 
                
                // 적의 반대 방향으로 힘 생성
                const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.x, this.y);
                pushX += Math.cos(angle) * force;
                pushY += Math.sin(angle) * force;
            }
        }
        return { x: pushX, y: pushY };
    }

    calculateAmbushPoint(enemy) {
        let angle;
        // 적이 이동 중이면 그 뒤쪽, 멈춰있으면 내 위치 기준 뒤쪽
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
        // 맞으면 길게 도망 (생존)
        this.fleeTimer = this.aiConfig.runner?.fleeDuration || 1500;
        this.currentTarget = null;
    }
}