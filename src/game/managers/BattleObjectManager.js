import Phaser from 'phaser';
import { ROLE_BASE_STATS } from '../data/UnitData';

export default class BattleObjectManager {
    constructor(scene) {
        this.scene = scene;
        this.miceGroup = null;
    }

    create() {
        // 쥐 그룹 초기화
        this.miceGroup = this.scene.physics.add.group({
            collideWorldBounds: true,
            bounceX: 1,
            bounceY: 1
        });

        // 쥐 애니메이션 생성
        if (this.scene.textures.exists('mouse')) {
            const texture = this.scene.textures.get('mouse');
            const frameCount = texture.frameTotal;

            if (frameCount > 1 && !this.scene.anims.exists('mouse_run')) {
                this.scene.anims.create({
                    key: 'mouse_run',
                    frames: this.scene.anims.generateFrameNumbers('mouse', { start: 0, end: 1 }),
                    frameRate: 6,
                    repeat: -1
                });
            }
        }
    }

    // 랜덤 쥐 소환
    spawnMice() {
        if (!this.miceGroup) return;
        this.miceGroup.clear(true, true); 

        const count = Phaser.Math.Between(1, 2); 
        console.log(`🐁 [ObjectManager] Spawning ${count} mice...`);

        if (!this.scene.textures.exists('mouse')) {
            console.error("❌ Mouse texture missing! Skipping spawn.");
            return;
        }

        const padding = 100;
        const mapW = this.scene.mapWidth;
        const mapH = this.scene.mapHeight;

        for (let i = 0; i < count; i++) {
            let x, y;
            let attempts = 0;
            let validPosition = false;

            // 벽/장애물 제외한 위치 찾기
            while (!validPosition && attempts < 50) {
                attempts++;
                x = Phaser.Math.Between(padding, mapW - padding);
                y = Phaser.Math.Between(padding, mapH - padding);
                validPosition = true;

                if (this.scene.wallLayer) {
                    const tile = this.scene.wallLayer.getTileAtWorldXY(x, y);
                    if (tile && tile.index !== -1) validPosition = false;
                }
                if (validPosition && this.scene.blockLayer) {
                    const tile = this.scene.blockLayer.getTileAtWorldXY(x, y);
                    if (tile && tile.index !== -1) validPosition = false;
                }
                if (validPosition && this.scene.blockObjectGroup) {
                    const blocks = this.scene.blockObjectGroup.getChildren();
                    for (const block of blocks) {
                        if (block.getBounds().contains(x, y)) {
                            validPosition = false;
                            break;
                        }
                    }
                }
            }

            const mouse = this.miceGroup.create(x, y, 'mouse');
            mouse.setDisplaySize(30, 20);
            mouse.setFlipX(Phaser.Math.Between(0, 1) === 0); 
            
            if (this.scene.anims.exists('mouse_run')) {
                mouse.play('mouse_run');
            } else {
                mouse.setFrame(0);
            }
            
            mouse.setCollideWorldBounds(true);
            mouse.setBounce(1);
            
            this.changeMouseDirection(mouse);
        }
    }

    changeMouseDirection(mouse) {
        if (!mouse.active) return;
        
        const speed = 40; 
        const angle = Phaser.Math.Between(0, 360);
        const velocity = this.scene.physics.velocityFromAngle(angle, speed);
        
        mouse.setVelocity(velocity.x, velocity.y);
        mouse.setFlipX(velocity.x > 0); 

        mouse.nextMoveTime = this.scene.time.now + Phaser.Math.Between(1000, 3000);
    }

    updateMiceBehavior(time) {
        if (!this.miceGroup) return;

        this.miceGroup.children.iterate((mouse) => {
            if (mouse && mouse.active) {
                if (time > mouse.nextMoveTime) {
                    this.changeMouseDirection(mouse);
                }
                if (mouse.body.velocity.x === 0 && mouse.body.velocity.y === 0) {
                     this.changeMouseDirection(mouse);
                }
            }
        });
    }

    handleMouseConsumption(unit, mouse) {
        if (!unit.active || !mouse.active) return;

        console.log(`🍖 ${unit.role} ate a mouse!`);
        mouse.destroy();

        const healAmount = 100;
        
        if (unit.maxHp) {
            unit.hp = Math.min(unit.maxHp, unit.hp + healAmount);
            unit.redrawHpBar();
            
            if (unit.showEmote) {
                unit.showEmote(`HP +${healAmount}`, '#00ff00');
            }
            
            // 데이터 동기화
            if (unit.squadIndex !== undefined) {
                const squad = this.scene.registry.get('playerSquad');
                if (squad && squad[unit.squadIndex]) {
                    squad[unit.squadIndex].hp = unit.hp;
                    this.scene.registry.set('playerSquad', squad);
                }
            }
        }
    }

    // 외부에서 그룹에 접근하기 위한 Getter
    getGroup() {
        return this.miceGroup;
    }
}