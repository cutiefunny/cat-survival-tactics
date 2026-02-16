import Unit from '../Unit';

export default class Wawa extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Wawa';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);

        // 광폭화 해제 시 복구하기 위해 원래 스탯 저장
        this.originalDefense = this.defense;
        this.originalAttackCooldown = this.attackCooldown;
        
        this.isBerserk = false;
    }

    update(time, delta) {
        super.update(time, delta);

        if (!this.active || this.isDying) return;

        // 체력 비율 계산
        const hpRatio = this.hp / this.maxHp;

        // 체력이 20% 이하이고 아직 광폭화 상태가 아니라면 발동
        if (hpRatio <= 0.2) {
            if (!this.isBerserk) {
                this.activateBerserkMode();
            }
        } 
        // 체력이 20% 초과로 회복되면(힐 등) 광폭화 해제
        else {
            if (this.isBerserk) {
                this.deactivateBerserkMode();
            }
        }
    }

    activateBerserkMode() {
        this.isBerserk = true;
        
        // 특수 능력 적용: 방어력 20, 공격 속도(CD) 100ms
        this.defense = 20;
        this.attackCooldown = 100;

        // 시각 효과: 빨간색 변신 및 이모티콘
        this.setTint(0xff0000);
        if (this.showEmote) this.showEmote("😡", "#ff0000");
        
        // 크기 살짝 키우기 (선택적 연출)
        this.scene.tweens.killTweensOf(this);
        this.scene.tweens.add({
            targets: this,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 200,
            yoyo: false // 커진 상태 유지
        });
    }

    deactivateBerserkMode() {
        this.isBerserk = false;

        // 능력치 복구
        this.defense = this.originalDefense;
        this.attackCooldown = this.originalAttackCooldown;

        // 시각 효과 복구
        this.resetVisuals();
    }

    // Unit.js의 기본 resetVisuals를 오버라이드하여
    // 피격/공격 후에도 광폭화 색상(빨강)이 유지되도록 함
    resetVisuals() {
        super.resetVisuals();
        
        if (this.isBerserk) {
            this.setTint(0xff0000);
        }
    }
}