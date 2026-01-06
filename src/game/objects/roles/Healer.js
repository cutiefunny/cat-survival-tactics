import Unit from '../Unit';
import Phaser from 'phaser';

export default class Healer extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Healer';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        this.aggroStackLimit = stats.aggroStackLimit || 10;
        this.healStack = 0;
        this.healRange = 180; // 치유 사거리 상수화

        console.log(`💚 [Healer] Spawned! Heal CD: ${this.skillMaxCooldown}ms, Aggro Limit: ${this.aggroStackLimit}`);
    }

    // [New] 대열 유지 모드: 사거리 내 환자가 있을 때만 제자리 힐
    updateNpcLogic(delta) {
        if (this.team === 'blue' && this.scene.squadState === 'FORMATION') {
            // 사거리 내에 치료 가능한 아군이 있는지 확인
            const targetInRange = this.findLowestHpAllyInRange(this.healRange);
            
            if (targetInRange) {
                this.updateAI(delta);
                return;
            }
        }
        
        // 환자가 없거나 멀면 -> 리더 따라가기 (대열 복귀)
        super.updateNpcLogic(delta);
    }

    updateAI(delta) {
        this.ai.thinkTimer -= delta;
        const isFormationMode = (this.team === 'blue' && this.scene.squadState === 'FORMATION');

        // 1. [타겟 선정]
        let bestTarget = null;

        if (isFormationMode) {
            // [Fix] 대열모드: 사거리 내의 아군 중에서만 타겟 선정
            if (this.hp / this.maxHp <= 0.3) {
                bestTarget = this; // 자가 치유 우선
            } else {
                bestTarget = this.findLowestHpAllyInRange(this.healRange);
            }
        } else {
            // 일반모드: 전체 아군 중 가장 위급한 대상 (기존 로직)
            if (this.hp / this.maxHp <= 0.3) {
                bestTarget = this; 
            } else {
                bestTarget = this.ai.findLowestHpAlly();
            }
        }

        // 타겟 교체 로직 (빈번한 교체 방지)
        if (!this.ai.currentTarget || !this.ai.currentTarget.active || this.ai.currentTarget.isDying || this.ai.currentTarget.hp >= this.ai.currentTarget.maxHp) {
            this.ai.currentTarget = bestTarget;
        } else if (bestTarget && bestTarget !== this.ai.currentTarget) {
            if (bestTarget === this) {
                this.ai.currentTarget = bestTarget;
            } 
            else if (bestTarget.hp < this.ai.currentTarget.hp - 10) {
                this.ai.currentTarget = bestTarget;
            }
        }
        
        // 대열모드인데 타겟이 사거리 밖으로 나갔다면 타겟 해제
        if (isFormationMode && this.ai.currentTarget && this.ai.currentTarget !== this) {
            const dist = Phaser.Math.Distance.Between(this.x, this.y, this.ai.currentTarget.x, this.ai.currentTarget.y);
            if (dist > this.healRange) {
                this.ai.currentTarget = null;
            }
        }

        // 2. [이동 및 행동]
        if (this.ai.currentTarget) {
            const target = this.ai.currentTarget;
            const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
            
            // [Fix] 대열 유지 모드면 이동 금지 (제자리 힐)
            if (isFormationMode) {
                this.setVelocity(0, 0);
                // 사거리 체크 후 힐
                if (dist <= this.healRange) {
                    this.updateFlipX(); 
                    this.tryUseSkill();
                }
                return;
            }

            // --- 이하 일반 모드 이동 로직 ---
            const moveBuffer = 30; 
            const isStopped = this.body.speed < 10;
            const threshold = isStopped ? (this.healRange + moveBuffer) : this.healRange;
            
            if (dist <= threshold) {
                this.setVelocity(0, 0);
                this.updateFlipX(); 
                this.tryUseSkill();
            } else {
                this.scene.physics.moveToObject(this, target, this.moveSpeed);
                this.updateFlipX();
            }
        } else {
            // 타겟이 없으면
            if (isFormationMode) {
                this.setVelocity(0, 0); // 대열모드면 대기 (updateNpcLogic에서 처리되지만 안전장치)
            } else {
                this.maintainSafePosition(); // 일반모드면 포지셔닝
            }
        }
    }

    // [New] 사거리 내에서 가장 HP가 낮은 아군 찾기
    findLowestHpAllyInRange(range) {
        const allies = (this.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        let lowestHpVal = Infinity; 
        let target = null;
        
        for (let ally of allies) {
            // 살아있고, 치료가 필요하며, 사거리 내에 있는 아군
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
            return;
        }

        this.isUsingSkill = true;
        this.setVelocity(0, 0); 
        this.stop(); 
        this.setFrame(3);

        const diffX = target.x - this.x;
        if (Math.abs(diffX) > 10) this.setFlipX(diffX > 0);
        
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