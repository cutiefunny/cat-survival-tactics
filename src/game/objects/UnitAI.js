import Phaser from 'phaser';

export default class UnitAI {
    constructor(unit) {
        this.unit = unit;
        this.scene = unit.scene;

        // [AI State]
        this.currentTarget = null;
        this.thinkTimer = Math.random() * 200;
        this.fleeTimer = 0;
        this.isLowHpFleeing = false;
        
        // [New] 정찰(Roaming) 및 전투 모드 상태 변수
        this.isCombatMode = false;      // true: 전투/추적 모드, false: 정찰 모드
        this.spawnPos = { x: unit.x, y: unit.y }; // 스폰 위치 기억 (배회 중심점)
        this.patrolTimer = 0;           // 다음 배회 지점 이동까지 남은 시간
        this.patrolTarget = null;       // 현재 배회 목표 지점

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
        
        this.lastTargetChangeTime = 0;
        this._tempStart = new Phaser.Math.Vector2();
        this._tempEnd = new Phaser.Math.Vector2();

        // [Wall Collision Handling] 벽 충돌 제어 변수
        this.wallCollisionTimer = 0;
        this.wallCollisionVector = new Phaser.Math.Vector2();
    }

    // =================================================================
    // [New] 정찰(Patrol) 및 집단 대응(Aggro) 시스템
    // =================================================================

    // Unit.js의 updateNpcLogic에서 호출됨
    // 반환값: true(전투 로직 실행 필요), false(정찰 중이므로 전투 로직 건너뜀)
    updateRoaming(delta) {
        // 1. 이미 전투 중이거나 도발 상태라면 즉시 전투 로직(updateAI)으로 넘김
        if (this.isCombatMode || this.isProvoked) return true;

        // 2. 적 탐지 (시야 범위 250px)
        const enemy = this.findNearestEnemy();
        if (enemy) {
            const dist = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, enemy.x, enemy.y);
            // 시야 내에 적이 들어오면 전투 개시
            if (dist <= 250) {
                // LOS 체크 (벽 뒤의 적은 감지 못하게 하려면 주석 해제)
                // this.currentTarget = enemy; 
                // if (!this.checkLineOfSight()) { this.currentTarget = null; return false; }

                this.engageCombat(enemy);
                return true;
            }
        }

        // 3. 정찰(Patrol) 로직 실행
        this.patrolTimer -= delta;

        // 목표 지점에 도착했거나 대기 시간이 다 되면 -> 새로운 배회 지점 설정
        if (this.patrolTimer <= 0) {
            // 스폰 지점 반경 150px 내에서 랜덤 위치 선정
            const rad = 150;
            const rx = this.spawnPos.x + (Math.random() * rad * 2 - rad);
            const ry = this.spawnPos.y + (Math.random() * rad * 2 - rad);
            
            this.patrolTarget = new Phaser.Math.Vector2(rx, ry);
            
            // 이동 시간 + 대기 시간 랜덤 설정 (2~4초)
            this.patrolTimer = 2000 + Math.random() * 2000;
        }

        // 배회 이동 실행
        if (this.patrolTarget) {
            const dist = Phaser.Math.Distance.Between(this.unit.x, this.unit.y, this.patrolTarget.x, this.patrolTarget.y);
            if (dist > 5) {
                // 배회는 천천히 (기본 속도의 50%)
                this.scene.physics.moveTo(this.unit, this.patrolTarget.x, this.patrolTarget.y, this.unit.moveSpeed * 0.5);
                this.unit.updateFlipX();
            } else {
                this.unit.setVelocity(0, 0);
            }
        }

        return false; // 전투 로직(update)은 실행하지 않음
    }

    // 전투 모드 돌입
    engageCombat(target) {
        if (this.isCombatMode) return; // 이미 전투 중이면 무시

        this.isCombatMode = true;
        this.currentTarget = target;
        
        // [Removed] 느낌표(!) 시각 효과 제거됨
        
        // 주변 동료 호출 (Chain Aggro)
        this.broadcastAggro(target);
    }

    // 주변 300px 내의 아군에게 전투 신호 전파 (집단 구타 유도)
    broadcastAggro(target) {
        const allies = (this.unit.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        const alertRadiusSq = 300 * 300; // 호출 범위

        allies.forEach(ally => {
            if (ally.active && ally !== this.unit && ally.ai) {
                // 아직 전투 모드가 아닌 아군만 호출
                if (!ally.ai.isCombatMode) {
                    const distSq = Phaser.Math.Distance.Squared(this.unit.x, this.unit.y, ally.x, ally.y);
                    if (distSq <= alertRadiusSq) {
                        ally.ai.engageCombat(target);
                    }
                }
            }
        });
    }

    // =================================================================
    // 기존 로직 (도발, 벽 충돌, 전투 업데이트 등)
    // =================================================================

    processAggro(delta) {
        if (this.provokedTimer > 0) {
            this.provokedTimer -= delta;
        }
    }

    get isProvoked() {
        return this.provokedTimer > 0 && this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying;
    }

    onWallCollision(obstacle) {
        // 1. 충돌한 장애물의 중심 좌표 계산
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

        // 2. 회피 벡터 계산
        const newCollisionDir = new Phaser.Math.Vector2();
        
        if (Math.abs(dx) > Math.abs(dy)) {
            const option1 = new Phaser.Math.Vector2(0, 1);
            const option2 = new Phaser.Math.Vector2(0, -1);
            
            if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
                const distToTarget1 = Phaser.Math.Distance.Squared(this.unit.x + option1.x * 50, this.unit.y + option1.y * 50, this.currentTarget.x, this.currentTarget.y);
                const distToTarget2 = Phaser.Math.Distance.Squared(this.unit.x + option2.x * 50, this.unit.y + option2.y * 50, this.currentTarget.x, this.currentTarget.y);
                newCollisionDir.copy(distToTarget1 < distToTarget2 ? option1 : option2);
            } else {
                newCollisionDir.set(0, Math.sign(dy) || 1);
            }
        } else {
            const option1 = new Phaser.Math.Vector2(1, 0);
            const option2 = new Phaser.Math.Vector2(-1, 0);
            
            if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
                const distToTarget1 = Phaser.Math.Distance.Squared(this.unit.x + option1.x * 50, this.unit.y + option1.y * 50, this.currentTarget.x, this.currentTarget.y);
                const distToTarget2 = Phaser.Math.Distance.Squared(this.unit.x + option2.x * 50, this.unit.y + option2.y * 50, this.currentTarget.x, this.currentTarget.y);
                newCollisionDir.copy(distToTarget1 < distToTarget2 ? option1 : option2);
            } else {
                newCollisionDir.set(Math.sign(dx) || 1, 0);
            }
        }
        
        if (newCollisionDir.lengthSq() === 0) newCollisionDir.set(1, 0);

        // 3. 연속 충돌 방지
        if (this.wallCollisionTimer > 0) {
            if (this.wallCollisionVector.dot(newCollisionDir) > 0.5) return; 
            this.wallCollisionVector.negate();
            return;
        }

        // 4. 회피 시작
        this.wallCollisionVector.copy(newCollisionDir);
        this.wallCollisionTimer = 500;
    }

    update(delta) {
        // [New] 벽 충돌 반동 처리 (최우선)
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

        const unit = this.unit;
        
        // 1. [생존 본능] 낮은 체력 도망 (탱커 제외)
        if (unit.role !== 'Tanker') {
            const fleeThreshold = unit.aiConfig.common?.fleeHpThreshold ?? 0.2;
            const hpRatio = unit.hp / unit.maxHp;
            
            if (!this.isLowHpFleeing && hpRatio <= fleeThreshold) {
                this.isLowHpFleeing = true;
                unit.setTint(0xff5555); 
            } else if (this.isLowHpFleeing && hpRatio >= 0.5) {
                this.isLowHpFleeing = false;
                unit.resetVisuals(); 
            }

            if (this.isLowHpFleeing) {
                const nearestThreat = this.findNearestEnemy();
                let distToThreat = Infinity;
                if (nearestThreat) {
                    distToThreat = Phaser.Math.Distance.Between(unit.x, unit.y, nearestThreat.x, nearestThreat.y);
                }
                const safeDist = 350;
                if (distToThreat < safeDist) {
                     this.runAway(delta);
                } else {
                     unit.setVelocity(0, 0); 
                     unit.updateFlipX(); 
                }
                return;
            }
        }

        // 2. 도발 상태 처리
        if (this.isProvoked) {
            if (this.currentTarget) {
                this.moveToTargetSmart(delta);
            }
            return; 
        }

        // 3. 타겟 탐색
        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 100 + Math.random() * 100;
            this.updateTargetSelection();
        }

        // 4. 전투 행동 및 이동
        if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
            const distSq = Phaser.Math.Distance.Squared(unit.x, unit.y, this.currentTarget.x, this.currentTarget.y);
            
            let desiredRange = unit.attackRange || 50; 
            if (unit.role === 'Shooter') {
                const aiParams = unit.aiConfig.shooter || {};
                desiredRange = aiParams.attackRange || 250;
            }

            const inRange = distSq <= desiredRange * desiredRange;
            const hasLOS = inRange ? this.checkLineOfSight() : false;

            if (inRange && hasLOS) {
                // 사거리 내 + 시야 확보됨 -> 공격 태세 (정지)
                unit.setVelocity(0, 0);
                this.currentPath = [];
                this.stuckTimer = 0;
                
                if (unit.role === 'Shooter') {
                     // Shooter는 updateAI에서 lookAt 처리
                } else {
                     const diffX = this.currentTarget.x - unit.x;
                     if (Math.abs(diffX) > 10) unit.setFlipX(diffX > 0);
                }
            } else {
                // 사거리 밖 -> 추적
                this.moveToTargetSmart(delta);
            }
        } else {
            // 타겟이 없거나 죽음 -> 전투 모드 해제 고려
            // (여기서 바로 정지시키면 다음 updateRoaming 호출 시 다시 정찰 시작)
            unit.setVelocity(0, 0);
            this.isCombatMode = false; 
        }

        // 5. 스킬 사용 시도 (Auto Battle)
        if (unit.team !== 'blue' || unit.scene.isAutoBattle) {
            unit.tryUseSkill();
        }
    }

    updateTargetSelection() {
        const now = this.scene.time.now;
        const timeSinceSwitch = now - this.lastTargetChangeTime;
        
        if (this.isProvoked) return; 

        // 슈터는 타겟 전환을 더 자주 함
        const isShooter = (this.unit.role === 'Shooter');
        const switchCooldown = isShooter ? 100 : 1000;

        // 현재 타겟이 살아있고 쿨타임 안 지났으면 유지
        if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying && timeSinceSwitch < switchCooldown) {
            return;
        }

        // 가장 가까운 적 탐색
        const newTarget = this.findNearestEnemy();
        
        // 타겟이 바뀌었거나 새로 생겼으면 전투 개시
        if (newTarget && newTarget !== this.currentTarget) {
            this.engageCombat(newTarget); // [New] 타겟 발견 시 즉시 전투 모드 및 동료 호출
            this.lastTargetChangeTime = now;
        }
    }

    findNearestEnemy() {
        const enemies = this.unit.targetGroup.getChildren();
        let closestDistSq = Infinity;
        let closestTarget = null;
        
        const ignoreRoles = (this.unit.role === 'Shooter');
        const myX = this.unit.x;
        const myY = this.unit.y;

        let closestNonHealerDistSq = Infinity;
        let closestNonHealer = null;
        let closestHealerDistSq = Infinity;
        let closestHealer = null;

        for (const enemy of enemies) {
            if (!enemy.active || enemy.isDying) continue; 

            const distSq = (myX - enemy.x) ** 2 + (myY - enemy.y) ** 2;

            if (ignoreRoles) {
                if (distSq < closestDistSq) {
                    closestDistSq = distSq;
                    closestTarget = enemy;
                }
            } else {
                if (distSq < closestDistSq) {
                    closestDistSq = distSq;
                    closestTarget = enemy;
                }
            }
        }
        
        return closestTarget;
    }

    findLowestHpAlly() {
        const allies = (this.unit.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        let lowestHpVal = Infinity; 
        let target = null;
        
        for (let ally of allies) {
            if (ally.active && !ally.isDying && ally !== this.unit && ally.hp < ally.maxHp) { 
                if (ally.hp < lowestHpVal) { 
                    lowestHpVal = ally.hp; 
                    target = ally; 
                }
            }
        }
        return target;
    }

    findAllyUnderAttack() {
        const allies = (this.unit.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        let bestTarget = null;
        let maxUrgency = -1;

        for (let ally of allies) {
            if (!ally.active || ally.isDying || ally === this.unit) continue;

            const targetingEnemies = ally.findEnemiesTargetingMe ? ally.findEnemiesTargetingMe().length : 0;
            const hpRatio = ally.hp / ally.maxHp;

            let urgency = (targetingEnemies * 100) + ((1 - hpRatio) * 200);
            if (ally.role === 'Healer') urgency += 300;
            if (ally.role === 'Shooter') urgency += 150;

            if (targetingEnemies > 0 && urgency > maxUrgency) {
                maxUrgency = urgency;
                bestTarget = ally;
            }
        }
        return bestTarget;
    }

    findStrategicTarget(weights = {}) {
        const enemies = this.unit.targetGroup.getChildren();
        
        const wDist = weights.distance ?? 1.0; 
        const wHp = weights.lowHp ?? 2.0;       
        const roleBonus = weights.rolePriority ?? { 'Healer': 500, 'Shooter': 300 }; 

        let bestTarget = null;
        let bestScore = -Infinity;
        const myX = this.unit.x;
        const myY = this.unit.y;

        for (const enemy of enemies) {
            if (!enemy.active || enemy.isDying) continue;

            const dist = Phaser.Math.Distance.Between(myX, myY, enemy.x, enemy.y);
            if (dist <= 0.1) continue;

            const hpRatio = enemy.hp / enemy.maxHp;
            
            let score = 0;
            score += (1000 / dist) * wDist;          
            score += ((1 - hpRatio) * 1000) * wHp;   
            
            if (roleBonus[enemy.role]) {
                score += roleBonus[enemy.role];      
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = enemy;
            }
        }
        return bestTarget;
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