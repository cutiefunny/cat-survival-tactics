import Phaser from 'phaser';

export default class Unit extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader = false) {
        super(scene, x, y, texture);

        this.scene = scene;
        this.team = team;
        this.targetGroup = targetGroup;
        this.isLeader = isLeader;
        
        // [설정] 기본 스탯 설정 (자식 클래스에서 오버라이딩 가능)
        this.role = stats.role || 'Unknown';
        this.baseSize = (this.role === 'Tanker') ? 60 : 50;
        this.maxHp = stats.hp;
        this.hp = this.maxHp;
        this.attackPower = stats.attackPower;
        this.moveSpeed = stats.moveSpeed;
        this.attackRange = stats.attackRange || 50;
        this.aiConfig = stats.aiConfig || {}; // AI 개별 설정

        this.formationOffset = { x: 0, y: 0 };
        this.attackCooldown = 500;
        this.lastAttackTime = 0;
        
        this.thinkTimer = 0; // AI 생각 주기
        this.fleeTimer = 0;
        this.currentTarget = null;
        this._tempVec = new Phaser.Math.Vector2();

        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.setCollideWorldBounds(true);
        this.setBounce(0.2);
        this.setDrag(200);

        // [Visual] 초기화
        this.initVisuals();
        this.hpBar = scene.add.graphics();
        this.roleText = scene.add.text(x, y, this.role, { 
            fontSize: '11px', fill: '#ffffff', stroke: '#000000', strokeThickness: 2, fontFamily: 'monospace'
        }).setOrigin(0.5);
    }

    initVisuals() {
        if (this.team === 'blue') {
            this.play('cat_walk');
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
    }

    update(time, delta) {
        if (!this.active) return;
        this.updateUI();

        if (this.scene.isGameOver) {
            this.setVelocity(0, 0);
            if (this.anims.isPlaying) this.stop();
            return;
        }

        if (this.fleeTimer > 0) this.fleeTimer -= delta;

        // 리더(플레이어)는 키보드 조작
        if (this.isLeader) {
            this.updatePlayerMovement();
        } 
        // 나머지는 AI 동작
        else if (this.scene.battleStarted) {
            this.updateAI(delta);
        } 
        // 대기 상태 (포메이션 유지)
        else {
            this.updateFormationFollow();
        }
        
        this.updateAnimation();
    }

    // [AI] 자식 클래스에서 오버라이드할 메서드 (기본 동작: 가까운 적 돌진)
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
    }

    // --- 공통 Helper 함수들 (기존 UnitAI.js에서 이동) ---

    findNearestEnemy() {
        let closestDist = Infinity;
        let closestTarget = null;
        const enemies = this.targetGroup.getChildren();
        for (let enemy of enemies) {
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq < closestDist) { closestDist = distSq; closestTarget = enemy; }
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
        // 아군(자신 제외)과 교전 중인 적 찾기
        const myGroup = (this.team === 'blue') ? this.scene.blueTeam : this.scene.redTeam;
        const allies = myGroup.getChildren();
        const enemies = this.targetGroup.getChildren();
        
        for (let enemy of enemies) {
            if (!enemy.active) continue;
            for (let ally of allies) {
                if (!ally.active || ally === this) continue;
                if (Phaser.Math.Distance.Squared(enemy.x, enemy.y, ally.x, ally.y) < 10000) {
                    return enemy;
                }
            }
        }
        return null;
    }

    runTowardsSafety() {
        // Separation 로직 (적과 아군 피하기)
        let forceX = 0, forceY = 0;
        
        // 적 회피
        this.targetGroup.getChildren().forEach(enemy => {
            if (!enemy.active) return;
            const dist = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
            if (dist < 300) {
                const push = (300 - dist) / 300;
                const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.x, this.y);
                forceX += Math.cos(angle) * push * 2.0;
                forceY += Math.sin(angle) * push * 2.0;
            }
        });

        // 아군 길막 방지
        const myGroup = (this.team === 'blue') ? this.scene.blueTeam : this.scene.redTeam;
        myGroup.getChildren().forEach(ally => {
            if (!ally.active || ally === this) return;
            const dist = Phaser.Math.Distance.Between(this.x, this.y, ally.x, ally.y);
            if (dist < 80) {
                const push = (80 - dist) / 80;
                const angle = Phaser.Math.Angle.Between(ally.x, ally.y, this.x, this.y);
                forceX += Math.cos(angle) * push * 3.0;
                forceY += Math.sin(angle) * push * 3.0;
            }
        });

        if (Math.abs(forceX) > 0.1 || Math.abs(forceY) > 0.1) {
            const vec = new Phaser.Math.Vector2(forceX, forceY).normalize().scale(this.moveSpeed * 1.5);
            this.setVelocity(vec.x, vec.y);
            this.updateFlipX();
        } else {
            this.setVelocity(0, 0);
        }
    }

    updateFlipX() {
        const isBlue = this.team === 'blue';
        if (this.body.velocity.x < -5) this.setFlipX(isBlue ? false : true);
        else if (this.body.velocity.x > 5) this.setFlipX(isBlue ? true : false);
    }
    
    // --- 기타 유틸리티 (이동, 애니메이션, UI 등) ---

    updatePlayerMovement() {
        this.setVelocity(0);
        const cursors = this.scene.cursors;
        let vx = 0, vy = 0;
        if (cursors.left.isDown || this.scene.wasd.left.isDown) vx -= 1;
        if (cursors.right.isDown || this.scene.wasd.right.isDown) vx += 1;
        if (cursors.up.isDown || this.scene.wasd.up.isDown) vy -= 1;
        if (cursors.down.isDown || this.scene.wasd.down.isDown) vy += 1;

        if (vx !== 0 || vy !== 0) {
            this._tempVec.set(vx, vy).normalize().scale(this.moveSpeed);
            this.setVelocity(this._tempVec.x, this._tempVec.y);
            this.updateFlipX();
        }
    }

    updateFormationFollow() {
        if (this.team !== 'blue') { this.setVelocity(0); return; }
        const leader = this.scene.playerUnit;
        if (!leader || !leader.active) return;
        const tx = leader.x + this.formationOffset.x;
        const ty = leader.y + this.formationOffset.y;
        if (Phaser.Math.Distance.Between(this.x, this.y, tx, ty) > 5) {
            this.scene.physics.moveTo(this, tx, ty, this.moveSpeed);
            this.updateFlipX();
        } else {
            this.setVelocity(0);
        }
    }

    updateUI() {
        this.hpBar.setPosition(this.x, this.y - (this.baseSize / 2) + 20);
        if (this.roleText) this.roleText.setPosition(this.x, this.y + (this.baseSize / 2) + 12);
    }

    updateAnimation() {
        const isBusy = (this.isTakingDamage || this.isAttacking);
        if (!isBusy && this.body.velocity.length() > 5) {
            if (!this.anims.isPlaying) {
                if (this.team === 'blue') this.play('cat_walk', true);
                else this.play('dog_walk', true);
                this.resetVisuals();
            }
        }
    }

    takeDamage(amount) {
        if (!this.scene.battleStarted) return;
        this.hp -= amount;
        this.onTakeDamage(); // Hook for AI
        // (데미지 연출 코드는 생략, 기존과 동일)
        this.redrawHpBar();
        if (this.hp <= 0) this.die();
    }

    onTakeDamage() { 
        // 자식 클래스에서 구현
    }

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
        // (기존 Unit.js의 triggerAttackVisuals 내용 유지)
        if (this.team === 'blue' && !this.isTakingDamage) {
            this.isAttacking = true;
            this.setTexture('cat_punch');
            this.resetVisuals();
            // ...Tween 등 ...
            this.scene.time.delayedCall(300, () => {
                if(this.active) {
                    this.isAttacking = false;
                    this.setTexture('blueCat');
                    this.play('cat_walk');
                    this.resetVisuals();
                    if(this.isLeader) this.setTint(0xffffaa);
                    else if(this.role === 'Shooter') this.setTint(0xff88ff);
                }
            });
        }
    }

    die() {
        this.hpBar.destroy();
        if(this.roleText) this.roleText.destroy();
        this.destroy();
    }

    setFormationOffset(lx, ly) {
        this.formationOffset.x = this.x - lx;
        this.formationOffset.y = this.y - ly;
    }
}