import Phaser from 'phaser';

export default class CombatManager {
    constructor(scene) {
        this.scene = scene;
    }

    setupColliders(group1, group2) {
        this.scene.physics.add.collider(group1, group2, this.handleCombat, null, this);
    }

    checkBattleDistance(blueTeam, redTeam) {
        const thresholdSq = 600 * 600;
        let closestDistSq = Infinity;
        const blueUnits = blueTeam.getChildren();
        const redUnits = redTeam.getChildren();

        for (let b = 0; b < blueUnits.length; b++) {
            for (let r = 0; r < redUnits.length; r++) {
                if (blueUnits[b].active && redUnits[r].active) {
                    const dSq = Phaser.Math.Distance.Squared(blueUnits[b].x, blueUnits[b].y, redUnits[r].x, redUnits[r].y);
                    if (dSq < closestDistSq) closestDistSq = dSq;
                    if (closestDistSq < thresholdSq) {
                        return true; 
                    }
                }
            }
        }
        return false;
    }

    handleRangedAttacks(groups) {
        for (const group of groups) {
            const units = group.getChildren(); 
            for (const unit of units) {
                if (unit.active && unit.attackRange > 60 && !unit.isLowHpFleeing) {
                    const target = unit.currentTarget;
                    if (target && target.active) {
                        const distSq = Phaser.Math.Distance.Squared(unit.x, unit.y, target.x, target.y);
                        const rangeSq = unit.attackRange * unit.attackRange;
                        if (distSq <= rangeSq) {
                            this.performAttack(unit, target);
                        }
                    }
                }
            }
        }
    }

    handleCombat(unit1, unit2) {
        if (this.scene.isGameOver || !this.scene.battleStarted) return;
        if (unit1.team === unit2.team) return;

        this.performAttack(unit1, unit2);
        this.performAttack(unit2, unit1);
    }

    performAttack(attacker, defender) {
        if (!attacker.active || !defender.active || defender.isDying) return;
        
        if (attacker.isLowHpFleeing) return;

        const now = this.scene.time.now;
        
        if (now > attacker.lastAttackTime + attacker.attackCooldown) {
            
            // [New] 클래스별 Miss 확률 적용
            // 유닛에게 설정된 missChance 사용 (없으면 기본 2%)
            const missProb = (attacker.missChance !== undefined) ? attacker.missChance : 0.02;

            if (Math.random() < missProb) {
                // 쿨타임과 공격 모션은 소모 (헛손질)
                attacker.lastAttackTime = now;
                attacker.triggerAttackVisuals();

                // "MISS" 텍스트 표시
                if (defender.showEmote) {
                    defender.showEmote("MISS", "#aaaaaa");
                }
                
                // 데미지 적용 없이 종료
                return;
            }

            // [New] 백어택 판정 로직: 뒤에서 맞으면 데미지 1.5배
            let damageMultiplier = 1.0;
            
            const isFacingRight = defender.flipX;
            const isAttackerOnLeft = attacker.x < defender.x;
            const isAttackerOnRight = attacker.x > defender.x;

            if ((isFacingRight && isAttackerOnLeft) || (!isFacingRight && isAttackerOnRight)) {
                damageMultiplier = 1.5;
            }

            // 데미지 적용
            defender.takeDamage(attacker.attackPower * damageMultiplier);
            
            attacker.lastAttackTime = now;
            attacker.triggerAttackVisuals();
            
            if (this.scene.playHitSound) {
                this.scene.playHitSound();
            }
            
            if (!defender.active || !defender.body || defender.isDying) return;

            const angle = Phaser.Math.Angle.Between(attacker.x, attacker.y, defender.x, defender.y);
            const knockbackForce = (attacker.attackRange > 60) ? 10 : 40; 
            defender.body.velocity.x += Math.cos(angle) * knockbackForce;
            defender.body.velocity.y += Math.sin(angle) * knockbackForce;
        }
    }
}