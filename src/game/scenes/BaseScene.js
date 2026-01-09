import Phaser from 'phaser';

export default class BaseScene extends Phaser.Scene {
    constructor(key) {
        super({ key: key });
        this.bgm = null;
    }

    create() {
        // 공통 리사이즈 이벤트 리스너 등록
        this.scale.on('resize', (gameSize, baseSize, displaySize, previousWidth, previousHeight) => {
            if (this.handleResize) {
                this.handleResize(gameSize);
            }
        }, this);
    }

    /**
     * BGM을 안전하게 재생합니다 (브라우저 정책 대응 및 음소거 설정 반영)
     * @param {string} key - 재생할 오디오 키
     * @param {number} volume - 볼륨 (기본 0.5)
     */
    playBgm(key, volume = 0.5) {
        // 기존 BGM 정지
        if (this.bgm) {
            this.bgm.stop();
        }
        this.sound.stopAll();

        // 오디오 키 유효성 검사
        if (!this.cache.audio.exists(key)) {
            console.warn(`⚠️ [BaseScene] Audio key '${key}' not found.`);
            return;
        }

        const isMuted = this.registry.get('isBgmMuted') || false;
        
        console.log(`🎵 [BaseScene] Playing BGM: ${key}`);
        this.bgm = this.sound.add(key, { loop: true, volume: volume });
        this.bgm.setMute(isMuted);

        // 브라우저 오디오 정책(Autoplay Policy) 대응
        if (this.sound.locked) {
            this.sound.once('unlocked', () => {
                if (this.bgm && !this.bgm.isPlaying) {
                    this.bgm.play();
                }
            });
        } else {
            this.bgm.play();
        }
    }

    /**
     * 현재 재생 중인 BGM의 음소거 여부를 토글합니다.
     * @returns {boolean} 현재 음소거 상태
     */
    toggleBgmMute() {
        const isMuted = this.registry.get('isBgmMuted') || false;
        const newState = !isMuted;
        
        this.registry.set('isBgmMuted', newState);
        
        if (this.bgm) {
            this.bgm.setMute(newState);
        }
        
        console.log(`🔇 [BaseScene] Mute Toggled: ${newState}`);
        return newState;
    }

    stopBgm() {
        if (this.bgm) {
            this.bgm.stop();
        }
    }
}