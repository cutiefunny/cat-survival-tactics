import Phaser from 'phaser';

// [Targeting Logic] 5px Hysteresis 및 Priority 로직 적용
export function calculateBestTarget(me, enemies, distanceFn) {
    let bestTarget = null;
    let bestIsAggro = false;
    let bestDist = Infinity;
    let bestHp = Infinity;

    const getDist = distanceFn || ((a, b) => Math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2));
    
    const now = me.scene.time.now;
    const lastAttacker = me.ai ? me.ai.lastAttacker : null;
    const lastHitTime = me.ai ? me.ai.lastAttackedTime : 0;
    const isRecentAttacker = (enemy) => (enemy === lastAttacker && (now - lastHitTime < 3000));

    for (const enemy of enemies) {
        if (!enemy.active || (enemy.isDying === true)) continue;

        // [Priority 1] Aggro: 나를 타겟팅 중이거나, 최근에 나를 때린 적
        const isAggro = (enemy.ai && enemy.ai.currentTarget === me) || isRecentAttacker(enemy);
        
        // [Priority 2] Distance
        const dist = getDist(me, enemy);
        
        // [Priority 3] HP
        const hp = enemy.hp;

        if (!bestTarget) {
            bestTarget = enemy;
            bestIsAggro = isAggro;
            bestDist = dist;
            bestHp = hp;
            continue;
        }

        // 1순위: Aggro
        if (isAggro !== bestIsAggro) {
            if (isAggro) {
                bestTarget = enemy;
                bestIsAggro = isAggro;
                bestDist = dist;
                bestHp = hp;
            }
            continue;
        }

        // 2순위: Distance (5px Hysteresis 적용 - Flickering 방지)
        const distDiff = dist - bestDist;
        if (distDiff < -5) { 
            bestTarget = enemy;
            bestIsAggro = isAggro;
            bestDist = dist;
            bestHp = hp;
            continue;
        } else if (distDiff > 5) {
            continue;
        }

        // 3순위: HP (거리 차이가 5px 이내일 때)
        if (hp < bestHp) {
            bestTarget = enemy;
            bestIsAggro = isAggro;
            bestDist = dist;
            bestHp = hp;
        } 
    }
    
    return bestTarget;
}

export default class UnitAI {
    constructor(unit) {
        this.unit = unit;
        this.scene = unit.scene;

        this.currentTarget = null;
        this.thinkTimer = Math.random() * 100;
        this.fleeTimer = 0;
        this.isLowHpFleeing = false;
        
        this.isCombatMode = false;      
        this.isReturning = false;       
        this.spawnPos = { x: unit.x, y: unit.y }; 
        this.patrolTimer = 0;           
        this.patrolTarget = null;       

        this.provokedTimer = 0; 
        this.lastAttacker = null;
        this.lastAttackedTime = 0;
        
        this.currentPath = [];
        this.pathUpdateTimer = 0;
        this.lastPathCalcTime = 0;
        this.stuckTimer = 0;
        
        this.forcePathfindingTimer = 0;
        
        this.losCheckTimer = 0;
        this.lastLosResult = true;
        
        this.lastTargetChangeTime = 0; 
        this.targetSwitchCooldown = 200; 
        
        // [삭제됨] lostTargetTimer 관련 로직 제거
        
        // [Vision Settings]
        this.viewDistance = 350; // 감지 거리
        this.baseViewDistance = 350; // 기본 시야 거리 저장
        this.viewAngle = Phaser.Math.DegToRad(120); // 시야각 (120도)

        this._tempStart = new Phaser.Math.Vector2();
        this._tempEnd = new Phaser.Math.Vector2();

        this.wallCollisionTimer = 0;
        this.wallCollisionVector = new Phaser.Math.Vector2();
    }

    onDamage(attacker) {
        if (!attacker || !attacker.active) return;
        this.lastAttacker = attacker;
        this.lastAttackedTime = this.scene.time.now;

        if (!this.isCombatMode) {
            this.engageCombat(attacker);
            this.thinkTimer = 0; 
        }
    }

    // [New] 현재 유닛이 바라보는 각도를 계산 (타겟 우선, 없으면 이동방향/몸방향)
    getFacingAngle() {
        // 1. 타겟이 있으면 타겟을 응시
        if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
            return Phaser.Math.Angle.Between(this.unit.x, this.unit.y, this.currentTarget.x, this.currentTarget.y);
        }

        // 2. 최근 공격자가 있으면 그쪽 응시
        const now = this.scene.time.now;
        if (this.lastAttacker && this.lastAttacker.active && (now - this.lastAttackedTime < 3000)) {
             return Phaser.Math.Angle.Between(this.unit.x, this.unit.y, this.lastAttacker.x, this.lastAttacker.y);
        }

        // 3. 이동 중이면 이동 방향 응시
        if (this.unit.body.speed > 10) {
            return this.unit.body.velocity.angle();
        }

        // 4. 기본: flipX에 따른 좌우 방향
        return this.unit.flipX ? 0 : Math.PI; 
    }

    canSee(target) {
        if (!target || !target.active || target.isDying) return false;

        // 1. 거리 체크
        const distSq = Phaser.Math.Distance.Squared(this.unit.x, this.unit.y, target.x, target.y);
        if (distSq > this.viewDistance * this.viewDistance) return false;

        // 2. 각도 체크 (동적 시선 처리)
        const angleToTarget = Phaser.Math.Angle.Between(this.unit.x, this.unit.y, target.x, target.y);
        const facingAngle = this.getFacingAngle(); 
        
        let angleDiff = Phaser.Math.Angle.Wrap(angleToTarget - facingAngle);
        
        // 시야각(120도) 절반인 60도 이내인지 확인
        if (Math.abs(angleDiff) > this.viewAngle / 2) {
            // 예외: 전투 중이고 타겟이 '나'를 공격했다면 뒤에 있어도 감지
            const isEmergency = (this.isCombatMode || this.isProvoked) && (target === this.currentTarget || target === this.lastAttacker);
            if (!isEmergency) {
                return false; 
            }
        }

        // 3. 장애물(Line of Sight) 체크
        return this.checkLineOfSightRaw(target);
    }

    updateRoaming(delta) {
        if (this.isReturning) {
            this.handleReturnLogic(delta);
            return false;
        }

        if (this.isCombatMode || this.isProvoked) return true;

        const enemies = this.unit.targetGroup.getChildren();
        const visibleEnemies = enemies.filter(e => this.canSee(e));
        
        let bestEnemy = null;
        if (visibleEnemies.length > 0) {
            bestEnemy = calculateBestTarget(this.unit, visibleEnemies, Phaser.Math.Distance.Between);
        }

        if (bestEnemy) {
            this.currentTarget = bestEnemy;
            this.engageCombat(bestEnemy);
            return true;
        }

        this.patrolTimer -= delta;
        if (this.patrolTimer <= 0) {
            const rad = 150;
            const rx = this.spawnPos.x + (Math.random() * rad * 2 - rad);
            const ry = this.spawnPos.y + (Math.random() * rad * 2 - rad);
            this.patrolTarget = new Phaser.Math.Vector2(rx, ry);
            this.patrolTimer = 2000 + Math.random() * 2000;
        }

        if (this.patrolTarget) {
            const dist = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, this.patrolTarget.x, this.patrolTarget.y);
            if (dist > 5) {
                this.scene.physics.moveTo(this.unit, this.patrolTarget.x, this.patrolTarget.y, this.unit.moveSpeed * 0.5);
                this.unit.updateFlipX();
            } else {
                this.unit.setVelocity(0, 0);
            }
        }

        return false; 
    }

    handleReturnLogic(delta) {
        const dist = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, this.spawnPos.x, this.spawnPos.y);
        
        if (dist > 10) {
            this.moveToLocationSmart(this.spawnPos.x, this.spawnPos.y, delta, 1.5);
        } else {
            this.isReturning = false;
            this.unit.setVelocity(0, 0);
            this.currentPath = []; 

            if (this.unit.hp < this.unit.maxHp) {
                this.unit.hp = Math.min(this.unit.hp + (this.unit.maxHp * 0.3), this.unit.maxHp);
                this.unit.redrawHpBar();
                if (this.unit.showEmote) this.unit.showEmote("💤", "#00ff00");
            }
        }
    }

    moveToTargetSmart(delta) {
        if (!this.currentTarget || !this.currentTarget.active || this.currentTarget.isDying) {
            this.unit.setVelocity(0, 0);
            return;
        }
        this.moveToLocationSmart(this.currentTarget.x, this.currentTarget.y, delta);
    }

    moveToLocationSmart(targetX, targetY, delta, speedFactor = 1.0) {
        const unit = this.unit;
        const moveSpeed = unit.moveSpeed * speedFactor;

        if (this.currentPath.length > 0 || (Math.abs(unit.x - targetX) > 10 || Math.abs(unit.y - targetY) > 10)) {
             if (unit.body.speed < moveSpeed * 0.1) {
                this.stuckTimer += delta;
                if (this.stuckTimer > 200) {
                    this.stuckTimer = 0;
                    this.currentPath = [];
                    this.pathUpdateTimer = 0;
                    unit.setVelocity(0, 0);
                    this.forcePathfindingTimer = 1500; 
                }
             } else {
                 this.stuckTimer = 0;
             }
        }

        let isLineClear = false;
        if (this.forcePathfindingTimer <= 0) {
             isLineClear = this.scene.pathfindingManager.isLineClear(
                { x: unit.x, y: unit.y },
                { x: targetX, y: targetY }
            );
        }

        if (isLineClear) {
            this.scene.physics.moveTo(unit, targetX, targetY, moveSpeed);
            unit.updateFlipX();
            this.currentPath = [];
            return;
        }

        this.pathUpdateTimer -= delta;
        const shouldCalculatePath = this.currentPath.length === 0 || this.pathUpdateTimer <= 0 || (this.forcePathfindingTimer > 0 && this.currentPath.length === 0);

        if (shouldCalculatePath) {
            this.pathUpdateTimer = 500 + Math.random() * 300;
            const path = this.scene.pathfindingManager.findPath(
                { x: unit.x, y: unit.y },
                { x: targetX, y: targetY }
            );
            if (path && path.length > 0) {
                this.currentPath = path;
                this.lastPathCalcTime = this.scene.time.now;
            }
        }

        if (this.currentPath.length > 0) {
            const nextPoint = this.currentPath[0];
            const distToPoint = Phaser.Math.Distance.Between(unit.x, unit.y, nextPoint.x, nextPoint.y);

            if (distToPoint < 15) {
                this.currentPath.shift();
                if (this.currentPath.length > 0) {
                    this.moveToPoint(this.currentPath[0], moveSpeed);
                }
            } else {
                this.moveToPoint(nextPoint, moveSpeed);
            }
        } else {
             this.scene.physics.moveTo(unit, targetX, targetY, moveSpeed);
        }
        unit.updateFlipX();
    }

    engageCombat(target) {
        if (this.isReturning) return;

        if (!this.isCombatMode) {
             this.viewDistance = this.baseViewDistance * 1.2;
        }

        this.isCombatMode = true;
        this.currentTarget = target;
        // lostTargetTimer 관련 제거
        
        if (this.unit.showEmote) {
            this.unit.showEmote("!", "#ff0000");
        }
        
        this.broadcastAggro(target);
    }

    broadcastAggro(target) {
        const allies = (this.unit.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        const alertRadiusSq = 300 * 300; 

        allies.forEach(ally => {
            if (ally.active && ally !== this.unit && ally.ai) {
                if (!ally.ai.isCombatMode && !ally.ai.isReturning) {
                    const distSq = Phaser.Math.Distance.Squared(this.unit.x, this.unit.y, ally.x, ally.y);
                    if (distSq <= alertRadiusSq) {
                        ally.ai.engageCombat(target);
                    }
                }
            }
        });
    }

    updateTargetSelection() {
        const now = this.scene.time.now;
        if (this.isProvoked) return; 

        const bestTarget = this.findBestTarget();

        if (bestTarget && bestTarget !== this.currentTarget) {
            const isCooldownActive = (now - this.lastTargetChangeTime < this.targetSwitchCooldown);
            
            const isNewTargetAggro = (bestTarget.ai && bestTarget.ai.currentTarget === this.unit) || 
                                     (bestTarget === this.lastAttacker && (now - this.lastAttackedTime < 3000));
            
            const isCurrentTargetAggro = this.currentTarget && 
                                         ((this.currentTarget.ai && this.currentTarget.ai.currentTarget === this.unit) ||
                                          (this.currentTarget === this.lastAttacker && (now - this.lastAttackedTime < 3000)));

            const isEmergencySwitch = isNewTargetAggro && !isCurrentTargetAggro;

            if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
                if (isCooldownActive && !isEmergencySwitch) {
                    return;
                }
            }

            if (this.unit.role === 'Normal') {
                const prevInfo = this.currentTarget 
                    ? `${this.currentTarget.team} ${this.currentTarget.role}(${Math.floor(this.currentTarget.hp)})` 
                    : 'None';
                const nextInfo = `${bestTarget.team} ${bestTarget.role}(${Math.floor(bestTarget.hp)})`;
                
                console.log(`%c[TargetChange] ${this.unit.team} Normal: ${prevInfo} -> ${nextInfo}`, 'color: #00ff00; font-weight: bold;');
            }

            this.currentTarget = bestTarget;
            this.lastTargetChangeTime = now;
            
            this.currentPath = [];
            this.pathUpdateTimer = 0;
            
            if (!this.isCombatMode) {
                this.engageCombat(bestTarget);
            }
        }
    }

    findBestTarget() {
        return calculateBestTarget(
            this.unit, 
            this.unit.targetGroup.getChildren(),
            Phaser.Math.Distance.Between
        );
    }

    update(delta) {
        if (this.isReturning) {
            this.handleReturnLogic(delta);
            return;
        }

        if (this.forcePathfindingTimer > 0) {
            this.forcePathfindingTimer -= delta;
        }

        if (this.wallCollisionTimer > 0) {
            this.wallCollisionTimer -= delta;
            this.unit.setVelocity(
                this.wallCollisionVector.x * this.unit.moveSpeed, 
                this.wallCollisionVector.y * this.unit.moveSpeed
            );
            this.unit.updateFlipX(); 
            return; 
        }

        this.processAggro(delta);

        // [삭제됨] 적군(Red Team)의 3초 추적 룰 제거
        // 이제 아래의 일반 타겟팅 로직을 따릅니다.

        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 150 + Math.random() * 100; 
            this.updateTargetSelection();
        }

        if (this.unit.role !== 'Tanker' && this.unit.role !== 'Wawa') {
            const fleeThreshold = this.unit.aiConfig.common?.fleeHpThreshold ?? 0.2;
            const hpRatio = this.unit.hp / this.unit.maxHp;
            
            if (!this.isLowHpFleeing && hpRatio <= fleeThreshold) {
                this.isLowHpFleeing = true;
                this.unit.setTint(0xff5555); 
            } else if (this.isLowHpFleeing && hpRatio >= 0.5) {
                this.isLowHpFleeing = false;
                this.unit.resetVisuals(); 
            }

            if (this.isLowHpFleeing) {
                const nearestThreat = this.findNearestEnemy(); 
                if (nearestThreat) {
                    const dist = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, nearestThreat.x, nearestThreat.y);
                    if (dist < 350) this.runAway(delta);
                    else { this.unit.setVelocity(0, 0); this.unit.updateFlipX(); }
                }
                return;
            }
        }

        if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
            const distSq = Phaser.Math.Distance.Squared(this.unit.x, this.unit.y, this.currentTarget.x, this.currentTarget.y);
            
            let desiredRange = this.unit.attackRange || 50; 
            if (this.unit.role === 'Shooter') {
                const aiParams = this.unit.aiConfig.shooter || {};
                desiredRange = aiParams.attackRange || 250;
            }

            const inRange = distSq <= desiredRange * desiredRange;
            const hasLOS = inRange ? this.checkLineOfSight() : false;

            if (inRange && hasLOS) {
                this.unit.setVelocity(0, 0);
                this.currentPath = [];
                this.stuckTimer = 0;
                
                if (this.unit.role !== 'Shooter') {
                     const diffX = this.currentTarget.x - this.unit.x;
                     if (Math.abs(diffX) > 10) this.unit.setFlipX(diffX > 0);
                }
            } else {
                this.moveToLocationSmart(this.currentTarget.x, this.currentTarget.y, delta, 1.0);
            }
        } else {
            this.unit.setVelocity(0, 0);
            
            // [수정] 적군도 타겟이 없으면 전투 모드를 해제하여 다시 배회하거나 대기하도록 함
            if (this.isCombatMode) {
                this.isCombatMode = false;
                this.viewDistance = this.baseViewDistance;
            }
        }

        if (this.unit.team !== 'blue' || this.unit.scene.isAutoBattle) {
            this.unit.tryUseSkill();
        }
    }

    findNearestEnemy() {
        const enemies = this.unit.targetGroup.getChildren();
        let closest = null;
        let minInfo = Infinity;
        const myX = this.unit.x;
        const myY = this.unit.y;
        
        for (const enemy of enemies) {
            if (!enemy.active || enemy.isDying) continue;
            const d = (myX - enemy.x)**2 + (myY - enemy.y)**2;
            if (d < minInfo) { minInfo = d; closest = enemy; }
        }
        return closest;
    }

    processAggro(delta) {
        if (this.provokedTimer > 0) this.provokedTimer -= delta;
    }

    get isProvoked() {
        return this.provokedTimer > 0 && this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying;
    }

    onWallCollision(obstacle) {
        this.currentPath = []; 
        this.pathUpdateTimer = 0;

        let ox, oy;
        if (obstacle.pixelX !== undefined) {
            ox = obstacle.pixelX + (obstacle.width || 0) / 2;
            oy = obstacle.pixelY + (obstacle.height || 0) / 2;
        } else if (obstacle.getBounds) {
            const bounds = obstacle.getBounds();
            ox = bounds.centerX;
            oy = bounds.centerY;
        } else {
            ox = obstacle.x;
            oy = obstacle.y;
        }

        const ux = this.unit.x;
        const uy = this.unit.y;
        const dx = ux - ox;
        const dy = uy - oy;

        const slideDir = new Phaser.Math.Vector2();
        const repulsion = new Phaser.Math.Vector2();
        const target = this.currentTarget || this.patrolTarget || { x: ux, y: uy };

        if (Math.abs(dx) > Math.abs(dy)) {
            if (Math.abs(target.y - uy) > 10) {
                slideDir.set(0, Math.sign(target.y - uy) || 1);
            } else {
                slideDir.set(0, Math.sign(dy) || 1);
            }
            repulsion.set(Math.sign(dx), 0);
        } else {
            if (Math.abs(target.x - ux) > 10) {
                slideDir.set(Math.sign(target.x - ux) || 1, 0);
            } else {
                slideDir.set(Math.sign(dx) || 1, 0);
            }
            repulsion.set(0, Math.sign(dy));
        }

        this.wallCollisionVector.copy(slideDir).scale(0.8).add(repulsion.scale(1.2)).normalize();
        
        this.wallCollisionTimer = 250; 
        this.forcePathfindingTimer = 1500;
        this.stuckTimer = 0;
    }

    checkLineOfSight() {
        if (!this.currentTarget || !this.currentTarget.active || this.currentTarget.isDying) return false;

        const now = this.scene.time.now;
        if (now < this.losCheckTimer) return this.lastLosResult;
        
        this.losCheckTimer = now + 150;

        const result = this.checkLineOfSightRaw(this.currentTarget);
        this.lastLosResult = result;
        return result;
    }

    // [Refactor] Raycast 로직 분리 (타겟 지정 없이 사용 가능하도록)
    checkLineOfSightRaw(target) {
        if (!target) return false;
        
        const wallLayer = this.scene.wallLayer;
        const blockLayer = this.scene.blockLayer;

        if (!wallLayer && !blockLayer && (!this.scene.blockObjectGroup || this.scene.blockObjectGroup.getLength() === 0)) {
            return true;
        }

        this._tempStart.set(this.unit.x, this.unit.y);
        this._tempEnd.set(target.x, target.y);
        const line = new Phaser.Geom.Line(this.unit.x, this.unit.y, target.x, target.y);

        if (wallLayer || blockLayer) {
            const distance = this._tempStart.distance(this._tempEnd);
            const stepSize = 35;
            const steps = Math.ceil(distance / stepSize);

            for (let i = 1; i < steps; i++) {
                const t = i / steps;
                const cx = this._tempStart.x + (this._tempEnd.x - this._tempStart.x) * t;
                const cy = this._tempStart.y + (this._tempEnd.y - this._tempStart.y) * t;

                if (wallLayer && wallLayer.getTileAtWorldXY(cx, cy)?.canCollide) {
                    return false;
                }
                if (blockLayer && blockLayer.getTileAtWorldXY(cx, cy)?.canCollide) {
                    return false;
                }
            }
        }

        if (this.scene.blockObjectGroup) {
            const blocks = this.scene.blockObjectGroup.getChildren();
            for (const block of blocks) {
                const bounds = block.getBounds();
                if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
                    return false;
                }
            }
        }
        return true;
    }

    moveToPoint(point, speed = null) {
        const moveSpeed = speed || this.unit.moveSpeed;
        this.scene.physics.moveTo(this.unit, point.x, point.y, moveSpeed);
        const diffX = point.x - this.unit.x;
        if (Math.abs(diffX) > 5) {
            this.unit.setFlipX(diffX > 0);
        }
    }

    runAway(delta) {
        if (this.isProvoked) {
            this.moveToLocationSmart(this.currentTarget.x, this.currentTarget.y, delta);
            return;
        }

        if (!this.currentTarget || !this.currentTarget.active || this.currentTarget.isDying) {
            this.currentTarget = this.findNearestEnemy();
        }
        
        if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
            const angle = Phaser.Math.Angle.Between(this.currentTarget.x, this.currentTarget.y, this.unit.x, this.unit.y); 
            const speed = this.unit.moveSpeed * 1.2; 
            
            this.unit.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
            this.unit.updateFlipX();
        } else { 
            this.followLeader(); 
        }
    }

    followLeader() {
        if (!this.scene.playerUnit || !this.scene.playerUnit.active) {
            this.unit.setVelocity(0, 0);
            return;
        }
        const targetX = this.scene.playerUnit.x + this.unit.formationOffset.x;
        const targetY = this.scene.playerUnit.y + this.unit.formationOffset.y;
        
        const distSq = Phaser.Math.Distance.Squared(this.unit.x, this.unit.y, targetX, targetY);
        
        if (distSq > 150) { 
            this.scene.physics.moveTo(this.unit, targetX, targetY, this.unit.moveSpeed);
            this.unit.updateFlipX();
        } else {
            this.unit.setVelocity(0, 0);
        }
    }
}