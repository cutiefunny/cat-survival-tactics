import Phaser from 'phaser';
import { ROLE_TEXTURES } from '../data/UnitData'; 

// [Frame Constants]
const FRAME_IDLE = 0;
const FRAME_ATTACK = 3;
const FRAME_HIT = 4;
const FRAME_SKILL = 5;

export default class Unit extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader = false) {
        // [Visual Config]
        const roleKey = stats.role || 'Normal';
        const assignedTexture = ROLE_TEXTURES[roleKey] || (team === 'red' ? 'dog' : 'leader');

        super(scene, x, y, assignedTexture);

        this.textureKey = assignedTexture;
        this.scene = scene;
        this.team = team;
        this.targetGroup = targetGroup;
        this.isLeader = isLeader;

        // [Stats]
        this.role = roleKey;
        this.baseSize = (this.role === 'Tanker') ? 60 : 50;

        this.maxHp = stats.hp;
        this.hp = this.maxHp;

        this.baseAttackPower = stats.attackPower;
        this.attackPower = this.baseAttackPower;
        this.moveSpeed = stats.moveSpeed;
        this.attackRange = stats.attackRange || 50;
        this.aiConfig = stats.aiConfig || {};

        this.formationOffset = { x: 0, y: 0 };
        this.savedRelativePos = { x: 0, y: 0 };

        // [Position Validation]
        this.lastValidPosition = { x: x, y: y };

        // [Pathfinding State]
        this.currentPath = [];
        this.pathUpdateTimer = 0;
        this.lastPathCalcTime = 0;

        // [Combat]
        this.attackCooldown = stats.attackCooldown || 500;
        this.lastAttackTime = 0;

        this.skillMaxCooldown = stats.skillCooldown || 0;
        this.skillRange = stats.skillRange || 0;
        this.skillDuration = stats.skillDuration || 0;
        this.skillEffect = stats.skillEffect || 0;
        this.skillTimer = 0;
        this.isUsingSkill = false;

        // [Status Flags]
        this.isDying = false; 
        this.isAttacking = false;
        this.isTakingDamage = false;

        // [AI State]
        this.thinkTimer = Math.random() * 200;
        this.fleeTimer = 0;
        this.currentTarget = null;
        this.isLowHpFleeing = false;

        // [Aggro System]
        this.noCombatTimer = 0;
        this.lastTargetChangeTime = 0; 

        // [Optimization]
        this._tempVec = new Phaser.Math.Vector2();
        this._tempStart = new Phaser.Math.Vector2();
        this._tempEnd = new Phaser.Math.Vector2();
        this._tempDir = new Phaser.Math.Vector2();

        // [Avoidance System] - 제거됨 (변수만 유지하거나 삭제 가능, 여기선 호환성 위해 남김)
        this.isAvoiding = false;
        this.avoidTimer = 0;
        this.avoidDir = new Phaser.Math.Vector2();
        this.savedAvoidDir = null;
        this.wallFreeTimer = 0;

        // [LOS Optimization]
        this.losCheckTimer = 0;
        this.lastLosResult = true;

        // [Debug UI]
        this.debugText = null;
        this.debugGraphic = null;
        this.debugUpdateTimer = 0;
        this.lastDrawnHpPct = 1;

        // [Physics Init]
        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.setCollideWorldBounds(true);
        this.setBounce(0.2);
        this.setDrag(200);

        // [Components Init]
        this.hpBar = scene.add.graphics().setDepth(100);
        this.initVisuals();

        // [Interaction]
        this.on('pointerdown', () => {
            if (this.team === 'blue' && this.scene.battleStarted) {
                this.scene.selectPlayerUnit(this);
            }
        });
    }

    die() {
        if (this.isDying) return; 
        this.isDying = true;

        this.destroyDebugObjects();
        if (this.hpBar) this.hpBar.destroy();

        if (this.body) {
            this.setVelocity(0, 0);
            this.body.checkCollision.none = true;
            this.body.enable = false; 
        }

        this.scene.tweens.killTweensOf(this); 
        if (this.anims.isPlaying) this.stop(); 
        this.setFrame(FRAME_HIT); 
        this.clearTint(); 

        this.scene.tweens.add({
            targets: this,
            angle: 90,       
            duration: 500,   
            ease: 'Power1',
            onComplete: () => {
                this.destroy(); 
            }
        });
    }

    createDebugObjects() {
        this.debugText = this.scene.add.text(this.x, this.y, '', { font: '10px monospace', fill: '#ffffff', stroke: '#000000', strokeThickness: 2, align: 'center' }).setOrigin(0.5, 1.3).setDepth(9999);
        this.debugGraphic = this.scene.add.graphics().setDepth(9999);
    }

    destroyDebugObjects() {
        if (this.debugText) {
            this.debugText.destroy();
            this.debugText = null;
        }
        if (this.debugGraphic) {
            this.debugGraphic.destroy();
            this.debugGraphic = null;
        }
    }

    enforceWorldBounds() {
        const bounds = this.scene.physics.world.bounds;
        const padding = this.baseSize / 2;

        const clampedX = Phaser.Math.Clamp(this.x, bounds.x + padding, bounds.right - padding);
        const clampedY = Phaser.Math.Clamp(this.y, bounds.y + padding, bounds.bottom - padding);

        if (this.x !== clampedX || this.y !== clampedY) {
            this.x = clampedX;
            this.y = clampedY;
            this.setVelocity(0, 0);
        }
    }

    validatePosition() {
        if (!this.active || !this.body) return;

        let isInvalid = false;

        if (this.scene.blockLayer) {
            const tile = this.scene.blockLayer.getTileAtWorldXY(this.x, this.y);
            if (tile && tile.canCollide) {
                isInvalid = true;
            }
        }

        if (!isInvalid && this.scene.blockObjectGroup) {
            if (this.scene.physics.overlap(this, this.scene.blockObjectGroup)) {
                isInvalid = true;
            }
        }

        if (isInvalid) {
            this.x = this.lastValidPosition.x;
            this.y = this.lastValidPosition.y;
            this.body.reset(this.x, this.y); 
            this.setVelocity(0, 0); 
        } else {
            this.lastValidPosition.x = this.x;
            this.lastValidPosition.y = this.y;
        }
    }

    update(time, delta) {
        if (!this.active || this.isDying) return; 
        
        this.validatePosition();
        this.updateUI();

        if (this.scene.uiManager && this.scene.uiManager.isDebugEnabled) {
            this.handleDebugUpdates(delta);
        } else if (this.debugText) {
            this.destroyDebugObjects();
        }

        const adjustedDelta = delta * (this.scene.gameSpeed || 1);
        if (this.skillTimer > 0) this.skillTimer -= adjustedDelta;

        if (this.hp < this.maxHp * 0.5 && this.body.velocity.lengthSq() < 10 && !this.isTakingDamage && !this.isAttacking) {
            this.handleRegen(adjustedDelta);
        }

        if (this.scene.isSetupPhase) { this.setVelocity(0, 0); return; }
        this.enforceWorldBounds();
        if (this.scene.isGameOver) { this.setVelocity(0, 0); if (this.anims.isPlaying) this.stop(); return; }

        // [Note] isAvoiding 관련 로직 제거됨 (코드 단순화)

        if (this.fleeTimer > 0) this.fleeTimer -= adjustedDelta;

        if (this.isLeader) {
            this.updatePlayerLogic(adjustedDelta);
        } else {
            this.updateNpcLogic(adjustedDelta);
        }
        
        this.updateAnimation();
    }

    updateTargetSelection() {
        const now = this.scene.time.now;
        const timeSinceSwitch = now - this.lastTargetChangeTime;
        
        const isShooter = (this.role === 'Shooter');
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

    handleDebugUpdates(delta) {
        if (!this.debugText) this.createDebugObjects();
        this.updateDebugVisuals();
    }

    handleRegen(delta) {
        const regenCap = this.maxHp * 0.5;
        const regenRate = this.aiConfig.common?.hpRegenRate ?? 0.01;
        const regenAmount = (this.maxHp * regenRate) * (delta / 1000);

        this.hp = Math.min(this.hp + regenAmount, regenCap);

        if (Math.abs(this.hp - (this.lastDrawnHpPct * this.maxHp)) > 1) {
            this.redrawHpBar();
        }
    }

    updatePlayerLogic(delta) {
        this.updatePlayerMovement();
        const isMovingManually = (this.body.velocity.x !== 0 || this.body.velocity.y !== 0);
        if (!isMovingManually && this.scene.isAutoBattle && this.scene.battleStarted) {
            this.updateAI(delta);
        }
    }

    updateNpcLogic(delta) {
        if (!this.scene.battleStarted) {
            this.updateFormationFollow(delta);
            return;
        }

        if (this.team === 'blue') {
            if (this.isLowHpFleeing) {
                this.updateAI(delta);
            } else {
                switch (this.scene.squadState) {
                    case 'FORMATION': this.updateFormationFollow(delta); break;
                    case 'FLEE': this.runAway(delta); break;
                    case 'FREE': default: this.updateAI(delta); break;
                }
            }
        } else {
            this.updateAI(delta);
        }
    }

    isTargeted() {
        if (!this.targetGroup) return false;
        return this.targetGroup.getChildren().some(enemy => enemy.active && enemy.currentTarget === this);
    }

    checkLineOfSight() {
        if (!this.currentTarget || !this.currentTarget.active || this.currentTarget.isDying) return false;

        const now = this.scene.time.now;
        if (now < this.losCheckTimer) return this.lastLosResult;
        
        this.losCheckTimer = now + 150;

        const wallLayer = this.scene.wallLayer;
        const blockLayer = this.scene.blockLayer;

        this._tempStart.set(this.x, this.y);
        this._tempEnd.set(this.currentTarget.x, this.currentTarget.y);
        const line = new Phaser.Geom.Line(this.x, this.y, this.currentTarget.x, this.currentTarget.y);

        // Raycasting Check (Layers)
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

        // Object Intersection Check
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

    // [Simplified] 벽 충돌 처리: 경로만 리셋하고 멈춤 (슬라이딩 없음)
    handleWallCollision(tile) {
        if (this.currentPath.length > 0) {
            this.currentPath = []; // 경로를 잃었으므로 다시 탐색하도록 리셋
            this.setVelocity(0, 0);
        }
    }

    updateAI(delta) {
        const fleeThreshold = this.aiConfig.common?.fleeHpThreshold ?? 0.2;
        const hpRatio = this.hp / this.maxHp;
        
        if (!this.isLowHpFleeing && hpRatio <= fleeThreshold) {
            this.isLowHpFleeing = true;
            this.setTint(0xff5555); 
        } else if (this.isLowHpFleeing && hpRatio >= 0.5) {
            this.isLowHpFleeing = false;
            this.resetVisuals(); 
        }

        if (this.isLowHpFleeing) {
            if (this.isTargeted()) this.runAway(delta);
            else { this.setVelocity(0, 0); this.updateFlipX(); }
            return;
        }

        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 100 + Math.random() * 100;
            this.updateTargetSelection();
        }

        if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
            const distSq = Phaser.Math.Distance.Squared(this.x, this.y, this.currentTarget.x, this.currentTarget.y);
            const roleKey = this.role.toLowerCase();
            const aiParams = this.aiConfig[roleKey] || {};
            let desiredRange = 50; 

            if (this.role === 'Shooter') {
                const kiteDist = aiParams.kiteDistance || 200;
                const attackDist = aiParams.attackRange || 250;
                
                if (distSq < kiteDist * kiteDist) { 
                    const angle = Phaser.Math.Angle.Between(this.currentTarget.x, this.currentTarget.y, this.x, this.y);
                    this.scene.physics.velocityFromRotation(angle, this.moveSpeed, this.body.velocity); 
                    this.updateFlipX();
                    return;
                }
                desiredRange = attackDist;
            } else {
                desiredRange = this.attackRange || 50;
            }

            const inRange = distSq <= desiredRange * desiredRange;
            // 시야 체크 (벽 뒤에 있으면 이동해야 함)
            const hasLOS = inRange ? this.checkLineOfSight() : false;

            if (inRange && hasLOS) {
                this.setVelocity(0, 0);
                this.currentPath = [];
            } else {
                this.moveToTargetSmart(delta);
            }
        } else {
            this.setVelocity(0, 0);
        }

        if (this.team !== 'blue' || this.scene.isAutoBattle) this.tryUseSkill();
    }

    // [Restored] Pathfinding AI Logic
    moveToTargetSmart(delta) {
        if (!this.currentTarget) return;

        // 1. 직선 경로 확인
        const isLineClear = this.scene.pathfindingManager.isLineClear(
            { x: this.x, y: this.y }, 
            { x: this.currentTarget.x, y: this.currentTarget.y }
        );

        // 2. 직선 이동 가능하면 바로 이동
        if (isLineClear) {
            this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
            this.updateFlipX();
            this.currentPath = []; 
            return;
        }

        // 3. 경로 탐색 (장애물 우회)
        this.pathUpdateTimer -= delta;
        if (this.currentPath.length === 0 || this.pathUpdateTimer <= 0) {
            this.pathUpdateTimer = 500 + Math.random() * 300; 
            const path = this.scene.pathfindingManager.findPath(
                { x: this.x, y: this.y },
                { x: this.currentTarget.x, y: this.currentTarget.y }
            );
            if (path && path.length > 0) {
                this.currentPath = path;
                this.lastPathCalcTime = this.scene.time.now;
            }
        }

        // 4. 경로 따라가기
        if (this.currentPath.length > 0) {
            const nextPoint = this.currentPath[0];
            const distToPoint = Phaser.Math.Distance.Between(this.x, this.y, nextPoint.x, nextPoint.y);

            if (distToPoint < 15) { 
                this.currentPath.shift();
                if (this.currentPath.length > 0) {
                    this.moveToPoint(this.currentPath[0]);
                }
            } else {
                this.moveToPoint(nextPoint);
            }
        } else {
            // 경로 없음 -> 일단 직진 (Physics 처리)
            this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
        }
        this.updateFlipX();
    }

    moveToPoint(point) {
        this.scene.physics.moveTo(this, point.x, point.y, this.moveSpeed);
        const diffX = point.x - this.x;
        if (diffX > 0) this.setFlipX(true);
        else if (diffX < 0) this.setFlipX(false);
    }

    // ... [기존 findNearestEnemy 등 나머지 메서드들] ...

    findNearestEnemy() {
        const enemies = this.targetGroup.getChildren();
        let closestDistSq = Infinity;
        let closestTarget = null;
        
        const ignoreRoles = (this.role === 'Shooter');

        let closestNonHealerDistSq = Infinity;
        let closestNonHealer = null;
        let closestHealerDistSq = Infinity;
        let closestHealer = null;

        const myX = this.x;
        const myY = this.y;

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
        const allies = (this.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        let lowestHpVal = Infinity; let target = null;
        for (let ally of allies) {
            if (ally.active && !ally.isDying && ally !== this && ally.hp < ally.maxHp) { 
                if (ally.hp < lowestHpVal) { lowestHpVal = ally.hp; target = ally; }
            }
        }
        return target;
    }
    
    findWeakestEnemy() { return null; }
    findEnemyEngagingAlly() { return null; }
    
    updatePlayerMovement() {
        this.setVelocity(0);
        if (!this.scene.cursors) return;
        const cursors = this.scene.cursors; const joyCursors = this.scene.joystickCursors;
        let vx = 0, vy = 0;
        if (cursors.left.isDown || this.scene.wasd?.left.isDown || (joyCursors && joyCursors.left.isDown)) vx -= 1;
        if (cursors.right.isDown || this.scene.wasd?.right.isDown || (joyCursors && joyCursors.right.isDown)) vx += 1;
        if (cursors.up.isDown || this.scene.wasd?.up.isDown || (joyCursors && joyCursors.up.isDown)) vy -= 1;
        if (cursors.down.isDown || this.scene.wasd?.down.isDown || (joyCursors && joyCursors.down.isDown)) vy += 1;
        if (vx !== 0 || vy !== 0) {
            this._tempVec.set(vx, vy).normalize().scale(this.moveSpeed);
            this.setVelocity(this._tempVec.x, this._tempVec.y);
            this.updateFlipX();
        }
    }
    
    updateFormationFollow(delta) {
        if (this.isLeader) return; 
        
        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) { 
            this.thinkTimer = 100 + Math.random() * 100; 
            this.updateTargetSelection();
        }
        
        if (!this.isLowHpFleeing) {
            if (this.team !== 'blue' || this.scene.isAutoBattle) this.tryUseSkill();
        }

        if (this.team !== 'blue') { this.setVelocity(0); return; }
        const leader = this.scene.playerUnit;
        if (!leader || !leader.active) return;
        const tx = leader.x + this.formationOffset.x; const ty = leader.y + this.formationOffset.y;
        if (Phaser.Math.Distance.Squared(this.x, this.y, tx, ty) > 25) {
            this.scene.physics.moveTo(this, tx, ty, this.moveSpeed);
            this.updateFlipX();
        } else { this.setVelocity(0); }
    }
    
    runAway(delta) {
        if (!this.currentTarget || !this.currentTarget.active || this.currentTarget.isDying) {
            this.currentTarget = this.findNearestEnemy();
        }
        
        if (this.currentTarget && this.currentTarget.active && !this.currentTarget.isDying) {
            const angle = Phaser.Math.Angle.Between(this.currentTarget.x, this.currentTarget.y, this.x, this.y); 
            const speed = this.moveSpeed * 1.2; 
            
            this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
            this.updateFlipX();
        } else { 
            this.updateFormationFollow(delta); 
        }
    }

    // --- Visuals ---

    initVisuals() {
        this.setFrame(FRAME_IDLE);
        
        if (this.team === 'blue') {
            this.setFlipX(true); 
            if (this.isLeader) this.setTint(0xffffaa);
        } else {
            this.setFlipX(false); 
            if (this.isLeader) this.setTint(0xffff00);
        }
        
        this.resetVisuals();
        this.redrawHpBar();
    }

    resetVisuals() {
        this.scale = 1;
        this.setDisplaySize(this.baseSize, this.baseSize);
        
        this.setAlpha(1);

        if (this.body) {
            const targetDiameter = this.baseSize;
            const scale = this.scaleX; 
            
            const bodyRadius = (targetDiameter / 2) / scale;
            const offset = (this.width - (bodyRadius * 2)) / 2;
            
            this.body.setCircle(bodyRadius, offset, offset); 
        }
        if (this.team === 'blue') {
            if (this.isLeader) this.setTint(0xffffaa);
            else this.clearTint(); 
        } else {
            if (this.isLeader) this.setTint(0xffff00);
            else this.clearTint();
        }
        
        if (this.isLowHpFleeing) this.setTint(0xff5555);

        if (!this.anims.isPlaying && !this.isUsingSkill && !this.isAttacking) {
             this.setFrame(FRAME_IDLE);
        }
    }

    tryUseSkill() {
        if (this.skillTimer <= 0 && this.skillMaxCooldown > 0) {
            this.performSkill(); 
            this.skillTimer = this.skillMaxCooldown;
            if(this.role !== 'Healer') this.setTint(0xffffff);
        }
    }

    performSkill() {
        this.setTint(0x00ffff);
        this.isUsingSkill = true;

        if (this.texture.frameTotal > 5) {
            this.setFrame(FRAME_SKILL);
        } else {
            this.setFrame(FRAME_ATTACK);
        }

        const range = this.skillRange;
        this.targetGroup.getChildren().forEach(enemy => {
            if (enemy.active && !enemy.isDying && Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y) < range * range) { 
                enemy.takeDamage(this.attackPower * 2); 
            }
        });
        this.scene.time.delayedCall(500, () => {
            if(this.active && !this.isDying) { 
                this.isUsingSkill = false;
                this.resetVisuals();
            }
        });
    }

    takeDamage(amount) {
        if (!this.scene.battleStarted || this.isDying) return; 

        this.hp -= amount;
        this.onTakeDamage(); 
        
        this.isTakingDamage = true;
        this.setFrame(FRAME_HIT);
        
        this.resetVisuals();
        this.scene.tweens.killTweensOf(this);
        const popSize = this.baseSize * 1.2;
        this.scene.tweens.add({
            targets: this, displayWidth: popSize, displayHeight: popSize, duration: 50, yoyo: true, ease: 'Quad.easeOut',
            onComplete: () => { if (this.active && !this.isDying) this.resetVisuals(); }
        });
        this.scene.time.delayedCall(500, () => {
            if (this.active && this.hp > 0 && !this.isDying) {
                this.isTakingDamage = false;
                if (this.isAttacking) return; 
                this.setFrame(FRAME_IDLE);
                this.resetVisuals();
            }
        });
        
        this.redrawHpBar();
        if (this.hp <= 0) this.die();
    }

    onTakeDamage() {}

    redrawHpBar() {
        if (!this.hpBar) return;
        this.hpBar.clear();
        if (this.hp <= 0) return;
        
        this.lastDrawnHpPct = this.hp / this.maxHp;

        const w = 32;
        const x = -w/2, y = -(this.baseSize/2)-10;
        this.hpBar.fillStyle(0x000000);
        this.hpBar.fillRect(x, y, w, 4);
        const pct = Phaser.Math.Clamp(this.lastDrawnHpPct, 0, 1);
        this.hpBar.fillStyle(pct > 0.5 ? 0x00ff00 : 0xff0000);
        this.hpBar.fillRect(x, y, w * pct, 4);
    }

    updateUI() {
        if (this.hpBar) {
            this.hpBar.setPosition(this.x, this.y - (this.baseSize / 2) + 20);
        }
    }

    updateDebugVisuals() {
        if (!this.debugText || !this.debugGraphic) return;

        this.debugText.setVisible(true);
        this.debugGraphic.setVisible(true);
        this.debugGraphic.clear();
        this.debugText.setPosition(this.x, this.y - (this.baseSize / 2) - 30);

        let statusStr = "COMBAT";
        let color = "#ffffff";
        
        if (this.isLowHpFleeing) {
            statusStr = "😱FLEE";
            color = "#ff0000"; 
        } else if (this.body.velocity.lengthSq() < 10 && this.hp < this.maxHp * 0.5) {
            statusStr = "♻️REGEN";
            color = "#00ff00"; 
        } else {
            statusStr = "⚔️COMBAT";
            color = "#ffffff";
        }

        const hpPct = (this.hp / this.maxHp * 100).toFixed(0);
        this.debugText.setText(`${statusStr}\nHP:${hpPct}%`);
        this.debugText.setColor(color);
        
        if (this.currentTarget && this.currentTarget.active) {
            this.debugGraphic.lineStyle(1, 0xff0000, 0.3);
            this.debugGraphic.lineBetween(this.x, this.y, this.currentTarget.x, this.currentTarget.y);
        }
        
        if (this.currentPath && this.currentPath.length > 0) {
            const now = this.scene.time.now;
            const isFresh = (now - this.lastPathCalcTime < 300); 
            
            const pathColor = isFresh ? 0x00ff00 : 0x00ffff; 
            const lineWidth = isFresh ? 4 : 2;
            const alpha = isFresh ? 0.9 : 0.5;

            this.debugGraphic.lineStyle(lineWidth, pathColor, alpha);
            this.debugGraphic.beginPath();
            this.debugGraphic.moveTo(this.x, this.y);
            this.currentPath.forEach(pt => this.debugGraphic.lineTo(pt.x, pt.y));
            this.debugGraphic.strokePath();
            
            this.debugGraphic.fillStyle(pathColor, alpha);
            this.currentPath.forEach(pt => {
                this.debugGraphic.fillCircle(pt.x, pt.y, 3);
            });
            
            if (isFresh) {
                 this.debugText.setText("⚡RECALC⚡\n" + this.debugText.text);
                 this.debugText.setColor("#00ff00");
            }
        }
    }

    updateFlipX() {
        if (this.isAttacking && this.currentTarget && this.currentTarget.active) {
            const diffX = this.currentTarget.x - this.x;
            if (diffX > 0) {
                this.setFlipX(true); 
            } else if (diffX < 0) {
                this.setFlipX(false); 
            }
            return;
        }

        if (this.body.velocity.x < -5) {
            this.setFlipX(false);
        } else if (this.body.velocity.x > 5) {
            this.setFlipX(true);
        }
    }

    updateAnimation() {
        const isBusy = (this.isTakingDamage || this.isAttacking || this.isUsingSkill);
        if (!isBusy) {
            if (this.body.velocity.length() > 5) {
                const walkKey = `${this.textureKey}_walk`;
                if (this.scene.anims.exists(walkKey)) {
                    if (!this.anims.isPlaying || this.anims.currentAnim.key !== walkKey) {
                        this.play(walkKey, true);
                    }
                }
            } else {
                if (this.anims.isPlaying) {
                    this.stop();
                    this.setFrame(FRAME_IDLE);
                    this.resetVisuals();
                }
            }
        }
    }

    triggerAttackVisuals() {
        this.isAttacking = true;
        this.setFrame(FRAME_ATTACK);
        
        this.resetVisuals();
        this.scene.tweens.killTweensOf(this);
        const popSize = this.baseSize * 1.2;
        this.scene.tweens.add({
            targets: this, displayWidth: popSize, displayHeight: popSize, duration: 50, yoyo: true, ease: 'Quad.easeOut',
            onComplete: () => { if (this.active && !this.isDying) this.resetVisuals(); }
        });
        this.scene.time.delayedCall(300, () => {
            if(this.active && !this.isDying) {
                this.isAttacking = false;
                if (this.isTakingDamage) return;
                this.setFrame(FRAME_IDLE);
                this.resetVisuals();
            }
        });
    }

    saveFormationPosition(refX, refY) {
        this.savedRelativePos.x = this.x - refX;
        this.savedRelativePos.y = this.y - refY;
        this.formationOffset.x = this.savedRelativePos.x;
        this.formationOffset.y = this.savedRelativePos.y;
    }

    calculateFormationOffset(leaderUnit) {
        if (!leaderUnit || !leaderUnit.active) return;
        this.formationOffset.x = this.savedRelativePos.x - leaderUnit.savedRelativePos.x;
        this.formationOffset.y = this.savedRelativePos.y - leaderUnit.savedRelativePos.y;
    }

    followLeader() {
        if (!this.scene.playerUnit || !this.scene.playerUnit.active) {
            this.setVelocity(0, 0);
            return;
        }
        const targetX = this.scene.playerUnit.x + this.formationOffset.x;
        const targetY = this.scene.playerUnit.y + this.formationOffset.y;
        const distSq = Phaser.Math.Distance.Squared(this.x, this.y, targetX, targetY);
        if (distSq > 100) { 
            this.scene.physics.moveTo(this, targetX, targetY, this.moveSpeed);
            this.updateFlipX();
        } else {
            this.setVelocity(0, 0);
        }
    }
}