import Phaser from 'phaser';

// [Role Texture Mapping]
const ROLE_TEXTURES = {
    'Tanker': 'tanker',
    'Shooter': 'shooter',
    'Runner': 'runner', 
    'Dealer': 'leader',    
    'Leader': 'leader',    
    'Normal': 'leader',    
    'Healer': 'healer',    
    'Raccoon': 'raccoon',  
    'NormalDog': 'dog'     
};

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

        // [Combat]
        this.attackCooldown = stats.attackCooldown || 500;
        this.lastAttackTime = 0;
        
        this.skillMaxCooldown = stats.skillCooldown || 0; 
        this.skillRange = stats.skillRange || 0;
        this.skillDuration = stats.skillDuration || 0;
        this.skillEffect = stats.skillEffect || 0; 
        this.skillTimer = 0;
        this.isUsingSkill = false;
        
        // [AI State]
        this.thinkTimer = Math.random() * 200; 
        this.fleeTimer = 0;
        this.currentTarget = null;
        this.isLowHpFleeing = false; 
        
        // [Optimization] 벡터 재사용 (GC 방지)
        this._tempVec = new Phaser.Math.Vector2();
        this._tempStart = new Phaser.Math.Vector2();
        this._tempEnd = new Phaser.Math.Vector2();
        this._tempDir = new Phaser.Math.Vector2();

        // [Avoidance System]
        this.isAvoiding = false;
        this.avoidTimer = 0;
        this.avoidDir = new Phaser.Math.Vector2();
        this.savedAvoidDir = null; 
        this.wallFreeTimer = 0;

        // [LOS Optimization]
        this.losCheckTimer = 0; 
        this.lastLosResult = true;

        // [Debug UI - Lazy Init]
        // 생성자에서는 만들지 않고 null로 초기화하여 메모리 절약
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
        this.destroyDebugObjects(); // 죽을 때 디버그 객체 정리
        if (this.hpBar) this.hpBar.destroy();
        this.destroy();
    }

    // [New] 디버그 객체 생성 (필요할 때만 호출)
    createDebugObjects() {
        this.debugText = this.scene.add.text(this.x, this.y, '', { font: '10px monospace', fill: '#ffffff', stroke: '#000000', strokeThickness: 2, align: 'center' }).setOrigin(0.5, 1.3).setDepth(9999);
        this.debugGraphic = this.scene.add.graphics().setDepth(9999);
    }

    // [New] 디버그 객체 파괴 (메모리 회수)
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

    update(time, delta) {
        if (!this.active) return;
        this.updateUI();

        // [Optimization] 디버그 모드 체크 및 Lazy Loading
        const isDebugMode = this.scene.uiManager && (this.scene.uiManager.debugStats || this.scene.uiManager.debugText);
        
        if (isDebugMode) {
            // 켜져 있는데 객체가 없으면 생성
            if (!this.debugText) this.createDebugObjects();
            
            // 업데이트 빈도 제한 (200ms)
            this.debugUpdateTimer += delta;
            if (this.debugUpdateTimer > 200) {
                this.updateDebugVisuals();
                this.debugUpdateTimer = 0;
            }
        } else {
            // 꺼져 있는데 객체가 있으면 파괴
            if (this.debugText) this.destroyDebugObjects();
        }

        const adjustedDelta = delta * (this.scene.gameSpeed || 1);
        if (this.skillTimer > 0) this.skillTimer -= adjustedDelta;
        
        // [Regen Logic]
        if (this.body.velocity.lengthSq() < 10 && !this.isTakingDamage && !this.isAttacking) {
            const regenCap = this.maxHp * 0.5; 
            if (this.hp < regenCap) {
                const regenRate = this.aiConfig.common?.hpRegenRate ?? 0.01;
                const regenAmount = (this.maxHp * regenRate) * (adjustedDelta / 1000);
                
                this.hp = Math.min(this.hp + regenAmount, regenCap);
                
                if (Math.abs(this.hp - (this.lastDrawnHpPct * this.maxHp)) > 1) {
                    this.redrawHpBar();
                }
            }
        }

        if (this.scene.isSetupPhase) { this.setVelocity(0, 0); return; }
        this.enforceWorldBounds();
        if (this.scene.isGameOver) { this.setVelocity(0, 0); if (this.anims.isPlaying) this.stop(); return; }

        if (!this.isAvoiding) {
            this.wallFreeTimer += adjustedDelta;
            if (this.wallFreeTimer > 1000) this.savedAvoidDir = null;
        }

        if (this.isAvoiding) {
            this.updateAvoidance(adjustedDelta);
            this.updateAnimation();
            return; 
        }

        if (this.fleeTimer > 0) this.fleeTimer -= adjustedDelta;

        if (this.isLeader) {
            this.updatePlayerMovement(); 
            const isMovingManually = (this.body.velocity.x !== 0 || this.body.velocity.y !== 0);
            if (!isMovingManually && this.scene.isAutoBattle && this.scene.battleStarted) {
                this.updateAI(adjustedDelta);
            }
        } else {
            if (!this.scene.battleStarted) {
                this.updateFormationFollow(adjustedDelta); 
            } else if (this.team === 'blue') {
                if (this.isLowHpFleeing) {
                    this.updateAI(adjustedDelta); 
                } else {
                    switch (this.scene.squadState) {
                        case 'FORMATION': this.updateFormationFollow(adjustedDelta); break;
                        case 'FLEE': this.runAway(adjustedDelta); break;
                        case 'FREE': default: this.updateAI(adjustedDelta); break;
                    }
                }
            } else {
                this.updateAI(adjustedDelta); 
            }
        }
        this.updateAnimation();
    }

    // --- AI Methods (Optimized) ---

    isTargeted() {
        if (!this.targetGroup) return false;
        const enemies = this.targetGroup.getChildren(); 
        for (const enemy of enemies) {
            if (enemy.active && enemy.currentTarget === this) {
                return true;
            }
        }
        return false;
    }

    checkLineOfSight() {
        if (!this.currentTarget || !this.currentTarget.active) return true;
        
        const now = this.scene.time.now;
        if (now < this.losCheckTimer) {
            return this.lastLosResult;
        }
        this.losCheckTimer = now + 150; 

        const wallLayer = this.scene.wallLayer; 
        const blockLayer = this.scene.blockLayer;

        if (!wallLayer) {
            this.lastLosResult = true;
            return true;
        }

        this._tempStart.set(this.x, this.y);
        this._tempEnd.set(this.currentTarget.x, this.currentTarget.y);
        
        const distance = this._tempStart.distance(this._tempEnd);
        const stepSize = 35; 
        const steps = Math.ceil(distance / stepSize);
        
        for (let i = 1; i < steps; i++) { 
            const t = i / steps;
            const cx = this._tempStart.x + (this._tempEnd.x - this._tempStart.x) * t;
            const cy = this._tempStart.y + (this._tempEnd.y - this._tempStart.y) * t;
            
            const tile = wallLayer.getTileAtWorldXY(cx, cy);
            if (tile && tile.canCollide) {
                this.lastLosResult = false;
                return false; 
            }
            
            if (blockLayer) {
                const block = blockLayer.getTileAtWorldXY(cx, cy);
                if (block && block.canCollide) {
                    this.lastLosResult = false;
                    return false;
                }
            }
        }
        
        this.lastLosResult = true;
        return true; 
    }

    calculateWallAvoidDir() {
        const blocked = this.body.blocked;
        const touching = this.body.touching; 
        
        let tx = 0, ty = 0;
        if (this.currentTarget && this.currentTarget.active) {
            tx = this.currentTarget.x;
            ty = this.currentTarget.y;
        } else {
            tx = this.x + 100; 
            ty = this.y;
        }

        this._tempDir.set(0, 0);

        if (blocked.left || blocked.right || touching.left || touching.right) {
            const dirY = (ty > this.y) ? 1 : -1;
            this._tempDir.set(0, dirY);
        } else if (blocked.up || blocked.down || touching.up || touching.down) {
            const dirX = (tx > this.x) ? 1 : -1;
            this._tempDir.set(dirX, 0);
        } else {
            const diffX = Math.abs(tx - this.x);
            const diffY = Math.abs(ty - this.y);
            
            if (diffX > diffY) {
                const dirY = (ty > this.y) ? 1 : -1;
                this._tempDir.set(0, dirY);
            } else {
                const dirX = (tx > this.x) ? 1 : -1;
                this._tempDir.set(dirX, 0);
            }
        }
        
        return this._tempDir.normalize();
    }

    handleWallCollision(tile) {
        this.wallFreeTimer = 0;

        if (this.isAvoiding) {
            const blocked = this.body.blocked;
            const isBlocked = (this.avoidDir.x > 0 && blocked.right) || (this.avoidDir.x < 0 && blocked.left) || 
                              (this.avoidDir.y > 0 && blocked.down) || (this.avoidDir.y < 0 && blocked.up);
            
            if (isBlocked) {
                this.avoidDir.negate();
                if (this.savedAvoidDir) this.savedAvoidDir.copy(this.avoidDir);
            }
            this.avoidTimer = 500; 
            return;
        }

        if (this.checkLineOfSight()) {
            return;
        }

        this.isAvoiding = true;
        this.avoidTimer = 500; 
        this.setVelocity(0, 0);

        let useSavedDir = false;
        if (this.savedAvoidDir) {
            const blocked = this.body.blocked;
            const isBlocked = (this.savedAvoidDir.x > 0 && blocked.right) || (this.savedAvoidDir.x < 0 && blocked.left) || 
                              (this.savedAvoidDir.y > 0 && blocked.down) || (this.savedAvoidDir.y < 0 && blocked.up);
            
            if (!isBlocked) {
                this.avoidDir.copy(this.savedAvoidDir);
                useSavedDir = true;
            }
        }

        if (!useSavedDir) {
            const newDir = this.calculateWallAvoidDir();
            this.avoidDir.copy(newDir);
            if (!this.savedAvoidDir) {
                this.savedAvoidDir = new Phaser.Math.Vector2(newDir.x, newDir.y);
            } else {
                this.savedAvoidDir.set(newDir.x, newDir.y);
            }
        }
    }

    updateAvoidance(delta) {
        this.setVelocity(this.avoidDir.x * this.moveSpeed, this.avoidDir.y * this.moveSpeed);
        this.updateFlipX();
        this.avoidTimer -= delta;
        if (this.avoidTimer <= 0) this.isAvoiding = false;
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
            if (this.isTargeted()) {
                this.runAway(delta);
            } else {
                this.setVelocity(0, 0); 
                this.updateFlipX(); 
            }
            return; 
        }

        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 100 + Math.random() * 100;
            if (!this.currentTarget || !this.currentTarget.active) this.currentTarget = this.findNearestEnemy();
        }
        if (this.currentTarget && this.currentTarget.active) {
            if (this.isAvoiding) return;
            const dist = Phaser.Math.Distance.Between(this.x, this.y, this.currentTarget.x, this.currentTarget.y);
            const roleKey = this.role.toLowerCase();
            const aiParams = this.aiConfig[roleKey] || {};
            if (this.role === 'Shooter') {
                const kiteDist = aiParams.kiteDistance || 200;
                const attackDist = aiParams.attackRange || 250;
                if (dist < kiteDist) {
                    const angle = Phaser.Math.Angle.Between(this.currentTarget.x, this.currentTarget.y, this.x, this.y);
                    this.scene.physics.velocityFromRotation(angle, -this.moveSpeed, this.body.velocity);
                    this.updateFlipX();
                } else if (dist > attackDist) {
                    this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
                    this.updateFlipX();
                } else { this.setVelocity(0, 0); }
            } else {
                this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
                this.updateFlipX();
            }
        } else { this.setVelocity(0, 0); }
        
        if (this.team !== 'blue' || this.scene.isAutoBattle) this.tryUseSkill();
    }
    
    findNearestEnemy() {
        let closestDistSq = Infinity; let closestTarget = null;
        const enemies = this.targetGroup.getChildren();
        for (let enemy of enemies) {
            if (enemy.active && enemy.role !== 'Healer') {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq < closestDistSq) { closestDistSq = distSq; closestTarget = enemy; }
            }
        }
        if (!closestTarget) {
            for (let enemy of enemies) {
                if (enemy.active) {
                    const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                    if (distSq < closestDistSq) { closestDistSq = distSq; closestTarget = enemy; }
                }
            }
        }
        return closestTarget;
    }
    findLowestHpAlly() {
        const allies = (this.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        let lowestHpVal = Infinity; let target = null;
        for (let ally of allies) {
            if (ally.active && ally !== this && ally.hp < ally.maxHp) {
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
        if (this.thinkTimer <= 0) { this.thinkTimer = 100 + Math.random() * 100; this.currentTarget = this.findNearestEnemy(); }
        
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
        if (!this.currentTarget || !this.currentTarget.active) this.currentTarget = this.findNearestEnemy();
        if (this.currentTarget && this.currentTarget.active) {
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
            if (enemy.active && Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y) < range * range) {
                enemy.takeDamage(this.attackPower * 2); 
            }
        });
        this.scene.time.delayedCall(500, () => {
            if(this.active) {
                this.isUsingSkill = false;
                this.resetVisuals();
            }
        });
    }

    takeDamage(amount) {
        if (!this.scene.battleStarted) return;
        this.hp -= amount;
        this.onTakeDamage(); 
        
        this.isTakingDamage = true;
        this.setFrame(FRAME_HIT);
        
        this.resetVisuals();
        this.scene.tweens.killTweensOf(this);
        const popSize = this.baseSize * 1.2;
        this.scene.tweens.add({
            targets: this, displayWidth: popSize, displayHeight: popSize, duration: 50, yoyo: true, ease: 'Quad.easeOut',
            onComplete: () => { if (this.active) this.resetVisuals(); }
        });
        this.scene.time.delayedCall(500, () => {
            if (this.active && this.hp > 0) {
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
        
        // [Optimization] 마지막으로 그린 값 저장 (Update에서 비교용)
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
        let hpColor = "#ffffff";

        if (this.isAvoiding) {
            statusStr = "⚠️AVOID";
            color = "#ffff00"; 
        } else if (this.isLowHpFleeing) {
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
        if (hpPct < 20) hpColor = "#ff0000";
        else if (hpPct < 50) hpColor = "#ffff00";

        this.debugText.setText(`${statusStr}\nHP:${hpPct}%`);
        this.debugText.setColor(color);
        
        if (this.currentTarget && this.currentTarget.active) {
            this.debugGraphic.lineStyle(1, 0xff0000, 0.5);
            this.debugGraphic.lineBetween(this.x, this.y, this.currentTarget.x, this.currentTarget.y);
        }
        
        if (this.isAvoiding) {
            this.debugGraphic.lineStyle(2, 0xffff00, 1);
            this.debugGraphic.beginPath();
            this.debugGraphic.moveTo(this.x, this.y);
            this.debugGraphic.lineTo(this.x + this.avoidDir.x * 50, this.y + this.avoidDir.y * 50);
            this.debugGraphic.strokePath();
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
            onComplete: () => { if (this.active) this.resetVisuals(); }
        });
        this.scene.time.delayedCall(300, () => {
            if(this.active) {
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