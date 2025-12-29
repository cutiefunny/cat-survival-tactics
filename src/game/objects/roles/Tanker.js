import Unit from '../Unit';
import Phaser from 'phaser';

export default class Tanker extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Tanker';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    performSkill() {
        console.log("🛡️ Tanker uses TAUNT!");
        
        this.setTexture('cat_haak');
        this.stop(); 
        
        this.scene.time.delayedCall(1000, () => {
            if(this.active) this.resetVisuals();
        });

        // [CHANGE] 설정값 사용
        const tauntRadius = this.skillRange || 200;
        const tauntRadiusSq = tauntRadius * tauntRadius;
        const enemies = this.targetGroup.getChildren();

        enemies.forEach(enemy => {
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq <= tauntRadiusSq) {
                    enemy.currentTarget = this;
                    this.showTauntedEffect(enemy);
                }
            }
        });

        const circle = this.scene.add.circle(this.x, this.y, 10, 0xffff00, 0.3);
        this.scene.tweens.add({
            targets: circle,
            radius: tauntRadius,
            alpha: 0,
            duration: 500,
            onComplete: () => circle.destroy()
        });

        const text = this.scene.add.text(this.x, this.y - 40, "TAUNT!", {
            fontSize: '20px', fontStyle: 'bold', color: '#ffff00', stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5);
        
        this.scene.tweens.add({
            targets: text, y: text.y - 30, alpha: 0, duration: 1000,
            onComplete: () => text.destroy()
        });
    }

    showTauntedEffect(enemy) {
        const icon = this.scene.add.text(enemy.x, enemy.y - 30, "💢", { fontSize: '24px' }).setOrigin(0.5);
        this.scene.tweens.add({
            targets: icon, y: icon.y - 20, alpha: 0, duration: 800,
            onComplete: () => icon.destroy()
        });
    }

    updateAI(delta) {
        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 200 + Math.random() * 100;
            if (!this.currentTarget || !this.currentTarget.active) {
                this.currentTarget = this.findNearestEnemy();
            }
        }

        if (this.currentTarget && this.currentTarget.active) {
            this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
            this.updateFlipX();
        } else {
            this.followLeader();
        }
    }
}