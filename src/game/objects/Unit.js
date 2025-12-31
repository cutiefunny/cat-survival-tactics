import Phaser from 'phaser';

// [Role Visuals] 역할별 비주얼 설정 매핑
const ROLE_VISUALS = {
    'Tanker': { 
        idle: 'tanker_idle', walkAnim: 'tanker_walk_anim', attack: 'tanker_haak', hit: 'tanker_hit',
        useFrameForIdle: false 
    },
    'Shooter': { 
        idle: 'shooter_idle', walkAnim: 'shooter_walk_anim', attack: 'shooter_shot', hit: 'shooter_hit',
        useFrameForIdle: false 
    },
    'Runner': { 
        idle: 'runner_idle', walkAnim: 'runner_walk_anim', attack: 'runner_attack', hit: 'runner_hit',
        useFrameForIdle: false 
    },
    'Dealer': { 
        idle: 'blueCat', walkAnim: 'cat_walk', attack: 'cat_punch', hit: 'cat_hit',
        useFrameForIdle: true 
    },
    'Leader': { 
        idle: 'blueCat', walkAnim: 'cat_walk', attack: 'cat_punch', hit: 'cat_hit',
        useFrameForIdle: true 
    },
    'Normal': { 
        idle: 'blueCat', walkAnim: 'cat_walk', attack: 'cat_punch', hit: 'cat_hit',
        useFrameForIdle: true 
    },
    'NormalDog': { 
        idle: 'redDog', walkAnim: 'dog_walk', attack: null, hit: null, 
        useFrameForIdle: true 
    }
};

export default class Unit extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader = false) {
        super(scene, x, y, texture);

        this.scene = scene;
        this.team = team;
        this.targetGroup = targetGroup;
        this.isLeader = isLeader;
        
        this.role = stats.role || 'Unknown';
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

        this.attackCooldown = stats.attackCooldown || 500;
        this.lastAttackTime = 0;
        
        this.skillMaxCooldown = stats.skillCooldown || 0; 
        this.skillRange = stats.skillRange || 0;
        this.skillDuration = stats.skillDuration || 0;
        this.skillEffect = stats.skillEffect || 0; 

        this.skillTimer = 0;
        this.isUsingSkill = false;
        
        this.thinkTimer = Math.random() * 200; 
        this.fleeTimer = 0;
        this.currentTarget = null;
        
        // [Optimization]
        this._tempVec = new Phaser.Math.Vector2();
        this._tempStart = new Phaser.Math.Vector2();
        this._tempEnd = new Phaser.Math.Vector2();

        // [Avoidance System]
        this.isAvoiding = false;
        this.avoidTimer = 0;
        this.avoidDir = new Phaser.Math.Vector2();
        
        // [Persistence]
        this.savedAvoidDir = null; 
        this.wallFreeTimer = 0;

        // [LOS Optimization]
        this.losCheckTimer = 0; 
        this.lastLosResult = true;

        // [Debug]
        this.debugText = scene.add.text(x, y, '', { 
            font: '10px monospace', fill: '#ffffff', backgroundColor: '#000000aa', padding: { x: 2, y: 2 }, align: 'center'
        }).setOrigin(0.5, 1.3).setDepth(9999).setVisible(false);
        this.debugGraphic = scene.add.graphics().setDepth(9999).setVisible(false);
        
        this.visualConfig = ROLE_VISUALS[this.role] || ROLE_VISUALS['Normal'];
        if (this.team === 'red') {
            this.visualConfig = ROLE_VISUALS['NormalDog'];
        }

        scene.add.existing(this);
        scene.physics.add.existing(this);
        
        this.setCollideWorldBounds(true);
        this.setBounce(0.2);
        this.setDrag(200);

        this.hpBar = scene.add.graphics().setDepth(100);
        this.initVisuals();

        this.on('pointerdown', () => {
            if (this.team === 'blue') {
                if (this.scene.battleStarted) {
                    this.scene.selectPlayerUnit(this);
                } 
            }
        });
    }

    die() {
        if (this.debugText) this.debugText.destroy();
        if (this.debugGraphic) this.debugGraphic.destroy();
        if (this.hpBar) this.hpBar.destroy();
        this.destroy();
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

    tryUseSkill() {
        if (this.skillTimer <= 0 && this.skillMaxCooldown > 0) {
            this.performSkill(); 
            this.skillTimer = this.skillMaxCooldown;
            this.setTint(0xffffff);
        }
    }

    performSkill() {
        this.setTint(0x00ffff);
        this.isUsingSkill = true;
        
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

    initVisuals() {
        if (this.visualConfig.useFrameForIdle) {
            this.play(this.visualConfig.walkAnim);
        } else {
            this.setTexture(this.visualConfig.idle);
        }

        if (this.team === 'blue') {
            this.setFlipX(true);
            if (this.isLeader) this.setTint(0xffffaa);
        } else {
            this.play('dog_walk');
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
            const radius = this.baseSize / 2;
            this.body.setCircle(radius, 0, 0); 
        }
        
        if (this.team === 'blue') {
            if (this.isLeader) this.setTint(0xffffaa);
            else this.clearTint(); 
        } else {
            if (this.isLeader) this.setTint(0xffff00);
            else this.clearTint();
        }

        if (!this.anims.isPlaying && !this.isUsingSkill && !this.isAttacking) {
             if (!this.visualConfig.useFrameForIdle) {
                 this.setTexture(this.visualConfig.idle);
             }
        }
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

    // [Step 1] 방향 판단 로직 (Blocked Flag 기반)
    calculateWallAvoidDir() {
        const blocked = this.body.blocked;
        const touching = this.body.touching; // 혹시 blocked가 false일 경우 대비
        
        // 타겟 방향 (참고용)
        let tx = 0, ty = 0;
        if (this.currentTarget && this.currentTarget.active) {
            tx = this.currentTarget.x;
            ty = this.currentTarget.y;
        } else {
            tx = this.x + 100; // 타겟 없으면 오른쪽 가정
            ty = this.y;
        }

        const newDir = new Phaser.Math.Vector2();

        // 1. 수직 벽 충돌 (왼쪽 or 오른쪽 막힘) -> 수직 이동 (위 or 아래)
        if (blocked.left || blocked.right || touching.left || touching.right) {
            // 타겟이 있는 Y쪽으로 이동
            const dirY = (ty > this.y) ? 1 : -1;
            newDir.set(0, dirY);
        }
        // 2. 수평 벽 충돌 (위 or 아래 막힘) -> 수평 이동 (왼쪽 or 오른쪽)
        else if (blocked.up || blocked.down || touching.up || touching.down) {
            // 타겟이 있는 X쪽으로 이동
            const dirX = (tx > this.x) ? 1 : -1;
            newDir.set(dirX, 0);
        }
        // 3. 모호한 경우 (속도가 0이라 blocked가 안 뜰 때)
        else {
            // 타겟과의 거리를 기준으로 판단 (X거리가 멀면 Y로 회피, Y거리가 멀면 X로 회피 시도)
            const diffX = Math.abs(tx - this.x);
            const diffY = Math.abs(ty - this.y);
            
            if (diffX > diffY) {
                // X축 이동을 원하는데 막힌거라면 -> Y축 회피
                const dirY = (ty > this.y) ? 1 : -1;
                newDir.set(0, dirY);
            } else {
                const dirX = (tx > this.x) ? 1 : -1;
                newDir.set(dirX, 0);
            }
        }
        
        return newDir.normalize();
    }

    handleWallCollision(tile) {
        this.wallFreeTimer = 0;

        // 1. 이미 회피 중 (Step 4 Check)
        if (this.isAvoiding) {
            // [방향 유지] 물리적으로 막힌 게 아니라면 방향 유지
            const blocked = this.body.blocked;
            const dir = this.avoidDir;
            
            // 내가 가려는 방향이 막혔는지 확인
            const isBlocked = (dir.x > 0 && blocked.right) || (dir.x < 0 && blocked.left) || 
                              (dir.y > 0 && blocked.down) || (dir.y < 0 && blocked.up);
            
            if (isBlocked) {
                // 막혔으면 반대 방향으로 전환
                this.avoidDir.negate();
                // 저장된 방향도 업데이트
                if (this.savedAvoidDir) this.savedAvoidDir.copy(this.avoidDir);
            }

            this.avoidTimer = 500; 
            return;
        }

        // 2. 회피 시작 전 시야 체크 (벽 없으면 직진)
        if (this.checkLineOfSight()) {
            return;
        }

        // 3. 새로운 회피 시작
        this.isAvoiding = true;
        this.avoidTimer = 500; 
        this.setVelocity(0, 0);

        // 4. 방향 결정 (이전 방향 재사용 우선)
        let useSavedDir = false;
        if (this.savedAvoidDir) {
            const blocked = this.body.blocked;
            const dir = this.savedAvoidDir;
            // 저장된 방향도 지금 막혀있나?
            const isBlocked = (dir.x > 0 && blocked.right) || (dir.x < 0 && blocked.left) || 
                              (dir.y > 0 && blocked.down) || (dir.y < 0 && blocked.up);
            
            if (!isBlocked) {
                this.avoidDir.copy(this.savedAvoidDir);
                useSavedDir = true;
            }
        }

        // 5. 저장된 방향 없으면 새로 계산 (Blocked 정보 기반)
        if (!useSavedDir) {
            const newDir = this.calculateWallAvoidDir();
            this.avoidDir.copy(newDir);
            this.savedAvoidDir = new Phaser.Math.Vector2(newDir.x, newDir.y);
        }
    }

    update(time, delta) {
        if (!this.active) return;
        this.updateUI();

        const isDebugMode = this.scene.uiManager && (this.scene.uiManager.debugStats || this.scene.uiManager.debugText);
        if (isDebugMode) this.updateDebugVisuals();
        else { this.debugText.setVisible(false); this.debugGraphic.setVisible(false); }

        const adjustedDelta = delta * (this.scene.gameSpeed || 1);

        if (this.skillTimer > 0) this.skillTimer -= adjustedDelta;

        if (this.scene.isSetupPhase) {
            this.setVelocity(0, 0);
            return;
        }

        this.enforceWorldBounds();

        if (this.scene.isGameOver) {
            this.setVelocity(0, 0);
            if (this.anims.isPlaying) this.stop();
            return;
        }

        // [Wall Memory Reset] 1초 이상 벽과 충돌 없으면 기억 삭제
        if (!this.isAvoiding) {
            this.wallFreeTimer += adjustedDelta;
            if (this.wallFreeTimer > 1000) {
                this.savedAvoidDir = null;
            }
        }

        // [Priority: Step 2 & 4] 회피 기동
        if (this.isAvoiding) {
            this.updateAvoidance(adjustedDelta);
            this.updateAnimation();
            return; 
        }

        // [Step 3] 원래 진행 방향 이동 (Normal AI)
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
                switch (this.scene.squadState) {
                    case 'FORMATION':
                        this.updateFormationFollow(adjustedDelta); 
                        break;
                    case 'FLEE':
                        this.runAway(adjustedDelta); 
                        break;
                    case 'FREE':
                    default:
                        this.updateAI(adjustedDelta); 
                        break;
                }
            } else {
                this.updateAI(adjustedDelta); 
            }
        }
        
        this.updateAnimation();
    }

    updateAvoidance(delta) {
        this.setVelocity(this.avoidDir.x * this.moveSpeed, this.avoidDir.y * this.moveSpeed);
        this.updateFlipX();

        this.avoidTimer -= delta;
        if (this.avoidTimer <= 0) {
            this.isAvoiding = false;
        }
    }

    updateUI() {
        if (this.hpBar) {
            this.hpBar.setPosition(this.x, this.y - (this.baseSize / 2) + 20);
        }
    }

    updateDebugVisuals() {
        this.debugText.setVisible(true);
        this.debugGraphic.setVisible(true);
        this.debugGraphic.clear();

        this.debugText.setPosition(this.x, this.y - (this.baseSize / 2) - 15);

        if (this.isAvoiding) {
            const vecStr = `(${this.avoidDir.x.toFixed(0)},${this.avoidDir.y.toFixed(0)})`;
            this.debugText.setText(`⚠️SIDE\n${this.avoidTimer.toFixed(0)}ms\nDir:${vecStr}`);
            this.debugText.setColor('#ffaa00'); 

            this.debugGraphic.lineStyle(2, 0xffaa00, 1);
            this.debugGraphic.beginPath();
            this.debugGraphic.moveTo(this.x, this.y);
            this.debugGraphic.lineTo(this.x + this.avoidDir.x * 50, this.y + this.avoidDir.y * 50);
            this.debugGraphic.strokePath();
        } else {
            const spd = this.body.velocity.length().toFixed(0);
            const mem = this.savedAvoidDir ? " [MEM]" : "";
            this.debugText.setText(`MOVE${mem}\nSpd:${spd}`);
            this.debugText.setColor('#33ff33'); 
            
            if (this.currentTarget && this.currentTarget.active) {
                this.debugGraphic.lineStyle(1, 0x00ff00, 0.5);
                this.debugGraphic.lineBetween(this.x, this.y, this.currentTarget.x, this.currentTarget.y);
            }
        }
    }

    runAway(delta) {
        if (!this.currentTarget || !this.currentTarget.active) {
            this.currentTarget = this.findNearestEnemy();
        }
        
        if (this.currentTarget && this.currentTarget.active) {
            const angle = Phaser.Math.Angle.Between(this.currentTarget.x, this.currentTarget.y, this.x, this.y); 
            const speed = this.moveSpeed * 1.2; 
            this.setVelocity(Math.cos(angle) * -speed, Math.sin(angle) * -speed);
            this.updateFlipX();
        } else {
            this.updateFormationFollow(delta);
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

    updateAI(delta) {
        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 100 + Math.random() * 100;
            if (!this.currentTarget || !this.currentTarget.active) {
                this.currentTarget = this.findNearestEnemy();
            }
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
                } else {
                    this.setVelocity(0, 0);
                }
            } else {
                this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
                this.updateFlipX();
            }
        } else {
            this.setVelocity(0, 0);
        }
        
        if (this.team !== 'blue' || this.scene.isAutoBattle) {
            this.tryUseSkill();
        }
    }

    findNearestEnemy() {
        let closestDistSq = Infinity;
        let closestTarget = null;
        const enemies = this.targetGroup.getChildren();
        for (let enemy of enemies) {
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq < closestDistSq) { closestDistSq = distSq; closestTarget = enemy; }
            }
        }
        return closestTarget;
    }

    findWeakestEnemy() {
        let minHp = Infinity;
        let target = null;
        const enemies = this.targetGroup.getChildren();
        for (let enemy of enemies) {
            if (enemy.active && enemy.hp > 0 && enemy.hp < minHp) {
                minHp = enemy.hp; target = enemy;
            }
        }
        return target;
    }

    findEnemyEngagingAlly() {
        const myGroup = (this.team === 'blue') ? this.scene.blueTeam : this.scene.redTeam;
        const allies = myGroup.getChildren();
        const enemies = this.targetGroup.getChildren();
        const engageDistSq = 10000; 
        
        for (let enemy of enemies) {
            if (!enemy.active) continue;
            for (let ally of allies) {
                if (!ally.active || ally === this) continue;
                if (Phaser.Math.Distance.Squared(enemy.x, enemy.y, ally.x, ally.y) < engageDistSq) {
                    return enemy;
                }
            }
        }
        return null;
    }

    updateFlipX() {
        const isBlue = this.team === 'blue';

        if (this.isAttacking && this.currentTarget && this.currentTarget.active) {
            const diffX = this.currentTarget.x - this.x;
            if (diffX > 0) this.setFlipX(isBlue ? true : false); 
            else if (diffX < 0) this.setFlipX(isBlue ? false : true); 
            return;
        }

        if (this.body.velocity.x < -5) this.setFlipX(isBlue ? false : true);
        else if (this.body.velocity.x > 5) this.setFlipX(isBlue ? true : false);
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

    updateFormationFollow(delta) {
        if (this.isLeader) return; 

        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 100 + Math.random() * 100;
            this.currentTarget = this.findNearestEnemy();
        }

        if (this.team !== 'blue' || this.scene.isAutoBattle) {
            this.tryUseSkill();
        }

        if (this.team !== 'blue') { this.setVelocity(0); return; }
        const leader = this.scene.playerUnit;
        if (!leader || !leader.active) return;
        const tx = leader.x + this.formationOffset.x;
        const ty = leader.y + this.formationOffset.y;
        
        if (Phaser.Math.Distance.Squared(this.x, this.y, tx, ty) > 25) {
            this.scene.physics.moveTo(this, tx, ty, this.moveSpeed);
            this.updateFlipX();
        } else {
            this.setVelocity(0);
        }
    }

    updateUI() {
        this.hpBar.setPosition(this.x, this.y - (this.baseSize / 2) + 20);
    }

    updateAnimation() {
        const isBusy = (this.isTakingDamage || this.isAttacking || this.isUsingSkill);
        
        if (!isBusy) {
            if (this.body.velocity.length() > 5) {
                if (!this.anims.isPlaying || this.anims.currentAnim.key !== this.visualConfig.walkAnim) {
                    this.play(this.visualConfig.walkAnim, true);
                    this.resetVisuals();
                }
            } else {
                if (this.visualConfig.useFrameForIdle) {
                    if (this.anims.isPlaying) this.stop();
                } else {
                    if (this.anims.isPlaying) {
                        this.stop();
                        this.setTexture(this.visualConfig.idle);
                        this.resetVisuals();
                    }
                }
            }
        }
    }

    takeDamage(amount) {
        if (!this.scene.battleStarted) return;
        this.hp -= amount;
        this.onTakeDamage(); 
        if (this.team === 'blue') {
            this.isTakingDamage = true;
            
            const hitTex = this.visualConfig.hit || 'cat_hit';
            this.setTexture(hitTex);
            
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

                    if (!this.visualConfig.useFrameForIdle) {
                        this.setTexture(this.visualConfig.idle);
                    } else {
                        this.play(this.visualConfig.walkAnim); 
                    }
                    this.resetVisuals();
                }
            });
        }
        this.redrawHpBar();
        if (this.hp <= 0) this.die();
    }

    onTakeDamage() {}

    redrawHpBar() {
        if (!this.hpBar) return;
        this.hpBar.clear();
        if (this.hp <= 0) return;
        const w = 32;
        const x = -w/2, y = -(this.baseSize/2)-10;
        this.hpBar.fillStyle(0x000000);
        this.hpBar.fillRect(x, y, w, 4);
        this.hpBar.fillStyle(this.hp/this.maxHp > 0.5 ? 0x00ff00 : 0xff0000);
        this.hpBar.fillRect(x, y, w * (this.hp/this.maxHp), 4);
    }

    triggerAttackVisuals() {
        if (this.team === 'blue') {
            this.isAttacking = true;
            
            const attackTex = this.visualConfig.attack || 'cat_punch';
            this.setTexture(attackTex);
            
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

                    if (!this.visualConfig.useFrameForIdle) {
                        this.setTexture(this.visualConfig.idle);
                    } else {
                        this.play(this.visualConfig.walkAnim);
                    }
                    this.resetVisuals();
                }
            });
        }
    }

    die() {
        if (this.debugText) this.debugText.destroy();
        if (this.debugGraphic) this.debugGraphic.destroy();
        if (this.hpBar) this.hpBar.destroy();
        this.destroy();
    }

    setFormationOffset(lx, ly) {
        this.formationOffset.x = this.x - lx;
        this.formationOffset.y = this.y - ly;
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