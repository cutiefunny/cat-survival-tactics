import Unit from '../Unit';
import Phaser from 'phaser';

export default class Tanker extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Tanker';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        // [NEW] 탱커 스킬 설정 (10초 쿨타임)
        this.skillMaxCooldown = 10000;
        this.skillTimer = 0; // 시작하자마자 사용 가능
    }

    // [NEW] 도발(Taunt) 스킬 구현
    performSkill() {
        console.log("🛡️ Tanker uses TAUNT!");
        
        const tauntRadius = 200;
        const tauntRadiusSq = tauntRadius * tauntRadius;
        const enemies = this.targetGroup.getChildren();
        let tauntedCount = 0;

        // 1. 범위 내 적들의 타겟을 강제로 나로 변경
        enemies.forEach(enemy => {
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq <= tauntRadiusSq) {
                    enemy.currentTarget = this;
                    // 적의 AI가 즉시 반응하도록 thinkTimer를 0으로 만들거나, 
                    // 반대로 타겟 고정을 위해 thinkTimer를 늘릴 수도 있음.
                    // 여기서는 즉시 반응 유도.
                    // enemy.thinkTimer = 0; 
                    
                    // 시각적 효과 (적 머리 위에 !)
                    this.showTauntedEffect(enemy);
                    tauntedCount++;
                }
            }
        });

        // 2. 도발 시각 이펙트 (퍼져나가는 원)
        const circle = this.scene.add.circle(this.x, this.y, 10, 0xffff00, 0.3);
        this.scene.tweens.add({
            targets: circle,
            radius: tauntRadius,
            alpha: 0,
            duration: 500,
            onComplete: () => circle.destroy()
        });

        // 3. 플로팅 텍스트
        const text = this.scene.add.text(this.x, this.y - 40, "TAUNT!", {
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#ffff00',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
        
        this.scene.tweens.add({
            targets: text,
            y: text.y - 30,
            alpha: 0,
            duration: 1000,
            onComplete: () => text.destroy()
        });
    }

    showTauntedEffect(enemy) {
        const icon = this.scene.add.text(enemy.x, enemy.y - 30, "💢", { fontSize: '24px' }).setOrigin(0.5);
        this.scene.tweens.add({
            targets: icon,
            y: icon.y - 20,
            alpha: 0,
            duration: 800,
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