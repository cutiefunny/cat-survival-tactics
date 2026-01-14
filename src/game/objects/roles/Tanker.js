import Unit from '../Unit';
import Phaser from 'phaser';

export default class Tanker extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Tanker';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    // [변경 1] updateAI 메서드 삭제
    // -> 이제 Unit.js -> UnitAI.js의 로직을 사용하여 'Sticky Targeting(타겟 유지)' 및 'Priority System'이 적용됩니다.
    // -> 이동 또한 'moveToTargetSmart'(길찾기)를 사용하게 되어 벽에 끼이는 현상이 줄어듭니다.

    // [변경 2] 스킬 사용 조건(적이 2명 이상)을 여기서 체크
    tryUseSkill() {
        // 쿨타임 체크는 부모(Unit)가 해주지만, '상황' 체크는 여기서 먼저 함
        if (this.skillTimer <= 0) {
            const nearbyEnemies = this.countEnemiesInRange(this.skillRange || 200);
            if (nearbyEnemies >= 2) {
                super.tryUseSkill(); // 조건 만족 시 부모 메서드 호출 -> performSkill 실행
            }
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
        // console.log("🛡️ [Tanker] Taunt Skill Activated!");
        
        this.isUsingSkill = true; 
        this.stop(); 
        this.setTexture(this.textureKey); 
        this.setFrame(5); // Skill Motion

        // 스킬 모션 종료 처리
        this.scene.time.delayedCall(500, () => {
            if(this.active && !this.isDying) {
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
            if (enemy.active && !enemy.isDying) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq <= tauntRadiusSq) {
                    // [핵심] 적의 타겟을 나(Tanker)로 강제 변경 및 도발 타이머 설정
                    if (enemy.ai) {
                        enemy.ai.currentTarget = this;
                        enemy.ai.provokedTimer = 5000; // 5초간 타겟 고정
                    } else {
                        enemy.currentTarget = this; 
                    }
                    this.showTauntedEffect(enemy);
                    tauntedCount++;
                }
            }
        });

        // 시각 효과 (Visual Effect)
        const circle = this.scene.add.circle(this.x, this.y, 10, 0xffff00, 0.3);
        this.scene.tweens.add({ 
            targets: circle, 
            radius: tauntRadius, 
            alpha: 0, 
            duration: 500, 
            onComplete: () => circle.destroy() 
        });

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
}