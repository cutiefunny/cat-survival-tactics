import Unit from '../Unit';
import Phaser from 'phaser';

export default class Healer extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Healer';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        this.aggroStackLimit = stats.aggroStackLimit || 10;
        this.healStack = 0;
        
        if (!this.skillRange) this.skillRange = 200;

        console.log(`💚 [Healer] Spawned! Heal CD: ${this.skillMaxCooldown}ms, Range: ${this.skillRange}, Aggro Limit: ${this.aggroStackLimit}`);
    }

    tryUseSkill() {
        if (this.skillTimer <= 0 && this.skillMaxCooldown > 0) {
            const isSuccess = this.performSkill(); 
            if (isSuccess) {
                this.skillTimer = this.skillMaxCooldown;
            }
        }
    }

    updateNpcLogic(delta) {
        if (this.team === 'blue' && this.scene.squadState === 'FORMATION') {
            const targetInRange = this.findLowestHpAllyInRange(this.skillRange);
            if (targetInRange) {
                this.updateAI(delta);
                return;
            }
        }
        super.updateNpcLogic(delta);
    }

    updateAI(delta) {
        // 1. 도발(Taunt) 상태 체크
        this.ai.processAggro(delta);
        if (this.ai.isProvoked) {
            if (this.ai.currentTarget && this.ai.currentTarget.active) {
                this.ai.moveToTargetSmart(delta);
            }
            return; 
        }

        this.ai.thinkTimer -= delta;
        const isFormationMode = (this.team === 'blue' && this.scene.squadState === 'FORMATION');

        // 2. [타겟 선정] 주변 범위 내 아군을 최우선으로, 없으면 전체 중 체력 최하 아군
        let bestTarget = null;
        
        // 자신의 체력이 심각하면 자신을 치료
        if (this.hp / this.maxHp <= 0.3) {
            bestTarget = this; 
        } else {
            // 먼저 주변 범위 내 치료할 아군 찾기 (가까운 것 우선)
            bestTarget = this.findLowestHpAllyInRange(this.skillRange);
            
            // 주변에 없으면 전체 팀에서 가장 체력 낮은 아군 찾기
            if (!bestTarget) {
                bestTarget = this.findLowestHpAlly();
            }
        }

        // 3. [Sticky Targeting] 타겟 교체 로직
        const current = this.ai.currentTarget;
        
        if (!current || !current.active || current.isDying || current.hp >= current.maxHp) {
            this.ai.currentTarget = bestTarget;
        } else if (bestTarget && bestTarget !== current) {
            if (bestTarget === this) {
                this.ai.currentTarget = bestTarget;
            } 
            else if (bestTarget.hp < current.hp - 10) {
                this.ai.currentTarget = bestTarget;
            }
        }
        
        if (isFormationMode && this.ai.currentTarget && this.ai.currentTarget !== this) {
            const dist = Phaser.Math.Distance.Between(this.x, this.y, this.ai.currentTarget.x, this.ai.currentTarget.y);
            if (dist > this.skillRange) {
                this.ai.currentTarget = null;
            }
        }

        // 4. [이동 및 행동]
        if (this.ai.currentTarget) {
            const target = this.ai.currentTarget;
            const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
            
            // [대열 유지 모드] 제자리 힐
            if (isFormationMode) {
                this.setVelocity(0, 0);
                if (dist <= this.skillRange) {
                    this.updateFlipX(); 
                    this.tryUseSkill();
                }
                return;
            }

            // [일반 모드] 추적 힐
            const isStopped = this.body.speed < 10;
            const threshold = isStopped ? (this.skillRange - 10) : (this.skillRange - 40);
            
            if (dist <= threshold) {
                this.setVelocity(0, 0);
                this.ai.currentPath = [];
                this.updateFlipX(); 
                this.tryUseSkill();
            } else {
                if (target !== this) {
                    this.ai.moveToTargetSmart(delta);
                }
            }
        } else {
            if (isFormationMode) {
                this.setVelocity(0, 0); 
            } else {
                this.maintainSafePosition(); 
            }
        }
    }

    findLowestHpAlly() {
        const allies = (this.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        let lowestHp = Infinity;
        let target = null;

        for (const ally of allies) {
            if (ally.active && !ally.isDying && ally.hp < ally.maxHp) {
                if (ally.hp < lowestHp) {
                    lowestHp = ally.hp;
                    target = ally;
                }
            }
        }
        return target;
    }

    findLowestHpAllyInRange(range) {
        const allies = (this.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        let lowestHpVal = Infinity; 
        let target = null;
        
        for (let ally of allies) {
            if (ally.active && !ally.isDying && ally.hp < ally.maxHp) {
                const dist = Phaser.Math.Distance.Between(this.x, this.y, ally.x, ally.y);
                if (dist <= range) {
                    if (ally.hp < lowestHpVal) { 
                        lowestHpVal = ally.hp; 
                        target = ally; 
                    }
                }
            }
        }
        return target;
    }

    maintainSafePosition() {
        if (!this.scene.playerUnit || !this.scene.playerUnit.active) {
            this.setVelocity(0, 0);
            return;
        }

        const leader = this.scene.playerUnit;
        
        let enemyCX = 0, enemyCY = 0, count = 0;
        this.targetGroup.getChildren().forEach(e => {
            if(e.active && !e.isDying) { enemyCX += e.x; enemyCY += e.y; count++; }
        });

        if (count > 0) {
            enemyCX /= count;
            enemyCY /= count;

            const angle = Phaser.Math.Angle.Between(enemyCX, enemyCY, leader.x, leader.y);
            const safeDist = 120;
            const targetX = leader.x + Math.cos(angle) * safeDist;
            const targetY = leader.y + Math.sin(angle) * safeDist;
            
            const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
            
            if (distToTarget > 15) {
                this.scene.physics.moveTo(this, targetX, targetY, this.moveSpeed * 0.9);
                this.updateFlipX();
            } else {
                this.setVelocity(0, 0);
            }
        } else {
            this.ai.followLeader();
        }
    }

    updateAnimation() {
        if (this.isUsingSkill) {
            if (this.anims.isPlaying) this.stop();
            if (this.frame.name !== '3') {
                this.setFrame(3);
            }
            return; 
        }
        super.updateAnimation();
    }

    updateFlipX() {
        if (this.isUsingSkill) return;

        if (this.body.velocity.x < -20) {
            this.setFlipX(false);
        } else if (this.body.velocity.x > 20) {
            this.setFlipX(true);
        } else if (this.ai.currentTarget && this.ai.currentTarget.active) {
            const diffX = this.ai.currentTarget.x - this.x;
            if (Math.abs(diffX) > 10) this.setFlipX(diffX > 0);
        }
    }

    updateDebugVisuals() {
        if (!this.debugText || !this.debugGraphic) return;

        this.debugText.setVisible(true);
        this.debugGraphic.setVisible(true);
        this.debugGraphic.clear();
        this.debugText.setPosition(this.x, this.y - (this.baseSize / 2) - 50);

        const hpPct = (this.hp / this.maxHp * 100).toFixed(0);
        const stateStr = (this.ai.currentTarget ? "➕HEAL" : "🛡️SAFE");

        this.debugText.setText(`${stateStr}\nHP:${hpPct}%\nStack:${this.healStack}/${this.aggroStackLimit}`);
        this.debugText.setColor((this.healStack >= (this.aggroStackLimit - 1) ? '#ff4444' : '#00ff00'));

        if (this.ai.currentTarget && this.ai.currentTarget.active) {
            this.debugGraphic.lineStyle(1, 0x00ff00, 0.5);
            this.debugGraphic.lineBetween(this.x, this.y, this.ai.currentTarget.x, this.ai.currentTarget.y);
        }
    }

    performSkill() {
        const target = this.ai.currentTarget; 
        if (!target || !target.active || target.hp >= target.maxHp) {
            return false; 
        }
        
        const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
        if (dist > this.skillRange + 10) { 
            return false; 
        }

        this.isUsingSkill = true;
        this.setVelocity(0, 0); 
        this.stop(); 
        this.setFrame(3);

        const diffX = target.x - this.x;
        if (Math.abs(diffX) > 10) this.setFlipX(diffX > 0);
        
        // [Modified] 회복량 = 힐러의 공격력(ATK)
        const healAmount = this.attackPower; 
        target.hp = Math.min(target.hp + healAmount, target.maxHp);
        target.redrawHpBar();

        this.healStack++;
        
        if (this.healStack >= this.aggroStackLimit) {
            this.triggerAggro();
            this.healStack = 0; 
        }

        this.showHealEffect(target, healAmount);

        this.scene.time.delayedCall(500, () => {
            if (this.active) {
                this.isUsingSkill = false;
                this.resetVisuals(); 
            }
        });

        return true; 
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
                if (enemy.ai) enemy.ai.currentTarget = this;
                if (enemy.isProvoked) enemy.isProvoked = false; 
                
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
}