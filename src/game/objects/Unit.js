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
        // [New] 초기 배치 저장용 변수
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
        
        this._tempVec = new Phaser.Math.Vector2();
        
        this.visualConfig = ROLE_VISUALS[this.role] || ROLE_VISUALS['Normal'];
        if (this.team === 'red') {
            this.visualConfig = ROLE_VISUALS['NormalDog'];
        }

        scene.add.existing(this);
        scene.physics.add.existing(this);
        
        this.setCollideWorldBounds(true);
        this.setBounce(0.2);
        this.setDrag(200);

        this.initVisuals();
        this.hpBar = scene.add.graphics();

        this.on('pointerdown', () => {
            if (this.team === 'blue') {
                if (this.scene.battleStarted) {
                    this.scene.selectPlayerUnit(this);
                } 
                // [Fixed] 배치 단계(isSetupPhase)에서는 클릭 시 스킬 발동 방지 (드래그와 충돌 방지)
            }
        });
    }

    // 전투 시작 시 현재 위치를 초기 대형으로 저장
    saveFormationPosition(refX, refY) {
        this.savedRelativePos.x = this.x - refX;
        this.savedRelativePos.y = this.y - refY;
        // 초기 오프셋 바로 적용
        this.formationOffset.x = this.savedRelativePos.x;
        this.formationOffset.y = this.savedRelativePos.y;
    }

    // 리더가 변경되었을 때, 저장된 대형을 유지하도록 오프셋 재계산
    calculateFormationOffset(leaderUnit) {
        if (!leaderUnit || !leaderUnit.active) return;
        // 내 원래 상대 위치 - 새 리더의 원래 상대 위치 = 새 리더 기준 내 위치
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
        console.log(`${this.role} used skill!`);
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
    }

    resetVisuals() {
        this.scale = 1;
        this.setDisplaySize(this.baseSize, this.baseSize);
        if (this.body) this.body.setCircle(50, 0, 0);
        
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

    update(time, delta) {
        if (!this.active) return;
        this.updateUI();

        if (this.skillTimer > 0) {
            this.skillTimer -= delta;
        }

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

        if (this.fleeTimer > 0) this.fleeTimer -= delta;

        if (this.isLeader) {
            // [Leader]
            this.updatePlayerMovement(); 
            const isMovingManually = (this.body.velocity.x !== 0 || this.body.velocity.y !== 0);
            if (!isMovingManually && this.scene.isAutoBattle && this.scene.battleStarted) {
                this.updateAI(delta);
            }
        } else {
            // [Followers]
            if (!this.scene.battleStarted) {
                this.updateFormationFollow(delta); 
            } else if (this.team === 'blue') {
                switch (this.scene.squadState) {
                    case 'FORMATION':
                        this.updateFormationFollow(delta); 
                        break;
                    case 'FLEE':
                        this.runAway(delta);
                        break;
                    case 'FREE':
                    default:
                        this.updateAI(delta);
                        break;
                }
            } else {
                this.updateAI(delta);
            }
        }
        
        this.updateAnimation();
    }

    runAway(delta) {
        if (!this.currentTarget || !this.currentTarget.active) {
            this.currentTarget = this.findNearestEnemy();
        }
        
        if (this.currentTarget && this.currentTarget.active) {
            const angle = Phaser.Math.Angle.Between(this.currentTarget.x, this.currentTarget.y, this.x, this.y); 
            const speed = this.moveSpeed * 1.2; 
            this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
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
            this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
            this.updateFlipX();
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
        if (this.body.velocity.x < -5) this.setFlipX(isBlue ? false : true);
        else if (this.body.velocity.x > 5) this.setFlipX(isBlue ? true : false);
    }
    
    updatePlayerMovement() {
        this.setVelocity(0);
        const cursors = this.scene.cursors;
        const joyCursors = this.scene.joystickCursors;

        let vx = 0, vy = 0;
        
        if (cursors.left.isDown || this.scene.wasd.left.isDown || (joyCursors && joyCursors.left.isDown)) vx -= 1;
        if (cursors.right.isDown || this.scene.wasd.right.isDown || (joyCursors && joyCursors.right.isDown)) vx += 1;
        if (cursors.up.isDown || this.scene.wasd.up.isDown || (joyCursors && joyCursors.up.isDown)) vy -= 1;
        if (cursors.down.isDown || this.scene.wasd.down.isDown || (joyCursors && joyCursors.down.isDown)) vy += 1;

        if (vx !== 0 || vy !== 0) {
            this._tempVec.set(vx, vy).normalize().scale(this.moveSpeed);
            this.setVelocity(this._tempVec.x, this._tempVec.y);
            this.updateFlipX();
        }
    }

    updateFormationFollow(delta) {
        if (this.isLeader) return; 

        // 1. 타겟 갱신 (공격을 위해)
        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 100 + Math.random() * 100;
            this.currentTarget = this.findNearestEnemy();
        }

        // 2. 스킬 사용 (자동 전투 활성화 시)
        if (this.team !== 'blue' || this.scene.isAutoBattle) {
            this.tryUseSkill();
        }

        // 3. 이동 로직 (대열 유지)
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
            this.isAttacking = false;
            
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
        if (this.team === 'blue' && !this.isTakingDamage) {
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
        this.hpBar.destroy();
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