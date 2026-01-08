import Phaser from 'phaser';
import { ROLE_TEXTURES } from '../data/UnitData'; 
import UnitAI from './UnitAI'; 

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
        
        // [New] 방어력 추가 (기본값 0)
        this.defense = stats.defense || 0;
        
        // [New] 처치 보상 추가 (기본값 10)
        this.killReward = stats.killReward || 10;

        this.attackRange = stats.attackRange || 50;
        this.aiConfig = stats.aiConfig || {}; 

        this.formationOffset = { x: 0, y: 0 };
        this.savedRelativePos = { x: 0, y: 0 };

        // [Position Validation]
        this.lastValidPosition = { x: x, y: y };

        // [AI System Delegation]
        this.ai = new UnitAI(this);

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

        // [Aggro System]
        this.noCombatTimer = 0;

        // [Optimization]
        this._tempVec = new Phaser.Math.Vector2();

        // [Debug UI]
        this.debugText = null;
        this.debugGraphic = null;
        this.lastDrawnHpPct = 1;

        // [Physics Init]
        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.setCollideWorldBounds(true);
        this.setBounce(0); 
        this.setDrag(200);

        // [Components Init]
        this.hpBar = scene.add.graphics().setDepth(100);
        this.initVisuals();

        // [Interaction] 플레이어 선택 및 스킬 발동 (PC/Mobile 공통)
        this.on('pointerdown', () => {
            if (this.team === 'blue' && this.scene.battleStarted) {
                // 이미 선택된 유닛(PlayerUnit)을 다시 터치하면 스킬 발동
                if (this.scene.playerUnit === this) {
                    this.tryUseSkill();
                } else {
                    // 다른 유닛이라면 해당 유닛 선택
                    this.scene.selectPlayerUnit(this);
                }
            }
        });
    }

    // =================================================================
    // [Getter/Setter] CombatManager 등 외부 호환성 유지
    // =================================================================
    get currentTarget() {
        return this.ai ? this.ai.currentTarget : null;
    }

    set currentTarget(value) {
        if (this.ai) {
            this.ai.currentTarget = value;
        }
    }

    die() {
        if (this.isDying) return; 
        this.isDying = true;

        this.destroyDebugObjects();
        if (this.hpBar) this.hpBar.destroy();

        // [Modified] 적군(red) 사망 시 설정된 killReward 만큼 코인 드랍
        if (this.team === 'red' && this.scene && typeof this.scene.animateCoinDrop === 'function') {
            const dropAmount = this.killReward; 
            this.scene.animateCoinDrop(this.x, this.y, dropAmount);
        }

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
            if (tile && tile.canCollide) isInvalid = true;
        }
        if (!isInvalid && this.scene.blockObjectGroup) {
            if (this.scene.physics.overlap(this, this.scene.blockObjectGroup)) isInvalid = true;
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

        if (this.ai.fleeTimer > 0) this.ai.fleeTimer -= adjustedDelta;

        if (this.isLeader) {
            this.updatePlayerLogic(adjustedDelta);
        } else {
            this.updateNpcLogic(adjustedDelta);
        }
        
        this.updateAnimation();
    }

    // [Modified] NPC 로직 수정: 적군(Red)은 정찰(Roaming) 체크 후 AI 실행
    updateNpcLogic(delta) {
        if (!this.scene.battleStarted) {
            this.ai.followLeader();
            return;
        }

        if (this.team === 'blue') {
            if (this.ai.isLowHpFleeing) {
                this.updateAI(delta);
            } else {
                switch (this.scene.squadState) {
                    case 'FORMATION': this.ai.followLeader(); break;
                    case 'FLEE': this.ai.runAway(delta); break;
                    case 'FREE': default: this.updateAI(delta); break;
                }
            }
        } else {
            // [Red Team Logic]
            // updateRoaming이 true를 반환하면(전투 모드), 구체적인 전투 AI(updateAI)를 실행
            // false를 반환하면(정찰 모드), 전투 AI를 건너뜀 (배회 중)
            if (this.ai.updateRoaming(delta)) {
                this.updateAI(delta);
            }
        }
    }

    updateAI(delta) {
        this.ai.update(delta);
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
        // 수동 조작 중이 아닐 때만 AI 가동 (Auto Battle)
        if (!isMovingManually && this.scene.isAutoBattle && this.scene.battleStarted) {
            this.updateAI(delta);
        }
    }

    isTargeted() {
        if (!this.targetGroup) return false;
        return this.targetGroup.getChildren().some(enemy => enemy.active && enemy.ai && enemy.ai.currentTarget === this);
    }

    handleWallCollision(tile) {
        if (this.ai.currentPath.length > 0) {
            if (this.body.speed < 5) {
                this.ai.pathUpdateTimer -= 50; 
            }
        }
    }

    // [Modified] 모바일 가상 조이스틱 입력 처리 및 디버깅 로그 추가
    updatePlayerMovement() {
        this.setVelocity(0);
        if (!this.scene.cursors) return;
        
        const cursors = this.scene.cursors; 
        const joyCursors = this.scene.joystickCursors; // InputManager에서 연결된 가상 커서
        
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
        if (this.isDying) return;

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
        
        if (this.ai && this.ai.isLowHpFleeing) this.setTint(0xff5555);

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
        if (this.isDying) return; 

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
        
        // [New] 방어력 적용 (최소 1 데미지 보장)
        const damage = Math.max(1, amount - this.defense);
        
        this.hp -= damage;
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
        
        if (this.ai && this.ai.isLowHpFleeing) {
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
        
        if (this.ai && this.ai.currentTarget && this.ai.currentTarget.active) {
            this.debugGraphic.lineStyle(1, 0xff0000, 0.3);
            this.debugGraphic.lineBetween(this.x, this.y, this.ai.currentTarget.x, this.ai.currentTarget.y);
        }
        
        if (this.ai && this.ai.currentPath && this.ai.currentPath.length > 0) {
            const now = this.scene.time.now;
            const isFresh = (now - this.ai.lastPathCalcTime < 300); 
            
            const pathColor = isFresh ? 0x00ff00 : 0x00ffff; 
            const lineWidth = isFresh ? 4 : 2;
            const alpha = isFresh ? 0.9 : 0.5;

            this.debugGraphic.lineStyle(lineWidth, pathColor, alpha);
            this.debugGraphic.beginPath();
            this.debugGraphic.moveTo(this.x, this.y);
            this.ai.currentPath.forEach(pt => this.debugGraphic.lineTo(pt.x, pt.y));
            this.debugGraphic.strokePath();
            
            this.debugGraphic.fillStyle(pathColor, alpha);
            this.ai.currentPath.forEach(pt => {
                this.debugGraphic.fillCircle(pt.x, pt.y, 3);
            });
            
            if (isFresh) {
                 this.debugText.setText("⚡RECALC⚡\n" + this.debugText.text);
                 this.debugText.setColor("#00ff00");
            }
        }
    }

    updateFlipX() {
        if (this.isAttacking && this.ai.currentTarget && this.ai.currentTarget.active) {
            const diffX = this.ai.currentTarget.x - this.x;
            if (diffX > 0) this.setFlipX(true); 
            else if (diffX < 0) this.setFlipX(false); 
            return;
        }
        if (this.body.velocity.x < -5) this.setFlipX(false);
        else if (this.body.velocity.x > 5) this.setFlipX(true);
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
        if (this.isDying) return;

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
}