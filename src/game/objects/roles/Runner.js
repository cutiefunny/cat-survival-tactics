import Unit from '../Unit';
import Phaser from 'phaser';

export default class Runner extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Runner';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        this.jumpDistance = stats.jumpDistance || 200;
        this.jumpDuration = stats.jumpDuration || 420;
        this.isJumping = false; // 초기화
    }

    updateAI(delta) {
        // 1. 도발 체크
        this.ai.processAggro(delta);
        if (this.ai.isProvoked) {
            // 도발당하면 암살/회피 로직 무시하고 타겟에게 직진
            if (this.ai.currentTarget && this.ai.currentTarget.active) {
                 this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
                 this.updateFlipX();
            }
            return;
        }

        // 2. 도망 상태 체크 (도발 아니면 도망 가능)
        if (this.ai.fleeTimer > 0) {
            this.runTowardsSafety();
            this.ai.currentTarget = null;
            return;
        }

        this.ai.thinkTimer -= delta;

        // 3. 타겟 선정
        if (this.ai.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.ai.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;
            this.decideNextMove();
        }

        // 4. 이동
        if (this.ai.currentTarget && this.ai.currentTarget.active) {
            this.moveIdeallyTowards(this.ai.currentTarget);
            this.updateFlipX(); 
        } else {
            this.ai.followLeader();
        }
    }

    runTowardsSafety() {
        const nearestEnemy = this.ai.findNearestEnemy();
        if (nearestEnemy) {
            const angle = Phaser.Math.Angle.Between(nearestEnemy.x, nearestEnemy.y, this.x, this.y);
            this.scene.physics.velocityFromRotation(angle, this.moveSpeed * 1.3, this.body.velocity);
            this.updateFlipX();
        } else {
            this.ai.followLeader();
        }
    }

    decideNextMove() {
        const enemyShooter = this.findEnemyShooter();

        if (enemyShooter) {
            const ambushPoint = this.calculateAmbushPoint(enemyShooter);
            const distSq = Phaser.Math.Distance.Squared(this.x, this.y, ambushPoint.x, ambushPoint.y);
            
            if (distSq > 50 * 50) {
                this.ai.currentTarget = { 
                    x: ambushPoint.x, 
                    y: ambushPoint.y, 
                    active: true, 
                    isAmbushPoint: true, 
                    actualTarget: enemyShooter 
                };
            } else {
                this.ai.currentTarget = enemyShooter;
            }
        } 
        else {
            // [Fix] 메서드 구현 추가로 오류 해결
            const engagingEnemy = this.findEnemyEngagingAlly();
            if (engagingEnemy) {
                this.ai.currentTarget = engagingEnemy;
            } else {
                this.ai.currentTarget = this.ai.findNearestEnemy();
            }
        }
    }

    onTakeDamage() {
        // 도발 상태면 맞아도 도망가지 않음
        if (this.ai.isProvoked) return;

        const target = this.ai.currentTarget;
        if (target) {
            if (target.role === 'Shooter') return;
            if (target.isAmbushPoint && target.actualTarget?.role === 'Shooter') return;
        }

        this.ai.fleeTimer = this.aiConfig.runner?.fleeDuration || 1500;
        this.ai.currentTarget = null;
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

    // [New] 아군과 교전 중인(나를 보지 않는) 적 찾기
    findEnemyEngagingAlly() {
        const enemies = this.targetGroup.getChildren();
        let closestEnemy = null;
        let minDistSq = Infinity;

        for (let enemy of enemies) {
            if (!enemy.active || enemy.isDying) continue;
            
            // 적의 현재 타겟 확인 (UnitAI 또는 Unit 속성 호환)
            const enemyTarget = enemy.ai ? enemy.ai.currentTarget : enemy.currentTarget;

            if (enemyTarget && enemyTarget.active && !enemyTarget.isDying) {
                // 적의 타겟이 '나'가 아니고, '나의 팀원'일 때 (즉, 다른 곳을 보고 있을 때)
                if (enemyTarget !== this && enemyTarget.team === this.team) {
                    const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        closestEnemy = enemy;
                    }
                }
            }
        }
        return closestEnemy;
    }

    moveIdeallyTowards(target) {
        const angleToTarget = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        let forceX = Math.cos(angleToTarget);
        let forceY = Math.sin(angleToTarget);

        const avoidanceForce = this.calculateAvoidanceForce(target.actualTarget || target);
        
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

    // =====================
    // 점프 스킬 구현
    // =====================

    tryUseSkill() {
        console.log('[Runner] tryUseSkill 호출됨', {
            isDying: this.isDying,
            isJumping: this.isJumping,
            role: this.role
        });
        
        if (this.isDying || this.isJumping) {
            console.log('[Runner] 점프 불가 상태');
            return;
        }
        
        console.log('[Runner] performSkill 실행');
        this.performSkill();
    }

    performSkill() {
        console.log('[Runner] performSkill 호출됨');
        if (this.isDying || this.isJumping) return;
        this.triggerJump();
    }

    triggerJump() {
        console.log('[SMOKE] Runner.triggerJump called', {
            isJumping: this.isJumping,
            isDying: this.isDying,
            position: { x: this.x, y: this.y }
        });
        if (this.isJumping || this.isDying) {
            console.log('[SMOKE] Jump blocked: isJumping=' + this.isJumping + ', isDying=' + this.isDying);
            return;
        }

        this.isJumping = true;
        console.log('[SMOKE] Jump START - frame set to 5, depth to 9999');
        
        // [New] Jump 시 Runner body의 collision category 비활성화 (벽과 충돌 방지)
        // onCollide category 0으로 설정 → 충돌 무시, ARCADE physics optimized
        if (this.body && this.body.setCollideCallback) {
            this.body.setCollideCallback((data) => {
                // Jump 중에는 이 callback이 무시됨
                return !this.isJumping;
            });
        }
        // 더 확실한 방법: category를 0x0000으로 설정
        if (this.body && typeof this.body.setCollisionCategory === 'function') {
            this.originalCollisionCategory = this.body.collisionCategory || 0x0001;
            this.body.setCollisionCategory(0x0000);
            console.log('[SMOKE] Runner body collision category disabled for jump');
        } else if (this.body) {
            // Phaser ARCADE physics는 category 없을 수 있으므로, enable flag 이용
            this.body._originalEnable = this.body.enable;
            this.body.enable = false;
            console.log('[SMOKE] Runner body disabled for jump');
        }
        
        // 진행 중인 모든 애니메이션을 멈추고 점프 스프라이트 (frame 5)로 고정
        if (this.anims.isPlaying) {
            this.anims.stop();
        }
        this.setFrame(5);

        // 점프 중에는 항상 위에 그리기 (적/아군보다 앞)
        const originalDepth = this.depth;
        this.setDepth(9999);

        // 이동 방향 기준 200px 점프
        const jumpDistance = this.jumpDistance;
        const jumpDuration = this.jumpDuration;
        let dirX = 0;
        let dirY = 0;

        if (this.body && this.body.velocity.length() > 10) {
            const vel = this.body.velocity.clone().normalize();
            dirX = vel.x;
            dirY = vel.y;
        } else if (this.ai && this.ai.currentTarget && this.ai.currentTarget.active) {
            const toTarget = new Phaser.Math.Vector2(this.ai.currentTarget.x - this.x, this.ai.currentTarget.y - this.y);
            if (toTarget.lengthSq() > 0.0001) {
                toTarget.normalize();
                dirX = toTarget.x;
                dirY = toTarget.y;
            }
        } else {
            dirX = this.flipX ? 1 : -1;
            dirY = 0;
        }

        if (this.body) {
            const jumpSpeed = jumpDistance / (jumpDuration / 1000);
            this.setVelocity(dirX * jumpSpeed, dirY * jumpSpeed);
            console.log('[SMOKE] Jump velocity set', { jumpDistance, jumpDuration, jumpSpeed, dirX, dirY });
        }

        // 드래그 제거 (점프 중 감속 방지)
        this.setDrag(0);

        const originalScale = this.scale;
        const defaultOriginY = this.displayOriginY;

        // Tween 애니메이션 - duration과 높이 증가
        this.scene.tweens.add({
            targets: this,
            displayOriginY: defaultOriginY + 50,
            scaleX: originalScale * 1.2,
            scaleY: originalScale * 1.2,
            duration: jumpDuration,
            yoyo: true,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                console.log('[SMOKE] Jump END - frame reset, depth restored');
                
                // [New] Jump 완료 시 Runner body collision 복원
                if (this.body && typeof this.body.setCollisionCategory === 'function') {
                    this.body.setCollisionCategory(this.originalCollisionCategory || 0x0001);
                    console.log('[SMOKE] Runner body collision category restored after jump');
                } else if (this.body && this.body._originalEnable !== undefined) {
                    this.body.enable = this.body._originalEnable;
                    console.log('[SMOKE] Runner body re-enabled after jump');
                }
                
                this.isJumping = false;
                this.setScale(originalScale);
                this.setOrigin(0.5, 0.5);
                this.setDrag(500);
                this.setDepth(originalDepth);
                this.setVelocity(0, 0);
                this.setFrame(0);
                this.checkLandingCollision();
            }
        });
    }

    checkLandingCollision() {
        if (!this.active || this.isDying) return;

        console.log(`[SMOKE] Runner landing collision check at (${this.x}, ${this.y}), attackRange: ${this.attackRange}`);

        // 착지 지점의 적과 충돌 체크
        const enemies = this.targetGroup.getChildren();
        console.log(`[SMOKE] Enemy count: ${enemies.length}`);
        for (let enemy of enemies) {
            if (enemy.active && !enemy.isDying) {
                const dist = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
                console.log(`[SMOKE] Enemy check: dist=${dist.toFixed(2)}, threshold=${this.attackRange}`);
                if (dist < this.attackRange) {
                    // 착지 공격
                    const enemyInfo = enemy.role ? `${enemy.role}(hp:${enemy.health})` : `Unit(hp:${enemy.health})`;
                    console.log(`[SMOKE] Landing attack on ${enemyInfo} at distance ${dist.toFixed(2)}`);
                    enemy.takeDamage(this.attackPower, this);
                    break;
                }
            }
        }
    }

    // 점프 중에는 프레임 유지 및 방향전환/이동 방지
    updatePlayerMovement() {
        if (this.isJumping) {
            // 점프 중에는 입력 처리 무시 (방향키 입력 무시)
            return;
        }
        // 점프 중이 아니면 부모 클래스의 updatePlayerMovement 호출
        super.updatePlayerMovement();
    }

    // 점프 중에는 방향전환 금지
    updateFlipX() {
        if (this.isJumping) {
            // 점프 중에는 방향전환 무시
            return;
        }
        // 점프 중이 아니면 부모 클래스의 updateFlipX 호출
        super.updateFlipX();
    }

    // 점프 중에는 프레임 유지
    updateAnimation() {
        if (this.isJumping) {
            // 점프 중에는 애니메이션 업데이트 무시 (프레임 5 유지)
            return;
        }
        // 점프 중이 아니면 부모 클래스의 updateAnimation 호출
        super.updateAnimation();
    }
}