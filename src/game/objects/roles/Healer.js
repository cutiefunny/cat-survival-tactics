import Unit from '../Unit';
import Phaser from 'phaser';

export default class Healer extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Healer';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        // [New] 설정값에서 스택 한계치 가져오기 (기본값 10)
        this.aggroStackLimit = stats.aggroStackLimit || 10;
        this.healStack = 0;
        
        console.log(`💚 [Healer] Spawned! Heal CD: ${this.skillMaxCooldown}ms, Aggro Limit: ${this.aggroStackLimit}`);
    }

    updateAI(delta) {
        this.thinkTimer -= delta;

        if (this.hp / this.maxHp <= 0.2) {
            this.currentTarget = this; 
        } else {
            const weakAlly = this.findLowestHpAlly();
            this.currentTarget = weakAlly ? weakAlly : null;
        }

        if (this.currentTarget) {
            const target = this.currentTarget;
            const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
            
            const stopDist = 150; 
            const moveDist = 200; 
            const isMoving = this.body.velocity.lengthSq() > 10;

            if (isMoving) {
                if (dist <= stopDist) {
                    this.setVelocity(0, 0);
                    this.updateFlipX(); 
                    this.tryUseSkill();
                } else {
                    this.scene.physics.moveToObject(this, target, this.moveSpeed);
                    this.updateFlipX();
                }
            } else {
                if (dist > moveDist) {
                    this.scene.physics.moveToObject(this, target, this.moveSpeed);
                    this.updateFlipX();
                } else {
                    this.tryUseSkill(); 
                }
            }
        } else {
            this.followLeader();
        }
    }

    updateFlipX() {
        if (this.body.velocity.x < -20) {
            this.setFlipX(false);
        } else if (this.body.velocity.x > 20) {
            this.setFlipX(true);
        }
    }

    updateDebugVisuals() {
        if (!this.debugText || !this.debugGraphic) return;

        this.debugText.setVisible(true);
        this.debugGraphic.setVisible(true);
        this.debugGraphic.clear();
        this.debugText.setPosition(this.x, this.y - (this.baseSize / 2) - 50);

        const cooldownSec = Math.max(0, this.skillTimer / 1000).toFixed(1);
        const hpPct = (this.hp / this.maxHp * 100).toFixed(0);

        // [Visual] 설정된 Limit로 표시 (Stack: 5/15)
        this.debugText.setText(`HP:${hpPct}%\nCD:${cooldownSec}s\nStack:${this.healStack}/${this.aggroStackLimit}`);
        this.debugText.setColor(this.healStack >= (this.aggroStackLimit - 1) ? '#ff4444' : '#00ff00');

        if (this.currentTarget && this.currentTarget.active) {
            this.debugGraphic.lineStyle(1, 0x00ff00, 0.5);
            this.debugGraphic.lineBetween(this.x, this.y, this.currentTarget.x, this.currentTarget.y);
        }
    }

    performSkill() {
        const target = this.currentTarget;
        if (!target || !target.active || target.hp >= target.maxHp) {
            return;
        }

        this.isUsingSkill = true;
        this.stop(); 
        if (this.texture.frameTotal > 3) {
            this.setFrame(3); 
        }
        
        const healAmount = this.attackPower; 
        
        target.hp = Math.min(target.hp + healAmount, target.maxHp);
        target.redrawHpBar();

        // 힐 성공 시 스택 증가
        this.healStack++;
        
        // [Modified] 설정된 aggroStackLimit 도달 시 어그로 발동
        if (this.healStack >= this.aggroStackLimit) {
            this.triggerAggro();
            this.healStack = 0; 
        }

        console.log(`💚 [Healer] Healed. Stack: ${this.healStack}/${this.aggroStackLimit}`);

        this.showHealEffect(target, healAmount);

        this.scene.time.delayedCall(500, () => {
            if (this.active) {
                this.isUsingSkill = false;
                this.resetVisuals();
            }
        });
    }

    triggerAggro() {
        console.log("⚠️ [Healer] Aggro Overflow! Pulling enemies...");
        
        const text = this.scene.add.text(this.x, this.y - 60, "⚠️AGGRO!", {
            fontSize: '18px', fontStyle: 'bold', color: '#ffaaaa', stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5);
        
        this.scene.tweens.add({
            targets: text, y: text.y - 40, alpha: 0, duration: 1500,
            onComplete: () => text.destroy()
        });

        const enemies = this.targetGroup.getChildren();
        enemies.forEach(enemy => {
            if (enemy.active) {
                // [Modified] 탱커의 도발(isProvoked) 상태여도 무시하고 어그로를 가져옴 (덮어쓰기)
                // 탱커가 나중에 다시 스킬을 쓰면 그때 다시 탱커에게 돌아감 (Last Action Wins)
                
                enemy.currentTarget = this;
                
                // 도발 상태였다면 해제 (선택 사항: 힐러가 뺏으면 도발 풀림)
                if (enemy.isProvoked) {
                    enemy.isProvoked = false;
                }
                
                const icon = this.scene.add.text(enemy.x, enemy.y - 40, "!", { 
                    fontSize: '24px', color: '#ff0000', fontStyle: 'bold' 
                }).setOrigin(0.5);
                this.scene.tweens.add({
                    targets: icon, y: icon.y - 20, alpha: 0, duration: 800,
                    onComplete: () => icon.destroy()
                });
            }
        });
    }

    showHealEffect(target, amount) {
        const text = this.scene.add.text(target.x, target.y - 40, `+${amount}`, {
            fontSize: '24px', fontStyle: 'bold', color: '#00ff00', stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5);

        const heart = this.scene.add.text(target.x, target.y - 60, "💚", { fontSize: '20px' }).setOrigin(0.5);

        this.scene.tweens.add({
            targets: [text, heart], y: '-=30', alpha: 0, duration: 1000, ease: 'Power1',
            onComplete: () => { text.destroy(); heart.destroy(); }
        });

        target.setTint(0x00ff00);
        this.scene.time.delayedCall(200, () => {
            if (target.active) target.clearTint();
        });
    }
    
    findNearestEnemy() { return null; }
}