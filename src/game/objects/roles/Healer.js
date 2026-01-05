import Unit from '../Unit';
import Phaser from 'phaser';

export default class Healer extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Healer';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        // 설정값에서 스택 한계치 가져오기 (기본값 10)
        this.aggroStackLimit = stats.aggroStackLimit || 10;
        this.healStack = 0;
        
        console.log(`💚 [Healer] Spawned! Heal CD: ${this.skillMaxCooldown}ms, Aggro Limit: ${this.aggroStackLimit}`);
    }

    updateAI(delta) {
        this.thinkTimer -= delta;

        // 1. 체력이 20% 이하면 자신을 최우선 치유 대상으로 설정
        if (this.hp / this.maxHp <= 0.2) {
            this.currentTarget = this; 
        } else {
            // 2. 가장 체력이 낮은 아군 탐색
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

    // [핵심 수정] 애니메이션 업데이트 로직 오버라이드 (강력 고정)
    updateAnimation() {
        // 스킬(힐) 사용 중일 때는 무조건 힐 모션(Frame 3) 고정
        if (this.isUsingSkill) {
            if (this.anims.isPlaying) this.stop();
            
            // 4번째 이미지(인덱스 3)를 강제로 지정
            // 안전장치 제거: 개발자님이 이미지가 있다고 확인했으므로 무조건 3번 프레임 호출
            if (this.frame.name !== '3') {
                this.setFrame(3);
            }
            return; // 부모 클래스의 updateAnimation(Idle 설정 등) 실행 방지
        }
        
        // 스킬 사용 중이 아닐 때만 기본 동작(걷기/대기) 수행
        super.updateAnimation();
    }

    updateFlipX() {
        // 힐 중에는 방향 전환 하지 않음 (타겟 고정)
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

        // 1. 상태 플래그 설정 (updateAnimation에서 감지함)
        this.isUsingSkill = true;
        
        // 2. 물리 및 애니메이션 정지
        this.setVelocity(0, 0); 
        this.stop(); 
        
        // 3. 즉시 프레임 변경 (깜빡임 방지)
        this.setFrame(3);

        // 4. 방향 전환 (아군 바라보기)
        const diffX = target.x - this.x;
        if (diffX !== 0) this.setFlipX(diffX > 0);
        
        const healAmount = this.attackPower; 
        
        target.hp = Math.min(target.hp + healAmount, target.maxHp);
        target.redrawHpBar();

        this.healStack++;
        
        if (this.healStack >= this.aggroStackLimit) {
            this.triggerAggro();
            this.healStack = 0; 
        }

        console.log(`💚 [Healer] Healed. Stack: ${this.healStack}/${this.aggroStackLimit}`);

        this.showHealEffect(target, healAmount);

        // 0.5초 후 스킬 상태 해제
        this.scene.time.delayedCall(500, () => {
            if (this.active) {
                this.isUsingSkill = false;
                this.resetVisuals(); // Idle 상태로 복귀
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
                enemy.currentTarget = this;
                
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