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
    }

    // [New] 역할군(Role) 클래스에서 매 프레임 호출해야 함
    processAggro(delta) {
        if (this.provokedTimer > 0) {
            this.provokedTimer -= delta;
        }
    }

    // [New] 도발 상태인지 확인 (타겟이 유효해야 함)
    get isProvoked() {
        return this.provokedTimer > 0 && this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying;
    }

    update(delta) {
        // 기본 UnitAI update는 Role이 없는 유닛이나 override하지 않은 유닛이 사용
        this.processAggro(delta);

        const unit = this.unit;
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
            if (unit.isTargeted()) this.runAway(delta);
            else { unit.setVelocity(0, 0); unit.updateFlipX(); }
            return;
        }

        // [핵심] 도발 상태면 다른 생각 금지
        if (this.isProvoked) {
            if (this.currentTarget) {
                this.moveToTargetSmart(delta);
            }
            return; 
        }

        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 100 + Math.random() * 100;
            this.updateTargetSelection();
        }

        if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
            const distSq = Phaser.Math.Distance.Squared(unit.x, unit.y, this.currentTarget.x, this.currentTarget.y);
            
            let desiredRange = unit.attackRange || 50; 
            if (unit.role === 'Shooter') {
                const aiParams = unit.aiConfig.shooter || {};
                const attackDist = aiParams.attackRange || 250;
                desiredRange = attackDist;
            }

            const inRange = distSq <= desiredRange * desiredRange;
            const hasLOS = inRange ? this.checkLineOfSight() : false;

            if (inRange && hasLOS) {
                unit.setVelocity(0, 0);
                this.currentPath = [];
                this.stuckTimer = 0;
            } else {
                this.moveToTargetSmart(delta);
            }
        } else {
            unit.setVelocity(0, 0);
        }

        if (unit.team !== 'blue' || unit.scene.isAutoBattle) {
            unit.tryUseSkill();
        }
    }

    updateTargetSelection() {
        const now = this.scene.time.now;
        const timeSinceSwitch = now - this.lastTargetChangeTime;
        
        if (this.isProvoked) return; // [Double Check]

        const isShooter = (this.unit.role === 'Shooter');
        const switchCooldown = isShooter ? 100 : 1000;

        if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying && timeSinceSwitch < switchCooldown) {
            return;
        }

        const newTarget = this.findNearestEnemy();
        if (newTarget !== this.currentTarget) {
            this.currentTarget = newTarget;
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
                if (enemy.role === 'Healer') {
                    if (distSq < closestHealerDistSq) {
                        closestHealerDistSq = distSq;
                        closestHealer = enemy;
                    }
                } else {
                    if (distSq < closestNonHealerDistSq) {
                        closestNonHealerDistSq = distSq;
                        closestNonHealer = enemy;
                    }
                }
            }
        }
        
        if (ignoreRoles) return closestTarget;
        return closestNonHealer || closestHealer;
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

    checkLineOfSight() {
        if (!this.currentTarget || !this.currentTarget.active || this.currentTarget.isDying) return false;

        const now = this.scene.time.now;
        if (now < this.losCheckTimer) return this.lastLosResult;
        
        this.losCheckTimer = now + 150;

        const wallLayer = this.scene.wallLayer;
        const blockLayer = this.scene.blockLayer;

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
        if (diffX > 0) this.unit.setFlipX(true);
        else if (diffX < 0) this.unit.setFlipX(false);
    }

    runAway(delta) {
        // 도발 상태면 도망가지 않음 (전사가 도발했는데 도망가면 이상하므로)
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
        if (distSq > 100) { 
            this.scene.physics.moveTo(this.unit, targetX, targetY, this.unit.moveSpeed);
            this.unit.updateFlipX();
        } else {
            this.unit.setVelocity(0, 0);
        }
    }
}