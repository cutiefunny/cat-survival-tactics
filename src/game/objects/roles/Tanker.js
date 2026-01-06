import Unit from '../Unit';
import Phaser from 'phaser';

export default class Tanker extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Tanker';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    updateAI(delta) {
        // [필수] 도발 상태 체크 (도발 걸리면 강제로 끌려감)
        this.ai.processAggro(delta);
        if (this.ai.isProvoked) {
            if (this.ai.currentTarget && this.ai.currentTarget.active) {
                this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
                this.updateFlipX();
            }
            return;
        }

        this.ai.thinkTimer -= delta;

        // 1. [스킬 각 보기] 적이 뭉쳐있거나 아군이 위험할 때
        if (this.skillTimer <= 0) {
            // 주변에 적이 2명 이상이면 도발 시전
            const nearbyEnemies = this.countEnemiesInRange(this.skillRange || 200);
            if (nearbyEnemies >= 2) {
                this.tryUseSkill(); // [Fix] performSkill 대신 tryUseSkill 호출 (쿨타임 적용)
                return;
            }
        }

        // 2. [보디가드 모드] 위험한 아군이 있는지 확인
        if (this.ai.thinkTimer <= 0) {
            this.ai.thinkTimer = 200 + Math.random() * 100;
            
            const allyInDanger = this.ai.findAllyUnderAttack();
            if (allyInDanger) {
                // 위험한 아군을 괴롭히는 적을 타겟으로 잡음
                const attackers = allyInDanger.findEnemiesTargetingMe ? allyInDanger.findEnemiesTargetingMe() : [];
                if (attackers.length > 0) {
                    this.ai.currentTarget = attackers[0];
                    // console.log("🛡️ Tanker protecting:", allyInDanger.role);
                } else {
                    this.ai.currentTarget = this.ai.findStrategicTarget({ distance: 1.5, lowHp: 1.0 });
                }
            } else {
                // 평소에는 가장 가까운 적이나 위협적인 적을 막음
                this.ai.currentTarget = this.ai.findStrategicTarget({ distance: 2.0, rolePriority: {'Tanker': 0} });
            }
        }

        // 3. [이동 실행]
        if (this.ai.currentTarget && this.ai.currentTarget.active) {
            // 적에게 붙어서 이동 (몸으로 비비기)
            this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
            this.updateFlipX();
        } else {
            this.ai.followLeader();
        }
    }

    countEnemiesInRange(range) {
        let count = 0;
        const rangeSq = range * range;
        this.targetGroup.getChildren().forEach(enemy => {
            if (enemy.active && !enemy.isDying) {
                if (Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y) <= rangeSq) {
                    count++;
                }
            }
        });
        return count;
    }

    performSkill() {
        // console.log("🛡️ [Tanker] performSkill START");
        
        this.isUsingSkill = true; 
        this.stop(); 
        this.setTexture(this.textureKey); 
        this.setFrame(5); 

        this.scene.time.delayedCall(500, () => {
            if(this.active) {
                this.isUsingSkill = false;
                this.setTexture(this.textureKey);
                this.resetVisuals();
            }
        });

        const tauntRadius = this.skillRange || 200;
        const tauntRadiusSq = tauntRadius * tauntRadius;
        const enemies = this.targetGroup.getChildren();

        let tauntedCount = 0;
        enemies.forEach(enemy => {
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq <= tauntRadiusSq) {
                    if (enemy.ai) {
                        enemy.ai.currentTarget = this;
                        enemy.ai.provokedTimer = 5000;
                    } else {
                        enemy.currentTarget = this; 
                    }
                    this.showTauntedEffect(enemy);
                    tauntedCount++;
                }
            }
        });

        // Effect
        const circle = this.scene.add.circle(this.x, this.y, 10, 0xffff00, 0.3);
        this.scene.tweens.add({ targets: circle, radius: tauntRadius, alpha: 0, duration: 500, onComplete: () => circle.destroy() });
        const text = this.scene.add.text(this.x, this.y - 40, "TAUNT!", { fontSize: '20px', fontStyle: 'bold', color: '#ffff00', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
        this.scene.tweens.add({ targets: text, y: text.y - 30, alpha: 0, duration: 1000, onComplete: () => text.destroy() });
    }

    showTauntedEffect(enemy) {
        const icon = this.scene.add.text(enemy.x, enemy.y - 30, "💢", { fontSize: '24px' }).setOrigin(0.5);
        this.scene.tweens.add({ targets: icon, y: icon.y - 20, alpha: 0, duration: 800, onComplete: () => icon.destroy() });
    }
}