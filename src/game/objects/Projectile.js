import Phaser from 'phaser';

export default class Projectile extends Phaser.Physics.Arcade.Image {
    constructor(scene, x, y, target, attackerData) {
        super(scene, x, y, 'bullet');

        this.scene = scene;
        this.target = target;
        // 공격자의 정보(데미지, 넉백 힘, 팀 등)를 투사체가 담고 날아갑니다.
        this.attackerData = attackerData; 
        
        this.speed = 600; // 투사체 속도
        this.bornTime = scene.time.now;
        this.lifespan = 2000; // 2초 후 자동 소멸 (안전장치)

        scene.add.existing(this);
        scene.physics.add.existing(this);

        // 팀에 따라 색상 구분
        this.setTint(attackerData.team === 'blue' ? 0x8888ff : 0xff8888);
        this.setScale(1.5); // 크기 조정

        // 목표를 향해 발사
        scene.physics.moveToObject(this, target, this.speed);
        // 목표 방향 바라보기
        this.rotation = Phaser.Math.Angle.Between(x, y, target.x, target.y);
    }

    update(time, delta) {
        // 안전장치: 너무 오래 살아남거나 타겟이 사라지면 파괴
        if (time > this.bornTime + this.lifespan) {
            this.destroy();
            return;
        }
        if (!this.target.active) {
             this.destroy();
        }
    }
}