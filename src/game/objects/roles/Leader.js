import Unit from '../Unit';
import Phaser from 'phaser';

export default class Leader extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader = true) {
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        this.role = 'Leader';
        
        // [FIX] 외부 설정이나 Config에서 잘못된 사거리가 넘어오더라도
        // Leader는 무조건 근접 공격(50)을 하도록 강제 설정
        this.attackRange = 50; 
    }

    performSkill() {
        console.log("🚩 Leader uses INSPIRE!");
        
        // [CHANGE] 설정값 사용
        const buffRadius = this.skillRange || 300; 
        const buffDuration = this.skillDuration || 10000;
        
        const buffRadiusSq = buffRadius * buffRadius;
        const allies = (this.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();

        allies.forEach(ally => {
            if (ally.active) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, ally.x, ally.y);
                if (distSq <= buffRadiusSq) {
                    this.applyBuff(ally, buffDuration);
                }
            }
        });

        const circle = this.scene.add.circle(this.x, this.y, 10, 0xffd700, 0.3);
        this.scene.tweens.add({
            targets: circle,
            radius: buffRadius,
            alpha: 0,
            duration: 600,
            onComplete: () => circle.destroy()
        });
    }

    applyBuff(unit, duration) {
        // [CHANGE] 설정값 사용 (Effect는 % 단위 정수)
        const effectPercent = (this.skillEffect || 10) / 100;
        const bonusDamage = Math.floor(unit.baseAttackPower * effectPercent);
        
        unit.attackPower += bonusDamage;

        this.scene.time.delayedCall(duration, () => {
            if (unit.active) {
                unit.attackPower -= bonusDamage;
                if (unit.attackPower < unit.baseAttackPower) unit.attackPower = unit.baseAttackPower;
            }
        });

        const icon = this.scene.add.text(unit.x, unit.y - 40, "⏫", { 
            fontSize: '24px', color: '#ffd700', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5);

        this.scene.tweens.add({
            targets: icon, y: icon.y - 40, alpha: 0, duration: 1000, ease: 'Power1',
            onComplete: () => icon.destroy() 
        });
    }
}