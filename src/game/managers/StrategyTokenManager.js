import Phaser from 'phaser';

export default class StrategyTokenManager {
    constructor(scene) {
        this.scene = scene;
        this.leaderObj = null;
        this.enemyTokens = [];
        
        // 애니메이션 생성 여부 체크
        this.animsCreated = false;
    }

    // 애니메이션 정의 (최초 1회)
    createAnimations() {
        if (this.animsCreated) return;

        const anims = this.scene.anims;
        if (!anims.exists('leader_idle')) { anims.create({ key: 'leader_idle', frames: anims.generateFrameNumbers('leader_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!anims.exists('leader_walk')) { anims.create({ key: 'leader_walk', frames: anims.generateFrameNumbers('leader_token', { frames: [1, 2] }), frameRate: 6, repeat: -1 }); }
        if (!anims.exists('dog_idle')) { anims.create({ key: 'dog_idle', frames: anims.generateFrameNumbers('dog_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!anims.exists('runner_idle')) { anims.create({ key: 'runner_idle', frames: anims.generateFrameNumbers('runner_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!anims.exists('boss_idle')) { anims.create({ key: 'boss_idle', frames: anims.generateFrameNumbers('boss_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!anims.exists('tanker_idle')) { anims.create({ key: 'tanker_idle', frames: anims.generateFrameNumbers('tanker_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!anims.exists('shooter_idle')) { anims.create({ key: 'shooter_idle', frames: anims.generateFrameNumbers('shooter_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!anims.exists('healer_idle')) { anims.create({ key: 'healer_idle', frames: anims.generateFrameNumbers('healer_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!anims.exists('raccoon_idle')) { anims.create({ key: 'raccoon_idle', frames: anims.generateFrameNumbers('raccoon_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }
        if (!anims.exists('normal_idle')) { anims.create({ key: 'normal_idle', frames: anims.generateFrameNumbers('normal_token', { frames: [0] }), frameRate: 1, repeat: -1 }); }

        this.animsCreated = true;
    }

    createPlayerToken(targetNode) {
        if (!targetNode) return;

        // 기존 토큰이 있으면 제거 후 재생성 (또는 위치만 이동)
        if (this.leaderObj) {
            this.leaderObj.destroy();
        }

        this.leaderObj = this.scene.add.sprite(targetNode.x, targetNode.y, 'leader_token');
        this.leaderObj.setFlipX(true);
        this.leaderObj.setDisplaySize(60, 60);
        this.leaderObj.setOrigin(0.5, 0.8);
        this.leaderObj.setDepth(50);
        this.leaderObj.play('leader_idle');

        // 숨쉬기 애니메이션
        this.scene.tweens.add({
            targets: this.leaderObj,
            scaleY: { from: this.leaderObj.scaleY, to: this.leaderObj.scaleY * 0.95 },
            yoyo: true,
            repeat: -1,
            duration: 900,
            ease: 'Sine.easeInOut'
        });
    }

    createEnemyTokens(mapNodes) {
        // 기존 토큰 정리
        if (this.enemyTokens.length > 0) {
            this.enemyTokens.forEach(token => { 
                if (token && token.active) token.destroy(); 
            });
        }
        this.enemyTokens = [];
        
        if (!mapNodes) return;

        mapNodes.forEach(node => {
            if (node.owner !== 'player' && node.army) {
                this.createSingleEnemyToken(node);
            }
        });
    }

    createSingleEnemyToken(node) {
        let topUnitType = 'dog';
        let totalCount = 0;

        if (Array.isArray(node.army)) {
            const bossUnit = node.army.find(u => u.type && u.type.toLowerCase() === 'boss');
            const tankerUnit = node.army.find(u => u.type && u.type.toLowerCase() === 'tanker');
            
            if (bossUnit) topUnitType = 'boss';
            else if (tankerUnit) topUnitType = 'tanker';
            else if (node.army.length > 0 && node.army[0].type) topUnitType = node.army[0].type.toLowerCase();

            totalCount = node.army.reduce((sum, u) => sum + (u.count || 1), 0);
        } else {
            topUnitType = node.army.type ? node.army.type.toLowerCase() : 'dog';
            totalCount = node.army.count || 1;
        }

        let textureKey = 'dog_token';
        if (topUnitType === 'runner') textureKey = 'runner_token';
        else if (topUnitType === 'dog') textureKey = 'dog_token';
        else if (topUnitType === 'tanker') textureKey = 'tanker_token';
        else if (topUnitType === 'shooter') textureKey = 'shooter_token';
        else if (topUnitType === 'healer') textureKey = 'healer_token';
        else if (topUnitType === 'raccoon') textureKey = 'raccoon_token';
        else if (topUnitType === 'normal') textureKey = 'normal_token';
        else if (topUnitType === 'boss') textureKey = 'boss_token';
        
        const enemyObj = this.scene.add.sprite(node.x, node.y, textureKey);
        
        // UI Manager가 있다면 UI 카메라에서 무시 설정
        if (this.scene.uiManager) {
            this.scene.uiManager.ignoreObject(enemyObj);
        }

        let finalSize = 60; 
        if (node.owner === 'neutral') finalSize = 60;
        else { 
            if (topUnitType === 'tanker') finalSize = 70; 
            else if (topUnitType === 'boss') finalSize = 100; 
            else { 
                finalSize = 40 + (totalCount - 1) * 3; 
                finalSize = Phaser.Math.Clamp(finalSize, 35, 75); 
            }
        }
        enemyObj.setDisplaySize(finalSize, finalSize); 
        enemyObj.setOrigin(0.5, 0.8); 
        enemyObj.setFlipX(false); 
        enemyObj.setDepth(10); 
        
        const animKey = `${topUnitType}_idle`;
        if (this.scene.anims.exists(animKey)) {
            enemyObj.play(animKey);
        } else {
            enemyObj.play('dog_idle');
        }
        
        this.scene.tweens.add({ targets: enemyObj, scaleY: { from: enemyObj.scaleY, to: enemyObj.scaleY * 0.95 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
        this.enemyTokens.push(enemyObj);

        return enemyObj;
    }

    // 플레이어 이동 연출
    moveLeaderToken(targetNode, onCompleteCallback) {
        if (!this.leaderObj) return;

        if (targetNode.x < this.leaderObj.x) { this.leaderObj.setFlipX(false); } 
        else { this.leaderObj.setFlipX(true); }
        
        this.leaderObj.play('leader_walk');
        
        this.scene.tweens.add({
            targets: this.leaderObj, 
            x: targetNode.x, 
            y: targetNode.y, 
            duration: 1000, 
            ease: 'Power2',
            onComplete: () => {
                this.leaderObj.play('leader_idle');
                if (onCompleteCallback) onCompleteCallback();
            }
        });
    }

    // 적군 이동 연출
    moveEnemies(moves, onMoveComplete, onAllComplete) {
        let completedCount = 0;

        moves.forEach(move => {
            const token = this.enemyTokens.find(t => 
                Math.abs(t.x - move.fromNode.x) < 5 && Math.abs(t.y - move.fromNode.y) < 5
            );

            if (token) {
                this.scene.tweens.add({
                    targets: token,
                    x: move.toNode.x,
                    y: move.toNode.y,
                    duration: 800,
                    ease: 'Power2',
                    onComplete: () => {
                        // 개별 이동 완료 시 콜백 (데이터 업데이트 등)
                        if (onMoveComplete) onMoveComplete(move);

                        completedCount++;
                        if (completedCount === moves.length) {
                            if (onAllComplete) onAllComplete();
                        }
                    }
                });
            } else {
                 // 토큰이 없는 경우(비정상) 바로 완료 처리
                 if (onMoveComplete) onMoveComplete(move);
                 
                 completedCount++;
                 if (completedCount === moves.length) {
                     if (onAllComplete) onAllComplete();
                 }
            }
        });
    }

    // 스폰 애니메이션 (생성 직후 호출)
    animateSpawn(token) {
        if (!token) return;
        const originalScale = token.scaleX; 
        token.setScale(0); 
        
        this.scene.tweens.add({
            targets: token,
            scaleX: originalScale,
            scaleY: originalScale,
            duration: 1000,
            ease: 'Back.out'
        });
    }

    getTokenAt(x, y) {
        return this.enemyTokens.find(t => Math.abs(t.x - x) < 5 && Math.abs(t.y - y) < 5);
    }
}