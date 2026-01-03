import Unit from '../Unit';
import Phaser from 'phaser';

export default class Tanker extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Tanker';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }

    performSkill() {
        console.log("🛡️ [Tanker] performSkill START");
        
        // [Fix] 'tanker_haak' 텍스처 체크 로직 제거
        // 이미 로드된 'tanker' 스프라이트 시트의 6번째 프레임(Index 5)을 사용합니다.

        // 1. 상태 변경 및 애니메이션 정지
        this.isUsingSkill = true; 
        this.stop(); // 현재 재생 중인 애니메이션 정지

        // 2. 텍스처 유지 및 프레임 변경 (스킬 모션)
        // Unit.js에서 할당된 this.textureKey('tanker')를 그대로 사용
        this.setTexture(this.textureKey); 
        this.setFrame(5); // 스킬 이미지 프레임 (Index 5)

        // 3. 스킬 종료 후 복구
        this.scene.time.delayedCall(500, () => {
            console.log("🛡️ [Tanker] Skill Effect End. Restoring...");
            if(this.active) {
                this.isUsingSkill = false;
                
                // 원래 텍스처로 복구 (Unit.js에 저장된 키 사용)
                this.setTexture(this.textureKey);
                
                this.resetVisuals();
            }
        });

        // 4. 도발(Taunt) 로직 적용
        const tauntRadius = this.skillRange || 200;
        const tauntRadiusSq = tauntRadius * tauntRadius;
        const enemies = this.targetGroup.getChildren();

        enemies.forEach(enemy => {
            if (enemy.active) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
                if (distSq <= tauntRadiusSq) {
                    enemy.currentTarget = this; // 적의 타겟을 나(Tanker)로 강제 변경
                    this.showTauntedEffect(enemy);
                }
            }
        });

        // 시각 효과 (노란색 파동)
        const circle = this.scene.add.circle(this.x, this.y, 10, 0xffff00, 0.3);
        this.scene.tweens.add({
            targets: circle,
            radius: tauntRadius,
            alpha: 0,
            duration: 500,
            onComplete: () => circle.destroy()
        });

        // 텍스트 효과
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
            
            // [Modified] 타겟 고정 해제: 현재 타겟 유무와 상관없이 항상 가장 가까운 적을 새로 탐색
            this.currentTarget = this.findNearestEnemy();
        }

        if (this.currentTarget && this.currentTarget.active) {
            this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
            this.updateFlipX();
        } else {
            this.followLeader();
        }
    }
}