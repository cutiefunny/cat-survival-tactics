import Unit from '../Unit';
import Phaser from 'phaser';

export default class Healer extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        // 힐러 특화 스탯 오버라이드 (안전을 위해 조금 뒤에 위치하도록 유도)
        this.healPower = stats.attackPower || 10; 
        this.healRange = stats.skillRange || 200;
        this.safeDistance = 150; // 아군에게 붙을 거리
        
        // 쿨타임이 0으로 설정되어 들어오는 경우 기본값 부여
        if (this.skillMaxCooldown <= 0) this.skillMaxCooldown = 5000;
    }

    // [AI Override] 적이 아닌 '다친 아군'을 찾아 이동
    updateAI(delta) {
        this.thinkTimer -= delta;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 150 + Math.random() * 100;
            // 가장 HP가 낮은 아군을 타겟으로 잡음
            this.currentTarget = this.findLowestHpAlly();
        }

        // 스킬 쿨타임이 찼다면 아군 치유 시도
        this.tryUseSkill();

        if (this.isAvoiding) return;

        if (this.currentTarget && this.currentTarget.active) {
            // 타겟(아군)과의 거리 계산
            const dist = Phaser.Math.Distance.Between(this.x, this.y, this.currentTarget.x, this.currentTarget.y);
            
            // 너무 가까우면 멈추고, 멀면 따라감 (카이팅 대신 팔로우 로직)
            if (dist > this.safeDistance) {
                this.scene.physics.moveToObject(this, this.currentTarget, this.moveSpeed);
                this.updateFlipX();
            } else if (dist < this.safeDistance * 0.5) {
                // 너무 가까우면 살짝 뒤로 빠짐 (공간 확보)
                const angle = Phaser.Math.Angle.Between(this.currentTarget.x, this.currentTarget.y, this.x, this.y);
                this.scene.physics.velocityFromRotation(angle, this.moveSpeed * 0.5, this.body.velocity);
                this.updateFlipX();
            } else {
                this.setVelocity(0, 0);
            }
        } else {
            // 치료할 아군이 없으면 리더나 본대 근처로 복귀
            if (this.team === 'blue' && this.scene.playerUnit && this.scene.playerUnit.active && this.scene.playerUnit !== this) {
                const distToLeader = Phaser.Math.Distance.Between(this.x, this.y, this.scene.playerUnit.x, this.scene.playerUnit.y);
                if (distToLeader > 200) {
                     this.scene.physics.moveToObject(this, this.scene.playerUnit, this.moveSpeed);
                     this.updateFlipX();
                } else {
                    this.setVelocity(0, 0);
                }
            } else {
                this.setVelocity(0, 0);
            }
        }
    }

    // [Skill Override] 적 공격 대신 아군 광역 힐
    performSkill() {
        this.setTint(0x00ff00); // 힐러는 초록색 틴트
        this.isUsingSkill = true;
        
        const allies = (this.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        const rangeSq = this.healRange * this.healRange;
        let healedCount = 0;

        allies.forEach(ally => {
            if (ally.active && Phaser.Math.Distance.Squared(this.x, this.y, ally.x, ally.y) < rangeSq) {
                // 최대 체력을 넘지 않도록 회복
                if (ally.hp < ally.maxHp) {
                    ally.hp = Math.min(ally.maxHp, ally.hp + this.healPower * 2); 
                    ally.redrawHpBar();
                    
                    // 치유 이펙트 (간단한 트윈 애니메이션)
                    this.scene.tweens.add({
                        targets: ally,
                        alpha: 0.5,
                        yoyo: true,
                        duration: 100,
                        repeat: 1
                    });
                    healedCount++;
                }
            }
        });

        // 힐 이펙트 (자신 주변에 퍼지는 원)
        const healCircle = this.scene.add.circle(this.x, this.y, 10, 0x00ff00, 0.5);
        this.scene.tweens.add({
            targets: healCircle,
            radius: this.healRange,
            alpha: 0,
            duration: 500,
            onComplete: () => healCircle.destroy()
        });

        this.scene.time.delayedCall(500, () => {
            if(this.active) {
                this.isUsingSkill = false;
                this.resetVisuals();
            }
        });
    }

    // 기본 공격 로직(Attack)은 유지하거나, 약한 원거리 공격으로 오버라이드 할 수 있습니다.
    // 현재는 Unit.js의 기본 근접 공격을 따르지만, 
    // 필요하다면 여기서 findNearestEnemy()를 호출해 자기 방어 로직을 추가할 수 있습니다.
}