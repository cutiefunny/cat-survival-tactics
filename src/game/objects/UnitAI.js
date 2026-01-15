import Phaser from 'phaser';

export function calculateBestTarget(me, enemies, distanceFn) {
    let bestTarget = null;
    let bestIsAggro = false;
    let bestDist = Infinity;
    let bestHp = Infinity;

    const getDist = distanceFn || ((a, b) => Math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2));

    for (const enemy of enemies) {
        if (!enemy.active || (enemy.isDying === true)) continue;

        const isAggro = (enemy.ai && enemy.ai.currentTarget === me);
        const dist = getDist(me, enemy);
        const hp = enemy.hp;

        if (!bestTarget) {
            bestTarget = enemy;
            bestIsAggro = isAggro;
            bestDist = dist;
            bestHp = hp;
            continue;
        }

        if (isAggro !== bestIsAggro) {
            if (isAggro) { 
                bestTarget = enemy;
                bestIsAggro = isAggro;
                bestDist = dist;
                bestHp = hp;
            }
            continue; 
        }

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

        // [AI State]
        this.currentTarget = null;
        this.thinkTimer = Math.random() * 100;
        this.fleeTimer = 0;
        this.isLowHpFleeing = false;
        
        // [Roaming & Combat State]
        this.isCombatMode = false;      
        this.isReturning = false;       
        this.spawnPos = { x: unit.x, y: unit.y }; 
        this.patrolTimer = 0;           
        this.patrolTarget = null;       

        // [Aggro System]
        this.provokedTimer = 0; 
        
        // [Pathfinding State]
        this.currentPath = [];
        this.pathUpdateTimer = 0;
        this.lastPathCalcTime = 0;
        this.stuckTimer = 0;
        
        // [Fix] 끼임 발생 시 직선 이동을 잠시 금지하는 타이머
        this.forcePathfindingTimer = 0;
        
        // [LOS State]
        this.losCheckTimer = 0;
        this.lastLosResult = true;
        
        // [Targeting State]
        this.lastTargetChangeTime = 0; 
        this.targetSwitchCooldown = 200; 

        this._tempStart = new Phaser.Math.Vector2();
        this._tempEnd = new Phaser.Math.Vector2();

        this.wallCollisionTimer = 0;
        this.wallCollisionVector = new Phaser.Math.Vector2();
    }

    updateRoaming(delta) {
        if (this.isReturning) {
            this.handleReturnLogic(delta);
            return false;
        }

        if (this.isCombatMode || this.isProvoked) return true;

        const bestEnemy = this.findBestTarget();
        if (bestEnemy) {
            const dist = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, bestEnemy.x, bestEnemy.y);
            if (dist <= 250) {
                this.currentTarget = bestEnemy;
                if (!this.checkLineOfSight()) { 
                    this.currentTarget = null; 
                    return false; 
                }
                this.engageCombat(bestEnemy);
                return true;
            }
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
            this.scene.physics.moveTo(this.unit, this.spawnPos.x, this.spawnPos.y, this.unit.moveSpeed * 1.5);
            this.unit.updateFlipX();
        } else {
            this.isReturning = false;
            this.unit.setVelocity(0, 0);
            if (this.unit.hp < this.unit.maxHp) {
                this.unit.hp = Math.min(this.unit.hp + (this.unit.maxHp * 0.3), this.unit.maxHp);
                this.unit.redrawHpBar();
                if (this.unit.showEmote) this.unit.showEmote("💤", "#00ff00");
            }
        }
    }

    engageCombat(target) {
        if (this.isCombatMode || this.isReturning) return;

        this.isCombatMode = true;
        this.currentTarget = target;
        
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
            const isEmergencySwitch = (bestTarget.ai && bestTarget.ai.currentTarget === this.unit) && 
                                      (!this.currentTarget || (this.currentTarget.ai && this.currentTarget.ai.currentTarget !== this.unit));

            if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
                if (isCooldownActive && !isEmergencySwitch) {
                    return;
                }
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
            // [Fix] updateAnimation() 제거: Unit.js에서 통합 관리
            return;
        }

        // [Fix] 강제 우회 타이머 감소
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
            // [Fix] updateAnimation() 제거
            return; 
        }

        this.processAggro(delta);

        if (this.unit.team === 'red' && this.isCombatMode && !this.isProvoked) {
            if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
                const CHASE_RANGE = 450; 
                const distToTarget = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, this.currentTarget.x, this.currentTarget.y);
                const hasLOS = this.checkLineOfSight();
                
                if (distToTarget > CHASE_RANGE || !hasLOS) {
                    this.isReturning = true;
                    this.isCombatMode = false;
                    this.currentTarget = null;
                    this.currentPath = [];
                    if (this.unit.showEmote) this.unit.showEmote("?", "#ffff00");
                    // [Fix] updateAnimation() 제거
                    return;
                }
            } else {
                 this.isReturning = true;
                 this.isCombatMode = false;
                 // [Fix] updateAnimation() 제거
                 return;
            }
        }

        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 150 + Math.random() * 100; 
            this.updateTargetSelection();
        }

        if (this.unit.role !== 'Tanker') {
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
                // [Fix] updateAnimation() 제거
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
                this.moveToTargetSmart(delta);
            }
        } else {
            this.unit.setVelocity(0, 0);
            this.isCombatMode = false; 
        }

        if (this.unit.team !== 'blue' || this.unit.scene.isAutoBattle) {
            this.unit.tryUseSkill();
        }
        
        // [Fix] updateAnimation() 제거: Unit.js의 update() 마지막에 호출됨
    }

    // [Removed] updateAnimation 메서드 전체 삭제 (Unit.js 로직과 충돌 방지)

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
        // [New Fix] 충돌 즉시 현재 경로 폐기
        this.currentPath = []; 
        this.pathUpdateTimer = 0;

        // 1. 장애물의 중심 좌표(ox, oy) 안전하게 계산
        let ox, oy;
        
        // Phaser Tile 객체인 경우
        if (obstacle.pixelX !== undefined) {
            ox = obstacle.pixelX + (obstacle.width || 0) / 2;
            oy = obstacle.pixelY + (obstacle.height || 0) / 2;
        } 
        // Sprite 또는 GameObject인 경우
        else if (obstacle.getBounds) {
            const bounds = obstacle.getBounds();
            ox = bounds.centerX;
            oy = bounds.centerY;
        } 
        // 단순 좌표 객체인 경우
        else {
            ox = obstacle.x;
            oy = obstacle.y;
        }

        const ux = this.unit.x;
        const uy = this.unit.y;

        // 2. 충돌 면(Face) 판별
        const dx = ux - ox;
        const dy = uy - oy;

        const slideDir = new Phaser.Math.Vector2();
        const repulsion = new Phaser.Math.Vector2();

        const target = this.currentTarget || this.patrolTarget || { x: ux, y: uy };

        // [Case 1] 가로 거리 차이가 더 큼 -> 좌/우 면 충돌 -> 세로(Y)로 회피
        if (Math.abs(dx) > Math.abs(dy)) {
            if (Math.abs(target.y - uy) > 10) {
                slideDir.set(0, Math.sign(target.y - uy) || 1);
            } else {
                slideDir.set(0, Math.sign(dy) || 1);
            }
            repulsion.set(Math.sign(dx), 0);
        } 
        // [Case 2] 세로 거리 차이가 더 큼 -> 상/하 면 충돌 -> 가로(X)로 회피
        else {
            if (Math.abs(target.x - ux) > 10) {
                slideDir.set(Math.sign(target.x - ux) || 1, 0);
            } else {
                slideDir.set(Math.sign(dx) || 1, 0);
            }
            repulsion.set(0, Math.sign(dy));
        }

        // 3. 벡터 합성 및 적용
        this.wallCollisionVector.copy(slideDir).scale(0.8).add(repulsion.scale(1.2)).normalize();
        this.wallCollisionTimer = 250; 

        // [핵심 수정 사항] 
        // 벽에 박았으므로 1.5초 동안은 '직선 이동(isLineClear)' 체크를 강제로 건너뛰고 
        // 무조건 A* 알고리즘으로 우회 경로를 찾도록 강제합니다.
        this.forcePathfindingTimer = 1500;
        this.stuckTimer = 0;
    }

    checkLineOfSight() {
        if (!this.currentTarget || !this.currentTarget.active || this.currentTarget.isDying) return false;

        const now = this.scene.time.now;
        if (now < this.losCheckTimer) return this.lastLosResult;
        
        this.losCheckTimer = now + 150;

        const wallLayer = this.scene.wallLayer;
        const blockLayer = this.scene.blockLayer;

        if (!wallLayer && !blockLayer && (!this.scene.blockObjectGroup || this.scene.blockObjectGroup.getLength() === 0)) {
            this.lastLosResult = true;
            return true;
        }

        this._tempStart.set(this.unit.x, this.unit.y);
        this._tempEnd.set(this.currentTarget.x, this.currentTarget.y);
        const line = new Phaser.Geom.Line(this.unit.x, this.unit.y, this.currentTarget.x, this.currentTarget.y);

        if (wallLayer || blockLayer) {
            const distance = this._tempStart.distance(this._tempEnd);
            const stepSize = 35;
            const steps = Math.ceil(distance / stepSize);

            for (let i = 1; i < steps; i++) {
                const t = i / steps;
                const cx = this._tempStart.x + (this._tempEnd.x - this._tempStart.x) * t;
                const cy = this._tempStart.y + (this._tempEnd.y - this._tempStart.y) * t;

                if (wallLayer && wallLayer.getTileAtWorldXY(cx, cy)?.canCollide) {
                    this.lastLosResult = false; return false;
                }
                if (blockLayer && blockLayer.getTileAtWorldXY(cx, cy)?.canCollide) {
                    this.lastLosResult = false; return false;
                }
            }
        }

        if (this.scene.blockObjectGroup) {
            const blocks = this.scene.blockObjectGroup.getChildren();
            for (const block of blocks) {
                const bounds = block.getBounds();
                if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
                    this.lastLosResult = false; return false;
                }
            }
        }

        this.lastLosResult = true;
        return true;
    }

    moveToTargetSmart(delta) {
        if (!this.currentTarget) return;
        
        const unit = this.unit;

        if (this.currentPath.length > 0 || this.currentTarget) {
            if (unit.body.speed < unit.moveSpeed * 0.1) {
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
                { x: this.currentTarget.x, y: this.currentTarget.y }
            );
        }

        if (isLineClear) {
            this.scene.physics.moveToObject(unit, this.currentTarget, unit.moveSpeed);
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
                { x: this.currentTarget.x, y: this.currentTarget.y }
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
                    this.moveToPoint(this.currentPath[0]);
                }
            } else {
                this.moveToPoint(nextPoint);
            }
        } else {
            this.scene.physics.moveToObject(unit, this.currentTarget, unit.moveSpeed);
        }
        unit.updateFlipX();
    }

    moveToPoint(point) {
        this.scene.physics.moveTo(this.unit, point.x, point.y, this.unit.moveSpeed);
        const diffX = point.x - this.unit.x;
        if (Math.abs(diffX) > 5) {
            this.unit.setFlipX(diffX > 0);
        }
    }

    runAway(delta) {
        if (this.isProvoked) {
            this.moveToTargetSmart(delta);
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