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

    // [Optimization] 새로운 배열을 만들지 않고 그룹을 직접 순회
    handleRangedAttacks(groups) {
        for (const group of groups) {
            const units = group.getChildren(); // 참조만 가져옴
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
        if (!attacker.active || !defender.active) return;
        
        if (attacker.isLowHpFleeing) return;

        const now = this.scene.time.now;
        
        if (now > attacker.lastAttackTime + attacker.attackCooldown) {
            defender.takeDamage(attacker.attackPower);
            attacker.lastAttackTime = now;
            attacker.triggerAttackVisuals();
            
            if (attacker.role === 'Shooter' && defender.active) {
                this.scene.tweens.add({ targets: defender, x: '+=3', duration: 30, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
            }
            
            if (!defender.active || !defender.body) return;
            const angle = Phaser.Math.Angle.Between(attacker.x, attacker.y, defender.x, defender.y);
            const knockbackForce = (attacker.attackRange > 60) ? 10 : 40; 
            defender.body.velocity.x += Math.cos(angle) * knockbackForce;
            defender.body.velocity.y += Math.sin(angle) * knockbackForce;
        }
    }
}