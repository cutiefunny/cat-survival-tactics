import Unit from '../Unit';
import Phaser from 'phaser';

export default class Tanker extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Tanker';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    performSkill() {
        console.log("🛡️ [Tanker] performSkill START");
        
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

        enemies.forEach(enemy => {
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq <= tauntRadiusSq) {
                    // 적에게 도발 검 (타겟 강제 변경 + 타이머 설정)
                    if (enemy.ai) {
                        enemy.ai.currentTarget = this;
                        enemy.ai.provokedTimer = 5000;
                    } else {
                        enemy.currentTarget = this; 
                    }
                    this.showTauntedEffect(enemy);
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

    updateAI(delta) {
        // 1. 도발 체크
        this.ai.processAggro(delta);
        if (this.ai.isProvoked) {
            if (this.ai.currentTarget && this.ai.currentTarget.active) {
                this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
                this.updateFlipX();
            }
            return;
        }

        // 2. 일반 로직
        this.ai.thinkTimer -= delta;
        if (this.ai.thinkTimer <= 0) {
            this.ai.thinkTimer = 200 + Math.random() * 100;
            this.ai.currentTarget = this.ai.findNearestEnemy();
        }

        if (this.ai.currentTarget && this.ai.currentTarget.active) {
            this.scene.physics.moveToObject(this, this.ai.currentTarget, this.moveSpeed);
            this.updateFlipX();
        } else {
            this.ai.followLeader();
        }
    }
}