import Unit from '../Unit';
import Phaser from 'phaser';

export default class Leader extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader = true) {
        // [Fixed] stats를 그대로 부모에게 전달하여 UnitData나 Config 설정을 따르도록 수정
        // 이전처럼 생성자 내부에서 this.attackRange를 강제로 덮어쓰지 않습니다.
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        // this.role = 'Leader'; // 부모 클래스에서 stats.role로 이미 설정되므로 중복 제거
    }

    performSkill() {
        console.log("🚩 Leader uses INSPIRE!");
        
        // [Check] this.skillRange 역시 Unit 생성자에서 stats.skillRange로 초기화된 값을 사용
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
        // [Check] 스킬 효과값 사용
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