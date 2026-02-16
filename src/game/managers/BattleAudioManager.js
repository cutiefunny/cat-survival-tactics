/**
 * BattleAudioManager
 * 전투 씬의 모든 오디오 관련 기능 관리
 * - BGM 로딩 및 재생
 * - 효과음 재생 (공격, 사망 등)
 */

import stage1BgmFile from '../../assets/sounds/stage1_bgm.mp3';
import level1 from '../../assets/sounds/level1.mp3';
import level2 from '../../assets/sounds/level2.mp3';
import level3 from '../../assets/sounds/level3.mp3';
import level4 from '../../assets/sounds/level4.mp3';
import level6 from '../../assets/sounds/level6.mp3';
import hit1 from '../../assets/sounds/Hit1.wav';
import hit2 from '../../assets/sounds/Hit2.wav';
import hit3 from '../../assets/sounds/Hit3.wav';
import ouch1 from '../../assets/sounds/Ouch1.mp3';
import ouch2 from '../../assets/sounds/Ouch2.mp3';

const BGM_SOURCES = {
    'stage1_bgm': stage1BgmFile,
    'level1': level1,
    'level2': level2,
    'level3': level3,
    'level4': level4,
    'level6': level6,
    'default': stage1BgmFile
};

export default class BattleAudioManager {
    constructor(scene) {
        this.scene = scene;
        this.bgmKey = 'default';
    }

    /**
     * 오디오 에셋 프리로드
     * @param {string} bgmKey - 로드할 BGM 키
     */
    preload(bgmKey = 'default') {
        this.bgmKey = bgmKey;
        
        const bgmFile = BGM_SOURCES[bgmKey] || BGM_SOURCES['default'];
        if (bgmFile) {
            this.scene.load.audio(bgmKey, bgmFile);
        } else {
            this.scene.load.audio('default', BGM_SOURCES['default']);
        }

        // 효과음 로드
        this.scene.load.audio('hit1', hit1);
        this.scene.load.audio('hit2', hit2);
        this.scene.load.audio('hit3', hit3);
        this.scene.load.audio('ouch1', ouch1);
        this.scene.load.audio('ouch2', ouch2);
    }

    /**
     * BGM 재생 시작
     * @param {string} playKey - 재생할 BGM 키
     * @param {number} volume - 볼륨 (0~1)
     */
    playBgm(playKey, volume = 0.5) {
        if (!this.scene.cache.audio.exists(playKey)) {
            playKey = 'default';
        }
        this.scene.playBgm(playKey, volume);
    }

    /**
     * 랜덤 타격 사운드 재생
     */
    playHitSound() {
        const hits = ['hit1', 'hit2', 'hit3'];
        const key = Phaser.Math.RND.pick(hits);
        if (this.scene.sound && this.scene.cache.audio.exists(key)) {
            this.scene.sound.play(key, { 
                volume: 0.4, 
                detune: Phaser.Math.Between(-100, 100) 
            });
        }
    }

    /**
     * 랜덤 사망 사운드 재생
     */
    playDieSound() {
        const dieSounds = ['ouch1', 'ouch2'];
        const key = Phaser.Math.RND.pick(dieSounds);
        if (this.scene.sound && this.scene.cache.audio.exists(key)) {
            this.scene.sound.play(key, { 
                volume: 0.6, 
                detune: Phaser.Math.Between(-100, 100) 
            });
        }
    }

    /**
     * BGM 정지
     */
    stopBgm() {
        if (this.scene.bgm) {
            this.scene.bgm.stop();
        }
    }
}
