import Phaser from 'phaser';

// [Refactor] 테스트 가능한 순수 함수로 로직 분리 (외부 파일이나 테스트에서 import 가능)
// Phaser 의존성을 제거하거나 주입받도록 하여 테스트 용이성 확보
export function calculateBestTarget(me, enemies, distanceFn) {
    let bestTarget = null;
    let bestIsAggro = false;
    let bestDist = Infinity;
    let bestHp = Infinity;

    // distanceFn이 없으면 기본 유클리드 거리 계산 사용 (테스트 환경 대비)
    const getDist = distanceFn || ((a, b) => Math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2));

    for (const enemy of enemies) {
        if (!enemy.active || (enemy.isDying === true)) continue;

        // [Priority 1] Aggro: 적이 나를 보고 있는가?
        // enemy.ai가 없을 수도 있으므로 안전하게 체크
        const isAggro = (enemy.ai && enemy.ai.currentTarget === me);
        
        // [Priority 2] Distance
        const dist = getDist(me, enemy);
        
        // [Priority 3] HP
        const hp = enemy.hp;

        // 첫 번째 후보 등록
        if (!bestTarget) {
            bestTarget = enemy;
            bestIsAggro = isAggro;
            bestDist = dist;
            bestHp = hp;
            continue;
        }

        // --- 엄격한 우선순위 비교 ---

        // 1순위: 나를 때리는 적 우선 (Aggro)
        if (isAggro !== bestIsAggro) {
            if (isAggro) { 
                bestTarget = enemy;
                bestIsAggro = isAggro;
                bestDist = dist;
                bestHp = hp;
            }
            continue; 
        }

        // 2순위: 거리 비교 (Hysteresis 5px)
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

        // 3순위: 거리가 비슷할 때(5px 이내), 가장 약한 적 우선 (HP)
        if (hp < bestHp) {
            bestTarget = enemy;
            bestIsAggro = isAggro;
            bestDist = dist;
            bestHp = hp;
        } else if (hp === bestHp) {
            // Tie-breaker: 더 가까운 적
            if (dist < bestDist) {
                bestTarget = enemy;
                bestIsAggro = isAggro;
                bestDist = dist;
                bestHp = hp;
            }
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

    // =================================================================
    // [New] 정찰(Patrol) 및 타겟 탐색
    // =================================================================

    updateRoaming(delta) {
        if (this.isReturning) {
            this.handleReturnLogic(delta);
            return false;
        }

        if (this.isCombatMode || this.isProvoked) return true;

        // 정찰 중 타겟 탐색
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

        // 정찰 이동 로직
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
                this.unit.showEmote("💤", "#00ff00");
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

    // =================================================================
    // [Updated] 타겟 선정 로직 (Priority System)
    // =================================================================

    updateTargetSelection() {
        const now = this.scene.time.now;
        if (this.isProvoked) return; 

        const bestTarget = this.findBestTarget();

        // 현재 타겟과 비교
        if (bestTarget && bestTarget !== this.currentTarget) {
            
            // [Fix] 쿨타임 체크: 하지만 '어그로(Aggro)'가 변경된 경우(긴급 상황)에는 쿨타임 무시
            const isCooldownActive = (now - this.lastTargetChangeTime < this.targetSwitchCooldown);
            const isEmergencySwitch = (bestTarget.ai && bestTarget.ai.currentTarget === this.unit) && 
                                      (!this.currentTarget || (this.currentTarget.ai && this.currentTarget.ai.currentTarget !== this.unit));

            if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
                // 쿨타임 중이고, 긴급한 상황(어그로 변경)이 아니라면 변경 취소
                if (isCooldownActive && !isEmergencySwitch) {
                    return;
                }
            }

            // 타겟 변경 확정
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
        // [Refactor] 분리된 순수 함수 사용
        // Phaser.Math.Distance.Between을 주입하여 계산
        return calculateBestTarget(
            this.unit, 
            this.unit.targetGroup.getChildren(),
            Phaser.Math.Distance.Between
        );
    }

    // =================================================================
    // Main Update Loop
    // =================================================================

    update(delta) {
        if (this.isReturning) {
            this.handleReturnLogic(delta);
            return;
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

        // [Leash Check]
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
                    return;
                }
            } else {
                 this.isReturning = true;
                 this.isCombatMode = false;
                 return;
            }
        }

        // [Target Selection Update]
        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 150 + Math.random() * 100; 
            this.updateTargetSelection();
        }

        // [Flee Logic]
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
                // [Optimization] 단순 가장 가까운 적 탐색도 calculateBestTarget 재활용 가능하지만,
                // 도주는 무조건 '거리'가 중요하므로 기존 findNearestEnemy 유지하되 중복 제거 고려
                const nearestThreat = this.findNearestEnemy(); 
                if (nearestThreat) {
                    const dist = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, nearestThreat.x, nearestThreat.y);
                    if (dist < 350) this.runAway(delta);
                    else { this.unit.setVelocity(0, 0); this.unit.updateFlipX(); }
                }
                return;
            }
        }

        // [Combat Movement]
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
    }

    // =================================================================
    // Helper Methods
    // =================================================================

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
        let ox, oy;
        if (obstacle.pixelX !== undefined) { 
            ox = obstacle.pixelX + obstacle.width / 2;
            oy = obstacle.pixelY + obstacle.height / 2;
        } else {
            ox = obstacle.x;
            oy = obstacle.y;
        }

        const dx = this.unit.x - ox;
        const dy = this.unit.y - oy;
        const newCollisionDir = new Phaser.Math.Vector2();
        
        if (Math.abs(dx) > Math.abs(dy)) {
            newCollisionDir.set(0, Math.sign(dy) || 1);
        } else {
            newCollisionDir.set(Math.sign(dx) || 1, 0);
        }
        
        if (this.wallCollisionTimer > 0) {
            if (this.wallCollisionVector.dot(newCollisionDir) > 0.5) return; 
            this.wallCollisionVector.negate();
            return;
        }

        this.wallCollisionVector.copy(newCollisionDir);
        this.wallCollisionTimer = 500;
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
                }
            } else {
                this.stuckTimer = 0;
            }
        }

        const isLineClear = this.scene.pathfindingManager.isLineClear(
            { x: unit.x, y: unit.y }, 
            { x: this.currentTarget.x, y: this.currentTarget.y }
        );

        if (isLineClear) {
            this.scene.physics.moveToObject(unit, this.currentTarget, unit.moveSpeed);
            unit.updateFlipX();
            this.currentPath = []; 
            return;
        }

        this.pathUpdateTimer -= delta;
        if (this.currentPath.length === 0 || this.pathUpdateTimer <= 0) {
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