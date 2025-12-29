import Unit from '../Unit'; // 위에서 만든 Base Class
import Phaser from 'phaser';

export default class Shooter extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        // [설정] 슈터 전용 기본값 강제
        stats.role = 'Shooter';
        stats.attackRange = stats.attackRange || 250;
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
        
        // 슈터 식별 색상
        if (!isLeader && team === 'blue') this.setTint(0xff88ff);
    }

    // [Override] 슈터 전용 AI 로직
    updateAI(delta) {
        this.thinkTimer -= delta;

        // 1. 타겟 탐색 (주기적)
        if (this.thinkTimer <= 0) {
            const { thinkTimeMin, thinkTimeVar } = this.aiConfig.common || { thinkTimeMin: 150, thinkTimeVar: 100 };
            this.thinkTimer = thinkTimeMin + Math.random() * thinkTimeVar;

            if (!this.currentTarget || !this.currentTarget.active) {
                this.currentTarget = this.findNearestEnemy();
            }
            // 가끔 약한 적 찾기
            if (Math.random() < 0.2) {
                const weak = this.findWeakestEnemy();
                if (weak) this.currentTarget = weak;
            }
        }

        // 2. 이동 실행 (매 프레임)
        this.executeMovement();
        
        // 3. 시선 처리 (타겟 고정 - Strafing)
        this.updateShooterLook();
    }

    executeMovement() {
        const target = this.currentTarget;

        // 타겟 없으면 배회
        if (!target || !target.active) {
            this.setVelocity(0, 0); // 혹은 roamBattlefield() 호출
            return;
        }

        const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
        const kiteDist = this.aiConfig.shooter?.kiteDistance || 200;
        const atkRange = this.attackRange;

        // 1. 도망 (너무 가깝거나 피격 시)
        if (dist < kiteDist || this.fleeTimer > 0) {
            this.runTowardsSafety();
        }
        // 2. 접근 (사거리 밖)
        else if (dist > atkRange) {
            const pos = this.calculateShootingPosition(target);
            this.scene.physics.moveTo(this, pos.x, pos.y, this.moveSpeed);
        }
        // 3. 사격 위치 (정지)
        else {
            this.setVelocity(0, 0);
        }
    }

    updateShooterLook() {
        // 슈터는 이동 방향보다 타겟을 보는 것이 우선
        const isBlue = this.team === 'blue';
        if (this.currentTarget && this.currentTarget.active) {
            if (this.currentTarget.x < this.x) this.setFlipX(isBlue ? false : true);
            else this.setFlipX(isBlue ? true : false);
        } else {
            // 타겟 없으면 이동 방향
            super.updateFlipX();
        }
    }

    calculateShootingPosition(target) {
        let angle;
        // 적 뒤쪽이나 측면 노리기
        if (target.body && target.body.velocity.length() > 10) {
            angle = Math.atan2(target.body.velocity.y, target.body.velocity.x) + Math.PI;
            angle += (Math.random() - 0.5) * 0.5;
        } else {
            const angleToMe = Phaser.Math.Angle.Between(target.x, target.y, this.x, this.y);
            angle = angleToMe + (Math.random() > 0.5 ? 0.5 : -0.5);
        }
        const dist = this.attackRange * 0.9;
        return {
            x: target.x + Math.cos(angle) * dist,
            y: target.y + Math.sin(angle) * dist
        };
    }

    onTakeDamage() {
        // 맞으면 잠깐 도망
        this.fleeTimer = 500;
    }
}