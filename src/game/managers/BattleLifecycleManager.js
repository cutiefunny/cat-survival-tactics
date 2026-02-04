/**
 * BattleLifecycleManager
 * 전투의 시작, 종료, 결과 처리 관리
 * - 게임 시작/종료
 * - 승패 판정
 * - 보상 계산
 * - 레벨 전환
 */

import { LEVEL_KEYS } from './LevelManager';

export default class BattleLifecycleManager {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 전투 시작 처리
     */
    startBattle() {
        if (this.scene.battleStarted) return;

        this.scene.battleStarted = true;
        this.scene.battleStartTime = Date.now();

        this.scene.uiManager.showStartAnimation();
    }

    /**
     * 전투 종료 및 결과 처리
     */
    finishGame(message, color, isWin, fatiguePenalty = 1) {
        if (this.scene.isGameOver) return;

        // 승리 시 스크립트 체크
        if (isWin && this.scene.levelScript && 
            this.scene.levelScriptCondition === 'win' && 
            !this.scene.postBattleScriptPlayed) {
            
            console.log("📜 [Lifecycle] Victory! Playing Win Script first.");

            this.scene.postBattleScriptPlayed = true;
            this.scene.pendingFinishArgs = [message, color, isWin, fatiguePenalty];

            this.scene.physics.pause();
            this.scene.inputManager.destroy();

            this.scene.scene.pause();
            this.scene.scene.launch('EventScene', {
                script: this.scene.levelScript,
                mode: 'overlay',
                parentScene: 'BattleScene'
            });
            return;
        }

        this.scene.isGameOver = true;
        this.scene.physics.pause();
        this.scene.inputManager.destroy();
        
        if (this.scene.audioManager) {
            this.scene.audioManager.stopBgm();
        }

        const battleResult = this.processBattleOutcome(isWin, fatiguePenalty);
        const { resultStats, totalScore, totalRewardCoins, capturedUnits } = battleResult;

        // 포로 메시지 추가
        if (capturedUnits.length > 0) {
            const names = capturedUnits.map(u => u.name).join(", ");
            message += `\n⛓️ 포로 발생: ${names}`;
        }

        let btnText = "Tap to Restart";
        let callback = () => this.restartLevel();

        // 전략 모드 vs 일반 모드
        if (this.scene.isStrategyMode) {
            btnText = "맵으로";
            callback = () => {
                const finalCoins = this.scene.playerCoins + 
                    (isWin ? Math.floor(totalScore / 1000) : 0);
                
                this.scene.scene.stop('UIScene');
                this.scene.scene.start('StrategyScene', {
                    battleResult: {
                        isWin: isWin,
                        targetNodeId: this.scene.targetNodeId,
                        remainingCoins: finalCoins,
                        score: totalScore
                    }
                });
            };
        } else {
            if (isWin) {
                if (this.scene.currentLevelIndex !== -1 && 
                    this.scene.currentLevelIndex < LEVEL_KEYS.length - 1) {
                    btnText = "Next Level ▶️";
                    callback = () => this.nextLevel(totalScore);
                } else {
                    btnText = "All Clear! 🏆";
                    message = "Champion!";
                    callback = () => this.restartGameFromBeginning();
                }
            }
        }

        const uiData = {
            isWin: isWin,
            title: message,
            color: color,
            btnText: btnText,
            stats: resultStats
        };

        this.scene.uiManager.createGameOverUI(uiData, callback);
    }

    /**
     * 전투 결과 처리 (보상, 경험치, 사상자 등)
     */
    processBattleOutcome(isWin, fatiguePenalty) {
        const killedEnemies = Math.max(0, 
            this.scene.initialRedCount - this.scene.redTeam.countActive()
        );
        const xpGained = killedEnemies * 10;

        const currentSquad = this.scene.registry.get('playerSquad') || [];
        const fallenUnits = this.scene.registry.get('fallenUnits') || [];
        const prisonerList = this.scene.registry.get('prisonerList') || [];

        const nextSquad = [];
        const leveledUpUnits = [];
        const deadUnits = [];
        const capturedUnits = [];

        // 포로 결정
        let prisonersToTake = 0;
        if (!isWin && fatiguePenalty >= 2) {
            const rand = Math.random() * 100;
            if (rand < 2) prisonersToTake = 3;
            else if (rand < 7) prisonersToTake = 2;
            else if (rand < 17) prisonersToTake = 1;
        }

        const captureCandidates = currentSquad
            .map((u, i) => i)
            .filter(i => {
                const member = currentSquad[i];
                return member.role !== 'Leader' && 
                    !this.scene.deadSquadIndices.includes(i);
            });

        Phaser.Utils.Array.Shuffle(captureCandidates);
        const selectedPrisonerIndices = captureCandidates.slice(0, prisonersToTake);

        // 각 멤버 처리
        currentSquad.forEach((member, i) => {
            if (member.role === 'Leader') member.name = '김냐냐';

            // 전사
            if (this.scene.deadSquadIndices.includes(i)) {
                if (member.role === 'Leader') {
                    member.fatigue = (member.fatigue || 0) + 5;
                    nextSquad.push(member);
                } else {
                    fallenUnits.push({
                        ...member,
                        deathDate: new Date().toISOString(),
                        cause: 'Killed by Wild Dog',
                        deathLevel: this.scene.currentLevelIndex + 1
                    });
                    deadUnits.push({ name: member.name, role: member.role });
                }
            }
            // 포로
            else if (selectedPrisonerIndices.includes(i)) {
                prisonerList.push({
                    ...member,
                    capturedDate: new Date().toISOString(),
                    capturedLevel: this.scene.currentLevelIndex + 1
                });
                capturedUnits.push({ name: member.name, role: member.role });
            }
            // 생존
            else {
                member.xp = (member.xp || 0) + xpGained;
                let oldLevel = member.level || 1;
                let reqXp = oldLevel * 100;
                let leveledUp = false;

                // 레벨업 처리
                while (member.xp >= reqXp) {
                    member.xp -= reqXp;
                    member.level = (member.level || 1) + 1;
                    reqXp = member.level * 100;
                    leveledUp = true;
                }

                if (leveledUp) {
                    leveledUpUnits.push({
                        name: member.name,
                        role: member.role,
                        oldLevel: oldLevel,
                        newLevel: member.level
                    });
                }

                member.fatigue = (member.fatigue || 0) + fatiguePenalty;
                nextSquad.push(member);
            }
        });

        // 레지스트리 업데이트
        this.scene.registry.set('playerSquad', nextSquad);
        this.scene.registry.set('fallenUnits', fallenUnits);
        this.scene.registry.set('prisonerList', prisonerList);

        // 점수 계산
        const endTime = Date.now();
        const durationSec = Math.floor((endTime - this.scene.battleStartTime) / 1000);
        const survivors = this.scene.blueTeam.countActive();
        const survivorScore = survivors * 500;
        const timeScore = Math.max(0, (300 - durationSec) * 10);
        const totalScore = isWin ? (survivorScore + timeScore) : 0;

        // 코인 보상
        const battleEarnings = Math.max(0, 
            this.scene.playerCoins - this.scene.levelInitialCoins
        );
        const scoreBonus = isWin ? Math.floor(totalScore / 1000) : 0;
        const totalRewardCoins = battleEarnings + scoreBonus;

        return {
            resultStats: {
                rewardCoins: totalRewardCoins,
                leveledUpUnits,
                deadUnits,
                capturedUnits
            },
            totalScore,
            totalRewardCoins,
            capturedUnits
        };
    }

    /**
     * 다음 레벨로 진행
     */
    nextLevel(score) {
        const nextIndex = this.scene.currentLevelIndex + 1;
        const bonusCoins = Math.floor(score / 1000);
        const nextCoins = this.scene.playerCoins + bonusCoins;

        const centerX = this.scene.scale.width / 2;
        const centerY = this.scene.scale.height / 2;

        this.scene.uiManager.playCoinAnimation(centerX, centerY, bonusCoins, () => {
            this.scene.scene.restart({
                levelIndex: nextIndex,
                currentCoins: nextCoins
            });
        });
    }

    /**
     * 현재 레벨 재시작
     */
    restartLevel() {
        this.scene.scene.restart({
            levelIndex: this.scene.currentLevelIndex,
            currentCoins: this.scene.levelInitialCoins
        });
    }

    /**
     * 게임 처음부터 재시작
     */
    restartGameFromBeginning() {
        // 스크립트 기록 초기화
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('map_script_played_') || 
                key.startsWith('tutorial_played_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));

        console.log("🔄 [Lifecycle] Game Reset: Script history cleared.");

        // 레지스트리 초기화
        this.scene.registry.set('playerSquad', [{ role: 'Leader' }]);
        this.scene.registry.set('unlockedRoles', ['Normal']);
        this.scene.registry.set('fallenUnits', []);
        this.scene.registry.set('prisonerList', []);

        this.scene.scene.restart({ levelIndex: 0 });
    }
}
