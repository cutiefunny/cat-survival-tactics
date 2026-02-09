/**
 * BattleAssetLoader
 * 전투 씬의 에셋 로딩 관리
 * - 유닛 스프라이트시트
 * - 맵 타일셋
 * - 기타 리소스
 */

import leaderSheet from '../../assets/units/leader.png';
import dogSheet from '../../assets/units/dog.png';
import raccoonSheet from '../../assets/units/raccoon.png';
import wawaSheet from '../../assets/units/wawa.png';
import shooterSheet from '../../assets/units/shooter.png';
import tankerSheet from '../../assets/units/tanker.png';
import runnerSheet from '../../assets/units/runner.png';
import healerSheet from '../../assets/units/healer.png';
import normalSheet from '../../assets/units/normal.png';
import bossSheet from '../../assets/units/boss.png';

// [New] Daiso 아이템 아이콘 import
import catnipIcon from '../../assets/items/catnip.png';
import ciaoIcon from '../../assets/items/ciao.png';
import partyMixIcon from '../../assets/items/partyMix.png';

export default class BattleAssetLoader {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 모든 유닛 스프라이트시트 로드
     */
    loadUnitSprites() {
        const sheetConfig = { frameWidth: 100, frameHeight: 100 };
        
        this.scene.load.spritesheet('leader', leaderSheet, sheetConfig);
        this.scene.load.spritesheet('dog', dogSheet, sheetConfig);
        this.scene.load.spritesheet('raccoon', raccoonSheet, sheetConfig);
        this.scene.load.spritesheet('wawa', wawaSheet, sheetConfig);
        this.scene.load.spritesheet('shooter', shooterSheet, sheetConfig);
        this.scene.load.spritesheet('tanker', tankerSheet, sheetConfig);
        this.scene.load.spritesheet('runner', runnerSheet, sheetConfig);
        this.scene.load.spritesheet('healer', healerSheet, sheetConfig);
        this.scene.load.spritesheet('normal', normalSheet, sheetConfig);
        
        if (bossSheet) {
            this.scene.load.spritesheet('boss', bossSheet, sheetConfig);
        }
    }

    /**
     * 쥐 및 기타 오브젝트 스프라이트 로드
     */
    loadObjectSprites() {
        this.scene.load.spritesheet('mouse', 'images/mouse.png', { 
            frameWidth: 100, 
            frameHeight: 65 
        });
    }

    /**
     * Daiso 아이템 아이콘 로드
     */
    loadDaisoItemIcons() {
        this.scene.load.image('icon_catnip', catnipIcon);
        this.scene.load.image('icon_ciao', ciaoIcon);
        this.scene.load.image('icon_partyMix', partyMixIcon);
    }

    /**
     * 모든 필요한 에셋 로드
     */
    preloadAll() {
        this.loadUnitSprites();
        this.loadObjectSprites();
        this.loadDaisoItemIcons();
    }

    /**
     * 유닛 애니메이션 생성
     */
    createUnitAnimations() {
        const unitTextures = [
            'leader', 'dog', 'raccoon', 'tanker', 
            'shooter', 'runner', 'healer', 'normal', 'wawa'
        ];

        unitTextures.forEach(key => {
            if (this.scene.textures.exists(key) && !this.scene.anims.exists(`${key}_walk`)) {
                const frameRate = (key === 'healer') ? 3 : 6;
                this.scene.anims.create({
                    key: `${key}_walk`,
                    frames: this.scene.anims.generateFrameNumbers(key, { frames: [1, 2] }),
                    frameRate: frameRate,
                    repeat: -1
                });
            }
        });
    }
}
