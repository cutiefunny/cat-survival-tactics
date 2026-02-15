import Unit from '../Unit';
import Phaser from 'phaser';

export default class Runner extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Runner';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        this.jumpDistance = stats.jumpDistance || 200;
        this.jumpDuration = stats.jumpDuration || 420;
        this.isJumping = false; // 초기화
        this.provokeRadius = stats.provokeRadius || 100;
        this.provokeDuration = stats.provokeDuration || 3000;
        this.autoJumpCooldown = 0; // 자동 점프 쿨다운
        this.autoJumpInterval = stats.autoJumpInterval || 1500; // 자동 점프 간격 (ms)
        this.surroundedCheckRadius = stats.surroundedCheckRadius || 200; // 포위 감지 반경
        this.surroundedEnemyThreshold = stats.surroundedEnemyThreshold || 3; // 포위 판정 적의 수
        this.isSurrounded = false; // 포위 상태 플래그
    }

    updateAI(delta) {
        // 1. 도발 체크
        this.ai.processAggro(delta);
        // 점프 중에는 AI가 이동/명령을 덮어쓰지 않도록 즉시 종료
        if (this.isJumping) return;
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

        // 5. 포위 감지 및 긴급 탈출 점프
        this.isSurrounded = this.checkIfSurrounded();
        if (this.isSurrounded && !this.isDying && !this.isJumping) {
            // 포위 상태: 즉시 점프로 탈출
            console.log('[Runner] 포위됨! 점프로 탈출 시도');
            this.tryUseSkill();
            this.autoJumpCooldown = this.autoJumpInterval * 0.6; // 쿨다운 재설정 (약간 단축)
            return; // 다른 로직 스킵
        }

        // 6. 자동 점프 로직 (포위 아닐 때에만)
        this.autoJumpCooldown -= delta;
        if (this.autoJumpCooldown <= 0 && !this.isDying && !this.isJumping) {
            this.tryUseSkill();
            this.autoJumpCooldown = this.autoJumpInterval;
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

    checkIfSurrounded() {
        // 주변 적의 개수와 분포 확인
        const enemies = this.targetGroup.getChildren();
        const proximalEnemies = [];
        const surroundedCheckRadiusSq = this.surroundedCheckRadius * this.surroundedCheckRadius;

        for (let enemy of enemies) {
            if (enemy.active && !enemy.isDying) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq <= surroundedCheckRadiusSq) {
                    const angle = Phaser.Math.Angle.Between(this.x, this.y, enemy.x, enemy.y);
                    proximalEnemies.push({ enemy, angle });
                }
            }
        }

        // 주변 적이 충분히 많아야 함
        if (proximalEnemies.length < this.surroundedEnemyThreshold) {
            return false;
        }

        // 주변 적들이 여러 방향에서 분포하는지 확인 (포위 상태 판단)
        // 8개 방향으로 나눠서, 적들이 3개 이상의 방향에 분포하면 포위 상태
        const directions = new Set();
        for (let item of proximalEnemies) {
            const octant = Math.floor((item.angle + Math.PI) / (Math.PI / 4)) % 8; // 8각형 방향
            directions.add(octant);
        }

        // 이동 가능성 확인: 주변에 벽/블록이 많으면 고립된 것으로 판단
        const isStuck = this.checkIfStuck();

        const isSurrounded = directions.size >= 3 && isStuck;
        if (isSurrounded) {
            console.log(`[Runner] 포위 감지: 적 ${proximalEnemies.length}명, 방향 ${directions.size}개, 고립=${isStuck}`);
        }
        return isSurrounded;
    }

    checkIfStuck() {
        // 8방향으로 이동 가능 여부 확인
        const testDistance = 50; // 테스트 거리
        const directions = [
            { x: 1, y: 0 },   // 동
            { x: 1, y: -1 },  // 북동
            { x: 0, y: -1 },  // 북
            { x: -1, y: -1 }, // 북서
            { x: -1, y: 0 },  // 서
            { x: -1, y: 1 },  // 남서
            { x: 0, y: 1 },   // 남
            { x: 1, y: 1 }    // 남동
        ];

        let stuckDirections = 0;
        for (let dir of directions) {
            const testX = this.x + dir.x * testDistance;
            const testY = this.y + dir.y * testDistance;

            // 해당 방향이 벽/블록으로 막혀 있는지 확인
            let isBlocked = false;

            // 1. 타일 레이어 체크
            if (this.scene.wallLayer) {
                const tile = this.scene.wallLayer.getTileAtWorldXY(testX, testY);
                if (tile && tile.canCollide) isBlocked = true;
            }
            if (!isBlocked && this.scene.blockLayer) {
                const tile = this.scene.blockLayer.getTileAtWorldXY(testX, testY);
                if (tile && tile.canCollide) isBlocked = true;
            }

            // 2. Block Object 체크
            if (!isBlocked && this.scene.blockObjectGroup) {
                const blocks = this.scene.blockObjectGroup.getChildren();
                for (const block of blocks) {
                    if (!block.active) continue;
                    const blockBounds = block.getBounds ? block.getBounds() : 
                        new Phaser.Geom.Rectangle(block.x - block.width/2, block.y - block.height/2, block.width, block.height);
                    
                    if (blockBounds.contains(testX, testY)) {
                        isBlocked = true;
                        break;
                    }
                }
            }

            // 3. Wall Object 체크
            if (!isBlocked && this.scene.wallObjectGroup) {
                const walls = this.scene.wallObjectGroup.getChildren();
                for (const wall of walls) {
                    if (!wall.active) continue;
                    const wallBounds = wall.getBounds ? wall.getBounds() : 
                        new Phaser.Geom.Rectangle(wall.x - wall.width/2, wall.y - wall.height/2, wall.width, wall.height);
                    
                    if (wallBounds.contains(testX, testY)) {
                        isBlocked = true;
                        break;
                    }
                }
            }

            if (isBlocked) stuckDirections++;
        }

        // 탈출 가능 방향이 2개 이하면 고립된 상태
        return stuckDirections >= 6;
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

        // 점프 종료 처리 함수 (재사용)
        const endJump = () => {
            console.log('[SMOKE] Jump END - frame reset, depth restored');
            
            // Jump 완료 시 Runner body collision 복원
            if (this.body && typeof this.body.setCollisionCategory === 'function') {
                this.body.setCollisionCategory(this.originalCollisionCategory || 0x0001);
                console.log('[SMOKE] Runner body collision category restored after jump');
            } else if (this.body && this.body._originalEnable !== undefined) {
                this.body.enable = this.body._originalEnable;
                console.log('[SMOKE] Runner body re-enabled after jump');
            }
            
            // 착지 위치가 벽/블록과 겹치는지 체크하고 밀어내기
            this.pushOutOfWalls();
            
            this.isJumping = false;
            this.setScale(originalScale);
            this.setOrigin(0.5, 0.5);
            this.setDrag(500);
            this.setDepth(originalDepth);
            this.setVelocity(0, 0);
            this.setFrame(0);
            this.checkLandingCollision();
        };

        // Tween 애니메이션 - duration과 높이 증가
        const jumpTween = this.scene.tweens.add({
            targets: this,
            displayOriginY: defaultOriginY + 50,
            scaleX: originalScale * 1.2,
            scaleY: originalScale * 1.2,
            duration: jumpDuration,
            yoyo: true,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                // 매 프레임마다 Blocks object와 충돌 체크
                if (this.scene.blockObjectGroup) {
                    const blocks = this.scene.blockObjectGroup.getChildren();
                    for (const block of blocks) {
                        if (block.active && this.body) {
                            // 충돌 체크 - overlap 사용
                            const bounds = this.getBounds();
                            const blockBounds = block.getBounds ? block.getBounds() : new Phaser.Geom.Rectangle(block.x - block.width/2, block.y - block.height/2, block.width, block.height);
                            
                            if (Phaser.Geom.Intersects.RectangleToRectangle(bounds, blockBounds)) {
                                console.log('[SMOKE] Jump interrupted - hit block object');
                                // 충돌 시 방향 반대로 튕겨나가기 (간단한 반사 효과)
                                const angle = Phaser.Math.Angle.Between(block.x, block.y, this.x, this.y);
                                const bounceSpeed = 200;
                                this.setVelocity(Math.cos(angle) * bounceSpeed, Math.sin(angle) * bounceSpeed);
                            }
                        }
                    }
                }
            },
            onComplete: () => {
                endJump();
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

        // 착지 시 도발 효과 실행
        this.triggerLandingProvoke();
    }

    // 벽/블록에 겹쳐 있으면 밖으로 밀어내기
    pushOutOfWalls() {
        // 유닛의 바디 반경 가져오기
        const bodyRadius = this.body ? (this.body.halfWidth || this.baseSize / 2) : (this.baseSize / 2);
        
        const isInWall = (x, y) => {
            // 유닛의 바디 전체가 안전한지 체크 (중심점 + 반경 고려)
            // 4방향 끝점 체크
            const checkPoints = [
                { x: x, y: y },                    // 중심
                { x: x + bodyRadius, y: y },       // 오른쪽
                { x: x - bodyRadius, y: y },       // 왼쪽
                { x: x, y: y + bodyRadius },       // 아래
                { x: x, y: y - bodyRadius }        // 위
            ];

            for (const point of checkPoints) {
                // 1. 타일 레이어 체크 (wallLayer, blockLayer)
                if (this.scene.wallLayer) {
                    const tile = this.scene.wallLayer.getTileAtWorldXY(point.x, point.y);
                    if (tile && tile.canCollide) return true;
                }
                if (this.scene.blockLayer) {
                    const tile = this.scene.blockLayer.getTileAtWorldXY(point.x, point.y);
                    if (tile && tile.canCollide) return true;
                }

                // 2. Block Object 체크
                if (this.scene.blockObjectGroup) {
                    const blocks = this.scene.blockObjectGroup.getChildren();
                    for (const block of blocks) {
                        if (!block.active) continue;
                        const blockBounds = block.getBounds ? block.getBounds() : 
                            new Phaser.Geom.Rectangle(block.x - block.width/2, block.y - block.height/2, block.width, block.height);
                        
                        if (blockBounds.contains(point.x, point.y)) return true;
                    }
                }

                // 3. Wall Object 체크
                if (this.scene.wallObjectGroup) {
                    const walls = this.scene.wallObjectGroup.getChildren();
                    for (const wall of walls) {
                        if (!wall.active) continue;
                        const wallBounds = wall.getBounds ? wall.getBounds() : 
                            new Phaser.Geom.Rectangle(wall.x - wall.width/2, wall.y - wall.height/2, wall.width, wall.height);
                        
                        if (wallBounds.contains(point.x, point.y)) return true;
                    }
                }
            }

            return false;
        };

        // 현재 위치가 벽/블록과 겹치는지 체크
        if (!isInWall(this.x, this.y)) {
            console.log('[SMOKE] Landing position is clear');
            return; // 안전한 위치
        }

        console.log('[SMOKE] Landing in wall - finding safe position');

        // 나선형으로 주변 위치 탐색 (더 넓은 범위, 더 작은 간격)
        const searchRadius = 200; // 최대 탐색 반경 증가
        const step = 10; // 탐색 간격 감소 (더 세밀하게)

        for (let radius = step; radius <= searchRadius; radius += step) {
            // 8방향 탐색
            const directions = [
                { x: 0, y: -1 },   // 북
                { x: 1, y: -1 },   // 북동
                { x: 1, y: 0 },    // 동
                { x: 1, y: 1 },    // 남동
                { x: 0, y: 1 },    // 남
                { x: -1, y: 1 },   // 남서
                { x: -1, y: 0 },   // 서
                { x: -1, y: -1 }   // 북서
            ];

            for (const dir of directions) {
                const testX = this.x + dir.x * radius;
                const testY = this.y + dir.y * radius;

                if (!isInWall(testX, testY)) {
                    console.log(`[SMOKE] Safe position found at (${testX}, ${testY}), distance: ${radius}`);
                    
                    // 즉시 이동 대신 자연스럽게 미끄러지듯이 이동 (Tween 사용)
                    const distance = Phaser.Math.Distance.Between(this.x, this.y, testX, testY);
                    const duration = Math.min(300, distance * 2); // 거리에 비례, 최대 300ms
                    
                    this.scene.tweens.add({
                        targets: this,
                        x: testX,
                        y: testY,
                        duration: duration,
                        ease: 'Cubic.easeOut',
                        onUpdate: () => {
                            // Tween 진행 중에도 body 위치 동기화
                            if (this.body) {
                                this.body.updateFromGameObject();
                            }
                        },
                        onComplete: () => {
                            console.log(`[SMOKE] Slide to safe position completed`);
                            if (this.body) {
                                this.body.updateFromGameObject();
                            }
                        }
                    });
                    return;
                }
            }
        }

        console.log('[SMOKE] WARNING: No safe position found within 200px radius');
        // 최후의 수단: 원래 시작 위치로 복귀 (lastValidPosition 사용)
        if (this.lastValidPosition) {
            console.log(`[SMOKE] Returning to last valid position: (${this.lastValidPosition.x}, ${this.lastValidPosition.y})`);
            
            const distance = Phaser.Math.Distance.Between(this.x, this.y, this.lastValidPosition.x, this.lastValidPosition.y);
            const duration = Math.min(400, distance * 2);
            
            this.scene.tweens.add({
                targets: this,
                x: this.lastValidPosition.x,
                y: this.lastValidPosition.y,
                duration: duration,
                ease: 'Cubic.easeOut',
                onUpdate: () => {
                    if (this.body) {
                        this.body.updateFromGameObject();
                    }
                }
            });
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

    triggerLandingProvoke() {
        if (!this.active || this.isDying) return;
        // const circle = this.scene.add.circle(this.x, this.y, 10, 0xff0000, 0.5);
        // this.scene.tweens.add({ targets: circle, radius: this.provokeRadius, alpha: 0, duration: 400, onComplete: () => circle.destroy() });
        const enemies = this.targetGroup.getChildren();
        for (let enemy of enemies) {
            if (enemy.active && !enemy.isDying && enemy.ai && enemy.ai.provoke) {
                if (Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y) <= this.provokeRadius) {
                    enemy.ai.provoke(this, this.provokeDuration);
                }
            }
        }
    }
}