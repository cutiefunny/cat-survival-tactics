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
        }).setOrigin(0.5).setDepth(5000);

        this.scene.tweens.add({
            targets: text,
            y: text.y - 40,
            alpha: 0,
            duration: 2000,
            onComplete: () => text.destroy()
        });

        // 시각 효과: 마법 원형 범위
        const circle = this.scene.add.circle(this.x, this.y, 10, 0xff00ff, 0.4);
        circle.setDepth(4999);
        this.scene.tweens.add({
            targets: circle,
            radius: 120,
            alpha: 0,
            duration: 600,
            ease: 'Quad.easeOut',
            onComplete: () => circle.destroy()
        });

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
        let spawnPositions = [
            { x: this.x - 70, y: this.y },
            { x: this.x + 70, y: this.y }
        ];

        // 블록/벽 충돌 회피를 통한 위치 보정
        spawnPositions = spawnPositions.map(pos => this.findValidSpawnPosition(pos.x, pos.y));

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
            }).setOrigin(0.5).setDepth(5000);

            this.scene.tweens.add({
                targets: nameText,
                y: nameText.y - 20,
                alpha: 0,
                duration: 1500,
                onComplete: () => nameText.destroy()
            });
        });

        console.log(`[Raccoon] 2마리의 너구리 소환! (위치: ${spawnPositions.map(p => `(${Math.floor(p.x)}, ${Math.floor(p.y)})`).join(', ')})`);
    }

    // 소환 위치가 Walls나 Blocks 영역에 있는지 확인
    isPositionBlocked(x, y) {
        const radius = 25; // 유닛 크기 고려
        
        // wallObjectGroup 확인
        if (this.scene.wallObjectGroup) {
            for (let wall of this.scene.wallObjectGroup.getChildren()) {
                const bounds = wall.getBounds();
                // 원-사각형 충돌: 거리 기반 확인
                const closestX = Phaser.Math.Clamp(x, bounds.left, bounds.right);
                const closestY = Phaser.Math.Clamp(y, bounds.top, bounds.bottom);
                const distanceSq = (x - closestX) ** 2 + (y - closestY) ** 2;
                
                if (distanceSq < radius * radius) {
                    return true;
                }
            }
        }
        
        // blockObjectGroup 확인
        if (this.scene.blockObjectGroup) {
            for (let block of this.scene.blockObjectGroup.getChildren()) {
                const bounds = block.getBounds();
                const closestX = Phaser.Math.Clamp(x, bounds.left, bounds.right);
                const closestY = Phaser.Math.Clamp(y, bounds.top, bounds.bottom);
                const distanceSq = (x - closestX) ** 2 + (y - closestY) ** 2;
                
                if (distanceSq < radius * radius) {
                    return true;
                }
            }
        }
        
        return false;
    }

    // 유효한 소환 위치 찾기 (블록/벽 회피)
    findValidSpawnPosition(originalX, originalY) {
        // 원래 위치가 유효하면 그대로 반환
        if (!this.isPositionBlocked(originalX, originalY)) {
            return { x: originalX, y: originalY };
        }
        
        // 주변을 나선형으로 탐색하여 유효한 위치 찾기
        const maxDistance = 200;
        const step = 20;
        
        for (let distance = step; distance <= maxDistance; distance += step) {
            // 8방향 + 원형 탐색
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
                const testX = originalX + Math.cos(angle) * distance;
                const testY = originalY + Math.sin(angle) * distance;
                
                if (!this.isPositionBlocked(testX, testY)) {
                    console.log(`[Raccoon] 소환 위치 보정됨: (${Math.floor(originalX)}, ${Math.floor(originalY)}) -> (${Math.floor(testX)}, ${Math.floor(testY)})`);
                    return { x: testX, y: testY };
                }
            }
        }
        
        // 찾지 못하면 원래 위치 반환
        console.warn(`[Raccoon] 유효한 소환 위치를 찾지 못함. 원래 위치 사용: (${Math.floor(originalX)}, ${Math.floor(originalY)})`);
        return { x: originalX, y: originalY };
    }
}