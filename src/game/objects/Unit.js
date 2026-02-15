import Phaser from 'phaser';
import { ROLE_TEXTURES } from '../data/UnitData'; 
import UnitAI from './UnitAI'; 

const FRAME_IDLE = 0;
const FRAME_ATTACK = 3;
const FRAME_HIT = 4;
const FRAME_SKILL = 5;

export default class Unit extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader = false) {
        const roleKey = stats.role || 'Normal';
        const assignedTexture = ROLE_TEXTURES[roleKey] || (team === 'red' ? 'dog' : 'leader');

        super(scene, x, y, assignedTexture);

        this.textureKey = assignedTexture;
        this.scene = scene;
        this.team = team;
        this.targetGroup = targetGroup;
        this.isLeader = isLeader;

        this.role = roleKey;
        let size = (this.role === 'Tanker') ? 60 : 50;
        if (this.role === 'EliteDog') {
            size *= 1.2; // [New] EliteDog는 NormalDog의 1.2배 크기
        }
        if (this.isLeader) {
            size *= 1.15; 
        }
        this.baseSize = size;

        // [Modified] HP 초기화 순서 및 maxHp 확보
        // stats.maxHp가 있으면 쓰고, 없으면 hp를 maxHp로 간주 (생성 시점 기준)
        this.maxHp = stats.maxHp || stats.hp || 100;
        this.hp = stats.hp !== undefined ? stats.hp : this.maxHp;

        // [Modified] 에너지(MP) 속성 초기화 개선
        // stats.maxEnergy가 없으면 maxHp를 따라가도록 변경 (기본값 100 대신)
        this.maxEnergy = stats.maxEnergy || this.maxHp || 100; 
        this.energy = (stats.energy !== undefined) ? stats.energy : 0; 

        this.baseAttackPower = stats.attackPower;
        this.attackPower = this.baseAttackPower;
        this.moveSpeed = stats.moveSpeed;
        
        this.defense = stats.defense || 0;
        this.killReward = stats.killReward || 10;
        this.missChance = (stats.missChance !== undefined) ? stats.missChance : 0.02;

        this.attackRange = stats.attackRange || 50;
        this.aiConfig = stats.aiConfig || {}; 

        this.formationOffset = { x: 0, y: 0 };
        this.savedRelativePos = { x: 0, y: 0 };

        this.lastValidPosition = { x: x, y: y };

        this.ai = new UnitAI(this);

        this.attackCooldown = stats.attackCooldown || 500;
        this.lastAttackTime = 0;

        this.skillMaxCooldown = stats.skillCooldown || 0;
        this.skillRange = stats.skillRange || 0;
        this.skillDuration = stats.skillDuration || 0;
        this.skillEffect = stats.skillEffect || 0;
        this.skillTimer = 0;
        this.isUsingSkill = false;

        this.isDying = false; 
        this.isAttacking = false;
        this.isTakingDamage = false;

        this._tempVec = new Phaser.Math.Vector2();

        this.debugText = null;
        this.debugGraphic = null;
        this.lastDrawnHpPct = 1;

        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.setCollideWorldBounds(true);
        this.setBounce(0); 
        this.setDrag(200);

        this.hpBar = scene.add.graphics().setDepth(100);
        this.initVisuals();

        this.on('pointerdown', () => {
            if (this.team === 'blue' && this.scene.battleStarted) {
                if (this.scene.playerUnit === this) {
                    this.tryUseSkill();
                } else {
                    this.scene.selectPlayerUnit(this);
                }
            }
        });
    }

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

        if (this.scene && typeof this.scene.handleUnitDeath === 'function') {
            this.scene.handleUnitDeath(this);
        }

        this.destroyDebugObjects();
        if (this.hpBar) this.hpBar.destroy();

        if (this.team === 'red' && this.scene && typeof this.scene.animateCoinDrop === 'function') {
            const dropAmount = this.killReward; 
            this.scene.animateCoinDrop(this.x, this.y, dropAmount);
        }

        if (this.scene && typeof this.scene.playDieSound === 'function') {
            this.scene.playDieSound();
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
        
        if (this.x < bounds.x + padding || this.x > bounds.right - padding ||
            this.y < bounds.y + padding || this.y > bounds.bottom - padding) {

            const clampedX = Phaser.Math.Clamp(this.x, bounds.x + padding, bounds.right - padding);
            const clampedY = Phaser.Math.Clamp(this.y, bounds.y + padding, bounds.bottom - padding);

            if (this.x !== clampedX || this.y !== clampedY) {
                this.x = clampedX;
                this.y = clampedY;
                this.setVelocity(0, 0);
            }
        }
    }

    validatePosition() {
        if (!this.active || !this.body) return;
        
        if (this.body.speed < 0.1) return;

        let isInvalid = false;
        if (this.scene.blockLayer) {
            const tile = this.scene.blockLayer.getTileAtWorldXY(this.x, this.y);
            if (tile && tile.canCollide) isInvalid = true;
        }
        if (!isInvalid && this.scene.blockObjectGroup) {
            if (this.scene.physics.overlap(this, this.scene.blockObjectGroup)) isInvalid = true;
        }
        if (!isInvalid && this.scene.wallObjectGroup) {
            if (this.scene.physics.overlap(this, this.scene.wallObjectGroup)) isInvalid = true;
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
        
        const adjustedDelta = delta * (this.scene.gameSpeed || 1);
        const isMoving = this.body.speed > 0.1;

        if (isMoving) {
            this.validatePosition();
            this.enforceWorldBounds();
        }

        this.updateUI();

        if (this.scene.uiManager && this.scene.uiManager.isDebugEnabled) {
            this.handleDebugUpdates(delta);
        } else if (this.debugText) {
            this.destroyDebugObjects();
        }

        if (this.skillTimer > 0) this.skillTimer -= adjustedDelta;

        if (!isMoving && this.hp < this.maxHp * 0.5 && !this.isTakingDamage && !this.isAttacking && !this.ai.isReturning) {
            this.handleRegen(adjustedDelta);
        }

        if (this.scene.isSetupPhase) { 
            if (isMoving) this.setVelocity(0, 0); 
            return; 
        }
        
        if (this.scene.isGameOver) { 
            if (isMoving) this.setVelocity(0, 0); 
            if (this.anims.isPlaying) this.stop(); 
            return; 
        }

        if (this.ai.fleeTimer > 0) this.ai.fleeTimer -= adjustedDelta;

        if (this.isLeader) {
            this.updatePlayerLogic(adjustedDelta);
        } else {
            this.updateNpcLogic(adjustedDelta);
        }
        
        this.updateAnimation();
    }

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
                    case 'FORMATION': 
                        this.ai.followLeader(); 
                        break;
                    case 'HOLD': 
                        this.setVelocity(0, 0);
                        if (this.anims.isPlaying && this.anims.currentAnim.key.includes('walk')) {
                            this.stop();
                            this.setFrame(0);
                        }
                        break;
                    case 'FREE': 
                    default: 
                        this.updateAI(delta); 
                        break;
                }
            }
        } else {
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
        if (!isMovingManually && this.scene.isAutoBattle && this.scene.battleStarted) {
            this.updateAI(delta);
        }
    }

    isTargeted() {
        if (!this.targetGroup) return false;
        return this.targetGroup.getChildren().some(enemy => enemy.active && enemy.ai && enemy.ai.currentTarget === this);
    }

    handleWallCollision(tile) {
        if (this.ai && typeof this.ai.onWallCollision === 'function') {
            this.ai.onWallCollision(tile);
        }
        if (this.ai.currentPath.length > 0) {
            if (this.body.speed < 5) {
                this.ai.pathUpdateTimer -= 50; 
            }
        }
    }

    updatePlayerMovement() {
        this.setVelocity(0);
        if (!this.scene.cursors) return;
        
        const cursors = this.scene.cursors; 
        const joyCursors = this.scene.joystickCursors; 
        
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

        // [Modified] 버프 상태에 따른 틴트 우선 적용
        if (this.hasSpeedBuff) {
            this.setTint(0xff6666); // 약간 빨간색 (공격 속도 버프)
        } else if (this.team === 'blue') {
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
                enemy.takeDamage(this.attackPower * 2, this); 
            }
        });
        this.scene.time.delayedCall(500, () => {
            if(this.active && !this.isDying) { 
                this.isUsingSkill = false;
                this.resetVisuals();
            }
        });
    }

    takeDamage(amount, attacker = null) {
        if (!this.scene.battleStarted || this.isDying) return; 
        
        let damage = Math.max(1, amount - this.defense);
        if(damage <= 0) damage = 1;
        this.hp -= damage;

        if (this.ai && typeof this.ai.onDamage === 'function') {
            this.ai.onDamage(attacker);
        }

        this.onTakeDamage(); 

        if (this.scene && typeof this.scene.playHitSound === 'function') {
            this.scene.playHitSound();
        }

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

    // [New] 광선을 쏘아 장애물과의 교차점을 찾는 메서드
    castVisionRay(angle, radius) {
        const startPoint = new Phaser.Math.Vector2(this.x, this.y);
        const endPoint = new Phaser.Math.Vector2(
            this.x + Math.cos(angle) * radius,
            this.y + Math.sin(angle) * radius
        );
        
        let closestIntersection = endPoint;
        let minDistanceSq = radius * radius;
        
        const rayLine = new Phaser.Geom.Line(startPoint.x, startPoint.y, endPoint.x, endPoint.y);
        
        // 1. Check Block Objects (High Precision - Raycasting)
        // 사용자가 요청한 'blocks object'는 blockObjectGroup을 의미함
        if (this.scene.blockObjectGroup) {
            const blocks = this.scene.blockObjectGroup.getChildren();
            const tempRect = new Phaser.Geom.Rectangle();
            
            for (const block of blocks) {
                // 최적화: 너무 먼 블록은 스킵 (반경 + 블록크기 체크)
                if (Phaser.Math.Distance.Squared(this.x, this.y, block.x, block.y) > (radius + block.width)**2) continue;

                // getBounds를 통해 월드 좌표 바운딩 박스 획득
                if (block.getBounds) {
                     block.getBounds(tempRect);
                } else {
                     continue;
                }

                // 선분과 사각형 교차 검사
                if (Phaser.Geom.Intersects.LineToRectangle(rayLine, tempRect)) {
                     const points = Phaser.Geom.Intersects.GetLineToRectangle(rayLine, tempRect);
                     // 교차점 중 가장 가까운 점 선택
                     for (const p of points) {
                         const dSq = Phaser.Math.Distance.Squared(this.x, this.y, p.x, p.y);
                         if (dSq < minDistanceSq) {
                             minDistanceSq = dSq;
                             closestIntersection = new Phaser.Math.Vector2(p.x, p.y);
                         }
                     }
                }
            }
        }
        
        // 2. Check Tile Layers (Step based)
        // 타일맵 레이어도 시야를 가린다면 체크 (스텝 방식)
        const wallLayer = this.scene.wallLayer;
        const blockLayer = this.scene.blockLayer;
        
        if (wallLayer || blockLayer) {
            const currentDist = Math.sqrt(minDistanceSq);
            const stepSize = 20; // 스텝 사이즈 (작을수록 정밀하지만 부하 증가)
            const steps = Math.ceil(currentDist / stepSize);

            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const checkX = startPoint.x + (closestIntersection.x - startPoint.x) * t;
                const checkY = startPoint.y + (closestIntersection.y - startPoint.y) * t;
                
                let hit = false;
                if (wallLayer && wallLayer.getTileAtWorldXY(checkX, checkY)?.canCollide) hit = true;
                if (!hit && blockLayer && blockLayer.getTileAtWorldXY(checkX, checkY)?.canCollide) hit = true;
                
                if (hit) {
                    closestIntersection = new Phaser.Math.Vector2(checkX, checkY);
                    break;
                }
            }
        }
        
        return closestIntersection;
    }

    updateDebugVisuals() {
        if (!this.debugText || !this.debugGraphic) return;

        this.debugText.setVisible(true);
        this.debugGraphic.setVisible(true);
        this.debugGraphic.clear();
        this.debugText.setPosition(this.x, this.y - (this.baseSize / 2) - 30);

        let statusStr = "COMBAT";
        let color = "#ffffff";
        
        if (this.ai && this.ai.isReturning) { 
            statusStr = "🏠RETURN";
            color = "#ffff00";
        } else if (this.ai && this.ai.isLowHpFleeing) {
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
        // [New] Debug text includes Energy (EP)
        const ep = (this.energy !== undefined) ? this.energy.toFixed(0) : '?';
        const maxEp = (this.maxEnergy !== undefined) ? this.maxEnergy : '?';

        this.debugText.setText(`${statusStr}\nHP:${hpPct}%\nEP:${ep}/${maxEp}`);
        this.debugText.setColor(color);

        // [Update] Draw Field of View with Raycasting (Shadow Casting)
        if (this.team === 'red' && this.ai && this.ai.viewDistance && this.ai.viewAngle) {
            const viewRadius = this.ai.viewDistance;
            const viewAngle = this.ai.viewAngle; // Radians
            
            // Direction: flipX=true(Right/0), flipX=false(Left/PI)
            const facingAngle = this.flipX ? 0 : Math.PI;
            const startAngle = facingAngle - (viewAngle / 2);
            // const endAngle = facingAngle + (viewAngle / 2); // Not directly used in loop
            
            const isCombat = this.ai.isCombatMode || this.ai.isProvoked;
            const fovColor = isCombat ? 0xff0000 : 0xffff00; 
            const fovAlpha = isCombat ? 0.05 : 0.15;

            // FOV Raycasting
            const rayCount = 40; // 레이 개수 (많을수록 부드럽지만 성능 부하)
            const points = [];
            points.push({ x: this.x, y: this.y }); // 시작점(중심)

            for (let i = 0; i <= rayCount; i++) {
                const rayAngle = startAngle + (viewAngle * (i / rayCount));
                const hitPoint = this.castVisionRay(rayAngle, viewRadius);
                points.push(hitPoint);
            }

            // Draw FOV Polygon
            this.debugGraphic.fillStyle(fovColor, fovAlpha);
            this.debugGraphic.fillPoints(points, true);
            this.debugGraphic.lineStyle(1, fovColor, 0.3);
            this.debugGraphic.strokePoints(points, true);
        }
        
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
            if (this.body.velocity.lengthSq() > 25) { 
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

    showEmote(text, color = '#ff0000') {
        if (!this.scene) return;

        const str = String(text);
        const isMiss = str.toUpperCase() === 'MISS';
        const targetScale = isMiss ? 0.5 : 1.5;
        const startScale = 0.5;

        const emote = this.scene.add.text(this.x, this.y - this.baseSize, str, {
            fontFamily: 'Arial',
            fontSize: '32px',
            fontStyle: 'bold',
            color: color,
            stroke: '#ffffff',
            strokeThickness: 4
        }).setOrigin(0.5);

        emote.setDepth(2000);
        emote.setScale(startScale);

        this.scene.tweens.add({
            targets: emote,
            y: this.y - this.baseSize - 40,
            alpha: 0,
            scale: targetScale,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => {
                emote.destroy();
            }
        });
    }
}