import Unit from '../Unit';
import Phaser from 'phaser';

export default class Leader extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Leader';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        this.skillMaxCooldown = 30000;
        this.skillTimer = 0; 
    }

    performSkill() {
        console.log("🚩 Leader uses INSPIRE!");
        
        const buffRadius = 300;
        const buffRadiusSq = buffRadius * buffRadius;
        const allies = (this.team === 'blue') ? this.scene.blueTeam.getChildren() : this.scene.redTeam.getChildren();
        const buffDuration = 10000; // 실제 버프 지속 시간 (10초)

        // 1. 범위 내 아군에게 버프 적용
        allies.forEach(ally => {
            if (ally.active) {
                const distSq = Phaser.Math.Distance.Squared(this.x, this.y, ally.x, ally.y);
                if (distSq <= buffRadiusSq) {
                    this.applyBuff(ally, buffDuration);
                }
            }
        });

        // 2. 리더 주변 파동 효과 (시각적 피드백)
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
        // [Logic] 실제 능력치 변화 (10초 유지)
        const bonusDamage = Math.floor(unit.baseAttackPower * 0.1);
        unit.attackPower += bonusDamage;

        // 10초 뒤 능력치 원상복구
        this.scene.time.delayedCall(duration, () => {
            if (unit.active) {
                unit.attackPower -= bonusDamage;
                // 안전장치: 기본 공격력보다 낮아지지 않게 보정
                if (unit.attackPower < unit.baseAttackPower) unit.attackPower = unit.baseAttackPower;
            }
        });

        // [Visual] 버프 표시 아이콘 (1초만 보이고 사라짐)
        const icon = this.scene.add.text(unit.x, unit.y - 40, "⏫", { 
            fontSize: '24px', 
            color: '#ffd700', // 금색
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        // 위로 떠오르며 투명해짐 (1초 컷)
        this.scene.tweens.add({
            targets: icon,
            y: icon.y - 40, // 위로 이동
            alpha: 0,       // 투명해짐
            duration: 1000, // 1초 지속
            ease: 'Power1',
            onComplete: () => icon.destroy() // 완전히 제거
        });
    }
}