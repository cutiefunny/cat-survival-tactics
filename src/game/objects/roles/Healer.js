import Unit from '../Unit';
import Phaser from 'phaser';

export default class Healer extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader = false) {
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);

        this.role = 'Healer';
        
        // 힐러 스탯
        this.healPower = stats.attackPower || 15; 
        this.healCooldown = stats.attackCooldown || 2000; 
        this.healRange = 100;
        this.healTimer = 0;
        this.targetAlly = null;
        
        // [AI] 안전 거리 설정
        this.dangerRadius = 200; // 이 거리 안의 적만 신경 씀
        
        if (this.team === 'blue' && !this.isLeader) {
            this.setTint(0x88ff88);
        }
    }

    updateAI(delta) {
        this.thinkTimer -= delta;
        if (this.healTimer > 0) this.healTimer -= delta;

        // 1. [생존] HP 20% 미만이면 적 반대 방향으로 도망 + 자가회복
        if (this.hp < this.maxHp * 0.2) {
            this.runAway(delta);
            this.trySelfHeal();
            return;
        }

        // 2. [탐색] 치료할 아군 찾기
        if (this.thinkTimer <= 0) {
            this.thinkTimer = 300 + Math.random() * 200;
            this.targetAlly = this.findInjuredAlly();
        }

        // 3. [이동 및 치유]
        if (this.targetAlly && this.targetAlly.active) {
            const dist = Phaser.Math.Distance.Between(this.x, this.y, this.targetAlly.x, this.targetAlly.y);
            
            // 물리적 벽 충돌 회피 중이면 그 로직 우선 (Unit.js)
            if (this.isAvoiding) return;

            if (dist <= this.healRange) {
                // 사거리 안: 멈춰서 힐
                this.setVelocity(0, 0);
                this.tryHealAlly(this.targetAlly);
            } else {
                // [이동] 상황에 따라 직진할지 우회할지 결정
                this.moveSafelyTo(this.targetAlly);
            }
        } else {
            // 할 일 없으면 대열 복귀
            this.updateFormationFollow(delta);
        }
    }

    // [Improved Logic] 조건부 우회 접근
    moveSafelyTo(target) {
        // 1. 기본 목표 벡터 (아군을 향한 직진)
        const distToAlly = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
        const goalDir = new Phaser.Math.Vector2(target.x - this.x, target.y - this.y).normalize();

        // 2. 위협 요소 계산 (경로를 막고 있는 적만 선별)
        const repulsion = new Phaser.Math.Vector2(0, 0);
        const enemies = this.targetGroup.getChildren();
        let blockingThreats = 0;

        // 아군을 향하는 각도 (Radian -> Degree)
        const angleToAlly = Phaser.Math.RadToDeg(Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y));

        for (const enemy of enemies) {
            if (!enemy.active) continue;

            const distToEnemy = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
            
            // [Filter 1] 위험 반경 밖의 적은 무시
            if (distToEnemy > this.dangerRadius) continue;

            // [Filter 2] 아군보다 멀리 있는 적은 무시 (아군 뒤에 있는 적)
            if (distToEnemy > distToAlly) continue;

            // [Filter 3] 각도 체크: 내 진행 방향(아군 방향) 전방 90도(+/- 45도) 내에 있는가?
            const angleToEnemy = Phaser.Math.RadToDeg(Phaser.Math.Angle.Between(this.x, this.y, enemy.x, enemy.y));
            const angleDiff = Math.abs(Phaser.Math.Angle.ShortestBetween(angleToAlly, angleToEnemy));

            if (angleDiff < 60) { // 전방 120도 부채꼴 안에 적이 있다면 "경로가 막힘"으로 간주
                // 적으로부터 나를 향하는 벡터 (밀어내는 힘)
                const pushDir = new Phaser.Math.Vector2(this.x - enemy.x, this.y - enemy.y).normalize();
                
                // 가까울수록 더 강하게 밀어냄
                const weight = (1 - distToEnemy / this.dangerRadius) * 4.0; // 가중치 강화
                pushDir.scale(weight);
                
                repulsion.add(pushDir);
                blockingThreats++;
            }
        }

        // 3. 벡터 합성
        if (blockingThreats > 0) {
            // 길이 막혔을 때: 인력 + 척력 합성 (우회)
            goalDir.add(repulsion).normalize();
        } 
        // else: 길이 뚫려있으면 repulsion(0,0) 이므로 그냥 goalDir(직진) 사용

        // 4. 이동 적용
        this.setVelocity(goalDir.x * this.moveSpeed, goalDir.y * this.moveSpeed);
        this.updateFlipX();
    }

    findInjuredAlly() {
        const myGroup = (this.team === 'blue') ? this.scene.blueTeam : this.scene.redTeam;
        let lowestPct = 1.0;
        let target = null;

        myGroup.getChildren().forEach(ally => {
            if (ally.active && ally !== this && ally.hp < ally.maxHp) {
                const pct = ally.hp / ally.maxHp;
                if (pct < lowestPct) {
                    lowestPct = pct;
                    target = ally;
                }
            }
        });
        return target;
    }

    trySelfHeal() {
        if (this.healTimer <= 0) {
            this.healTimer = this.healCooldown;
            this.performHeal(this);
        }
    }

    tryHealAlly(target) {
        if (this.healTimer <= 0) {
            this.healTimer = this.healCooldown;
            this.performHeal(target);
        }
    }

    performHeal(target) {
        target.hp = Math.min(target.hp + this.healPower, target.maxHp);
        target.redrawHpBar();

        const healText = this.scene.add.text(target.x, target.y - 40, `+${this.healPower}`, {
            font: '16px monospace', fill: '#00ff00', stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(200);
        
        this.scene.tweens.add({
            targets: healText, y: target.y - 80, alpha: 0, duration: 1000,
            onComplete: () => healText.destroy()
        });

        this.setTint(0x00ff00);
        this.scene.time.delayedCall(200, () => {
            if(this.active) this.resetVisuals();
        });
    }
    
    tryUseSkill() {
        // No offensive skill
    }
}