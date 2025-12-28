import Phaser from 'phaser';
import UnitAI from './UnitAI';

export default class Unit extends Phaser.Physics.Arcade.Sprite {
    // [CHANGE] aiConfig 인자 추가
    constructor(scene, x, y, texture, team, targetGroup, stats, aiConfig, isLeader = false) {
        super(scene, x, y, texture);

        this.scene = scene;
        this.team = team;
        this.targetGroup = targetGroup;
        this.isLeader = isLeader;
        this.role = stats.role || 'Unknown';
        this.baseSize = (this.role === 'Tanker') ? 60 : 50;

        this.maxHp = stats.hp;
        this.hp = this.maxHp;
        this.attackPower = stats.attackPower;
        this.moveSpeed = stats.moveSpeed;

        this.formationOffset = { x: 0, y: 0 };
        this.attackCooldown = 500;
        this.lastAttackTime = 0;

        this.isTakingDamage = false;
        this.isAttacking = false;
        this.damageTimer = null;
        this.attackTimer = null;
        this.fleeTimer = 0; 

        this.currentTarget = null;
        this._tempVec = new Phaser.Math.Vector2();

        // [CHANGE] AI 생성 시 설정값 전달
        this.ai = new UnitAI(this, aiConfig);

        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.setCollideWorldBounds(true);
        this.setBounce(0.2);
        this.setDrag(200);

        if (team === 'blue') {
            this.play('cat_walk');
            this.setFlipX(true);
            if (this.isLeader) this.setTint(0xffffaa);
        } else if (team === 'red') {
            this.play('dog_walk');
            this.setFlipX(false);
            if (this.isLeader) this.setTint(0xffff00);
        }

        this.resetVisuals();
        this.hpBar = scene.add.graphics();
        this.redrawHpBar();

        this.roleText = scene.add.text(x, y, this.role, { 
            fontSize: '11px', fill: '#ffffff', stroke: '#000000', strokeThickness: 2, fontFamily: 'monospace'
        }).setOrigin(0.5);
    }
    // ... (이하 메서드들은 이전과 동일하므로 생략하지 않고 전체 코드를 넣으셔도 됩니다. 이전 코드 그대로 유지)
    // Unit.js의 나머지 메서드들(resetVisuals, update, takeDamage 등)은 변경 사항이 없습니다.
    // 편의를 위해 수정된 constructor 외에는 기존 로직을 그대로 사용하시면 됩니다.

    resetVisuals() {
        this.scale = 1;
        this.setDisplaySize(this.baseSize, this.baseSize);
        if (this.body) this.body.setCircle(50, 0, 0);
    }

    setFormationOffset(leaderX, leaderY) {
        this.formationOffset.x = this.x - leaderX;
        this.formationOffset.y = this.y - leaderY;
    }

    update(time, delta) {
        if (!this.active) return;
        this.hpBar.setPosition(this.x, this.y - (this.baseSize / 2) + 20);
        if (this.roleText) this.roleText.setPosition(this.x, this.y + (this.baseSize / 2) + 12);
        if (this.fleeTimer > 0) this.fleeTimer -= delta;

        if (this.scene.isGameOver) {
            if (this.anims.isPlaying) this.stop();
            this.setVelocity(0, 0);
            return;
        }

        const isBusy = this.isTakingDamage || this.isAttacking;
        if (!isBusy && this.body.velocity.length() > 0) {
            if (!this.anims.isPlaying) {
                if (this.team === 'blue') this.play('cat_walk', true);
                else if (this.team === 'red') this.play('dog_walk', true);
                this.resetVisuals();
            }
        }

        if (this.isLeader) {
            this.updatePlayerMovement();
        } else {
            if (this.scene.battleStarted) {
                this.ai.update(delta);
            } else {
                this.updateFormationFollow();
            }
        }

        if (!this.isLeader && this.scene.battleStarted) {
             if (this.currentTarget && this.currentTarget.active) {
                this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
                if (this.currentTarget.x < this.x) this.setFlipX(this.team === 'blue' ? false : true); 
                else this.setFlipX(this.team === 'blue' ? true : false);
            } else {
                if (this.fleeTimer <= 0) this.setVelocity(0, 0);
            }
        }
    }

    updatePlayerMovement() {
        this.setVelocity(0);
        const cursors = this.scene.cursors;
        let vx = 0;
        let vy = 0;

        if (cursors.left.isDown || this.scene.wasd.left.isDown) vx -= 1;
        if (cursors.right.isDown || this.scene.wasd.right.isDown) vx += 1;
        if (cursors.up.isDown || this.scene.wasd.up.isDown) vy -= 1;
        if (cursors.down.isDown || this.scene.wasd.down.isDown) vy += 1;

        if (vx !== 0 || vy !== 0) {
            this._tempVec.set(vx, vy).normalize().scale(this.moveSpeed);
            this.setVelocity(this._tempVec.x, this._tempVec.y);
            if (vx < 0) this.setFlipX(false);
            else if (vx > 0) this.setFlipX(true);
        }
    }

    updateFormationFollow() {
        if (this.team !== 'blue') {
            this.setVelocity(0, 0);
            return;
        }
        const leader = this.scene.playerUnit;
        if (!leader || !leader.active) return;
        const targetX = leader.x + this.formationOffset.x;
        const targetY = leader.y + this.formationOffset.y;
        const distance = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
        if (distance > 5) {
            this.scene.physics.moveTo(this, targetX, targetY, this.moveSpeed);
            if (targetX < this.x) this.setFlipX(false);
            else if (targetX > this.x) this.setFlipX(true);
        } else {
            this.setVelocity(0, 0);
        }
    }

    triggerAttackVisuals() {
        if (this.team === 'blue' && !this.isTakingDamage) {
            this.isAttacking = true;
            this.setTexture('cat_punch');
            this.resetVisuals();
            this.scene.tweens.killTweensOf(this);
            const popSize = this.baseSize * 1.2; 
            this.scene.tweens.add({
                targets: this, displayWidth: popSize, displayHeight: popSize, duration: 50, yoyo: true, ease: 'Quad.easeOut',
                onComplete: () => { if (this.active) this.resetVisuals(); }
            });
            if (this.attackTimer) this.attackTimer.remove(false);
            this.attackTimer = this.scene.time.delayedCall(300, () => {
                if (this.active && !this.isTakingDamage) {
                    this.isAttacking = false;
                    this.setTexture('blueCat');
                    this.play('cat_walk');
                    this.resetVisuals();
                    if (this.isLeader) this.setTint(0xffffaa);
                    else this.clearTint();
                }
            });
        }
    }

    takeDamage(amount) {
        if (!this.scene.battleStarted) return;
        this.hp -= amount;
        this.ai.onTakeDamage();

        if (this.team === 'blue') {
            this.isTakingDamage = true;
            this.isAttacking = false;
            this.setTexture('cat_hit');
            this.resetVisuals();
            this.scene.tweens.killTweensOf(this);
            const popSize = this.baseSize * 1.2; 
            this.scene.tweens.add({
                targets: this, displayWidth: popSize, displayHeight: popSize, duration: 50, yoyo: true, ease: 'Quad.easeOut',
                onComplete: () => { if (this.active) this.resetVisuals(); }
            });
            if (this.damageTimer) this.damageTimer.remove(false);
            this.damageTimer = this.scene.time.delayedCall(500, () => {
                if (this.active && this.hp > 0) {
                    this.isTakingDamage = false;
                    this.setTexture('blueCat');
                    this.play('cat_walk');
                    this.resetVisuals();
                    if (this.isLeader) this.setTint(0xffffaa);
                    else this.clearTint();
                }
            });
        }
        this.redrawHpBar();
        if (this.hp <= 0) this.die();
    }

    redrawHpBar() {
        this.hpBar.clear();
        if (this.hp <= 0) return;
        const barWidth = 32;
        const relX = -barWidth / 2;
        const relY = -(this.baseSize / 2) - 10; 
        this.hpBar.fillStyle(0x000000);
        this.hpBar.fillRect(relX, relY, barWidth, 4);
        const hpPercent = this.hp / this.maxHp;
        const color = hpPercent > 0.5 ? 0x00ff00 : 0xff0000;
        this.hpBar.fillStyle(color);
        this.hpBar.fillRect(relX, relY, barWidth * hpPercent, 4);
    }

    die() {
        this.hpBar.destroy();
        if (this.roleText) this.roleText.destroy();
        this.destroy();
    }
}