import Unit from '../Unit';
import Phaser from 'phaser';

export default class Healer extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Healer';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        this.aggroStackLimit = stats.aggroStackLimit || 10;
        this.healStack = 0;
        
        console.log(`💚 [Healer] Spawned! Heal CD: ${this.skillMaxCooldown}ms, Aggro Limit: ${this.aggroStackLimit}`);
    }

    updateAI(delta) {
        this.ai.thinkTimer -= delta;

        // [New] 1. 타겟 선정 (가장 체력이 낮은 아군 우선)
        let bestTarget = null;

        // 1-1. 자가 생존 우선 (HP 30% 이하)
        if (this.hp / this.maxHp <= 0.3) {
            bestTarget = this;
        } else {
            // 1-2. 가장 체력이 낮은 아군 탐색
            bestTarget = this.ai.findLowestHpAlly();
        }

        // 1-3. 타겟 교체 판정
        if (!this.ai.currentTarget || !this.ai.currentTarget.active || this.ai.currentTarget.isDying || this.ai.currentTarget.hp >= this.ai.currentTarget.maxHp) {
            // 현재 타겟이 없거나, 죽었거나, 다 나았으면 -> 즉시 교체
            this.ai.currentTarget = bestTarget;
        } else if (bestTarget && bestTarget !== this.ai.currentTarget) {
            // 현재 타겟이 있는데 더 급한 환자가 생긴 경우
            
            // 자가 치유가 필요해졌으면 즉시 전환
            if (bestTarget === this) {
                this.ai.currentTarget = bestTarget;
            } 
            // 다른 아군이 현재 타겟보다 HP가 10 이상 더 낮으면 전환 (과도한 스위칭 방지용 최소 버퍼)
            else if (bestTarget.hp < this.ai.currentTarget.hp - 10) {
                this.ai.currentTarget = bestTarget;
            }
        }

        // [Safety Check] 만약 타겟이 여전히 null이면 리더를 따라다님 (유휴 상태)
        if (!this.ai.currentTarget && this.scene.playerUnit && this.scene.playerUnit.active) {
             // 힐 할 대상이 없으면 공격 로직이나 리더 따라가기 수행
             // 여기서는 리더 뒤 포지셔닝으로 연결
        }

        // 2. [이동 및 행동]
        if (this.ai.currentTarget) {
            const target = this.ai.currentTarget;
            const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
            
            const healRange = 180; 
            const moveBuffer = 30; // 이동 떨림 방지 버퍼

            // 멈춰있을 때는 더 멀어져야 움직임 (Deadzone)
            const isStopped = this.body.speed < 10;
            const threshold = isStopped ? (healRange + moveBuffer) : healRange;
            
            if (dist <= threshold) {
                // 사거리 안
                this.setVelocity(0, 0);
                this.updateFlipX(); 
                this.tryUseSkill();
            } else {
                // 사거리 밖 -> 접근
                this.scene.physics.moveToObject(this, target, this.moveSpeed);
                this.updateFlipX();
            }
        } else {
            // 힐 할 대상이 없으면 안전한 위치로
            this.maintainSafePosition();
        }
    }

    maintainSafePosition() {
        if (!this.scene.playerUnit || !this.scene.playerUnit.active) {
            this.setVelocity(0, 0);
            return;
        }

        const leader = this.scene.playerUnit;
        
        // 적들의 무게중심 계산
        let enemyCX = 0, enemyCY = 0, count = 0;
        this.targetGroup.getChildren().forEach(e => {
            if(e.active && !e.isDying) { enemyCX += e.x; enemyCY += e.y; count++; }
        });

        if (count > 0) {
            enemyCX /= count;
            enemyCY /= count;

            // 리더 기준, 적 반대 방향
            const angle = Phaser.Math.Angle.Between(enemyCX, enemyCY, leader.x, leader.y);
            const safeDist = 120;
            const targetX = leader.x + Math.cos(angle) * safeDist;
            const targetY = leader.y + Math.sin(angle) * safeDist;
            
            const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
            
            // 도착 지점 떨림 방지
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

        // 속도 데드존 적용
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