import Unit from '../Unit';
import Phaser from 'phaser';

export default class Raccoon extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Raccoon';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        // 소환 스킬 플래그 (한 번만 사용)
        this.hasUsedSummonSkill = false;
        
        // 불굴 특성: 저체력 상태에서도 후퇴하지 않음
        this.isIndomitable = true;
    }

    update(time, delta) {
        // 불굴 특성: 저체력 후퇴 무시
        if (this.ai && this.isIndomitable) {
            this.ai.isLowHpFleeing = false;
        }
        
        super.update(time, delta);
    }

    // HP 20% 이하가 되면 스킬 자동 발동
    onTakeDamage() {
        if (!this.hasUsedSummonSkill && this.team === 'blue' && this.hp <= this.maxHp * 0.2) {
            this.hasUsedSummonSkill = true;
            this.activateSummonSkill();
        }
    }

    activateSummonSkill() {
        // "도와줘 친구들!" 텍스트 표시
        const text = this.scene.add.text(this.x, this.y - 40, "도와줘 친구들!", {
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#ffff00',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(100);

        this.scene.tweens.add({
            targets: text,
            y: text.y - 40,
            alpha: 0,
            duration: 2000,
            onComplete: () => text.destroy()
        });

        // 시각 효과: 마법 원형 범위
        // const circle = this.scene.add.circle(this.x, this.y, 10, 0xff00ff, 0.4);
        // circle.setDepth(50);
        // this.scene.tweens.add({
        //     targets: circle,
        //     radius: 120,
        //     alpha: 0,
        //     duration: 600,
        //     ease: 'Quad.easeOut',
        //     onComplete: () => circle.destroy()
        // });

        // 소환 효과 음성 (선택사항)
        if (this.scene.playHitSound && typeof this.scene.playHitSound === 'function') {
            // 사운드 재생 시간 조정 가능
        }

        // 너구리 2마리 소환
        this.scene.time.delayedCall(300, () => {
            this.spawnAllyRaccoons();
        });
    }

    spawnAllyRaccoons() {
        const unitSpawner = this.scene.unitSpawner;
        if (!unitSpawner) {
            console.warn('[Raccoon] unitSpawner is not available');
            return;
        }

        // 자신 주변의 2개 위치에 너구리 소환 (좌우 또는 위아래)
        const spawnPositions = [
            { x: this.x - 70, y: this.y },
            { x: this.x + 70, y: this.y }
        ];

        spawnPositions.forEach((pos, index) => {
            // 기본 너구리 스탯 준비 (소환된 너구리는 약간 약하게 설정)
            const stats = {
                role: 'Raccoon',
                hp: Math.floor(this.maxHp * 0.8), // 원본의 80%
                maxHp: Math.floor(this.maxHp * 0.8),
                attackPower: Math.floor(this.baseAttackPower * 0.8),
                moveSpeed: this.moveSpeed,
                defense: this.defense || 0,
                attackCooldown: this.attackCooldown || 500,
                attackRange: 50,
                killReward: Math.floor((this.killReward || 10) * 0.5),
                isIndomitable: true // 불굴 특성은 소환된 너구리에게도 적용
            };

            // 유닛 생성
            const newRaccoon = unitSpawner.createUnitInstance(
                pos.x, pos.y,
                'blue',
                this.targetGroup,
                stats,
                false
            );

            // 블루 팀에 추가
            this.scene.blueTeam.add(newRaccoon);

            // 소환된 너구리는 분신 스킬을 사용할 수 없도록 설정
            newRaccoon.hasUsedSummonSkill = true;

            // 소환 효과 애니메이션
            newRaccoon.setAlpha(0.3);
            this.scene.tweens.add({
                targets: newRaccoon,
                alpha: 1,
                duration: 400,
                ease: 'Power2.easeOut'
            });

            // 소환된 너구리에 표시 (선택사항)
            const nameText = this.scene.add.text(newRaccoon.x, newRaccoon.y - 50, '소환됨', {
                fontSize: '12px',
                color: '#00ff00',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0.5).setDepth(100);

            this.scene.tweens.add({
                targets: nameText,
                y: nameText.y - 20,
                alpha: 0,
                duration: 1500,
                onComplete: () => nameText.destroy()
            });
        });

        console.log(`[Raccoon] 2마리의 너구리 소환! (위치: ${spawnPositions.map(p => `(${p.x}, ${p.y})`).join(', ')})`);
    }
}