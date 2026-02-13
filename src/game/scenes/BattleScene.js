import Phaser from 'phaser';
import BaseScene from './BaseScene'; 

// [Managers]
import MapAssetManager from '../managers/MapAssetManager'; 
import BattleUIManager from '../managers/BattleUIManager';
import InputManager from '../managers/InputManager';
import CombatManager from '../managers/CombatManager';       
import PathfindingManager from '../managers/PathfindingManager'; 
import BattleObjectManager from '../managers/BattleObjectManager';
import BattleInteractionManager from '../managers/BattleInteractionManager';
import BattleAudioManager from '../managers/BattleAudioManager';
import BattleAssetLoader from '../managers/BattleAssetLoader';
import BattleUnitSpawner from '../managers/BattleUnitSpawner';
import BattleLifecycleManager from '../managers/BattleLifecycleManager';
import BattleSceneInitializer from '../managers/BattleSceneInitializer';
import BattleSceneCameraManager from '../managers/BattleSceneCameraManager';

// [Data]
import { DEFAULT_AI_SETTINGS } from '../data/UnitData';

export default class BattleScene extends BaseScene {
    constructor() {
        super('BattleScene');
    }

    init(data) {
        this.initData = data; 

        let targetIndex = 0;
        this.hasLevelIndexPassed = false; 

        this.isStrategyMode = data && data.isStrategyMode;
        this.targetNodeId = data ? data.targetNodeId : null;
        this.armyConfig = data ? data.armyConfig : null; 
        this.bgmKey = (data && data.bgmKey) ? data.bgmKey : 'default';

        this.levelScript = (data && data.script) ? data.script : null;
        this.levelScriptCondition = (data && data.script_condition) ? data.script_condition : null;
        this.postBattleScriptPlayed = false; 
        this.pendingFinishArgs = null;       

        this.deadSquadIndices = [];

        if (data && data.levelIndex !== undefined) {
            targetIndex = data.levelIndex;
            this.hasLevelIndexPassed = true; 
        } else if (window.TACTICS_START_LEVEL !== undefined) {
            targetIndex = window.TACTICS_START_LEVEL;
        }

        this.currentLevelIndex = targetIndex;
        this.passedCoins = (data && data.currentCoins !== undefined) ? data.currentCoins : null;
        
        this.hasScriptPlayed = false;
        this.isWaitingForIntro = false;

        console.log(`🎮 [BattleScene] Init - StrategyMode: ${this.isStrategyMode}, BGM: ${this.bgmKey}`);
    }

    preload() {
        this.mapManager = new MapAssetManager(this);
        this.mapManager.preload();

        this.assetLoader = new BattleAssetLoader(this);
        this.assetLoader.preloadAll();

        this.audioManager = new BattleAudioManager(this);
        this.audioManager.preload(this.bgmKey);
    }

    create() {
        super.create();
        
        // Managers 초기화
        this.lifecycleManager = new BattleLifecycleManager(this);
        this.unitSpawner = new BattleUnitSpawner(this);
        this.uiManager = new BattleUIManager(this);
        this.inputManager = new InputManager(this);
        this.combatManager = new CombatManager(this);
        this.pathfindingManager = new PathfindingManager(this); 
        this.objectManager = new BattleObjectManager(this);
        this.interactionManager = new BattleInteractionManager(this);
        this.initializer = new BattleSceneInitializer(this);
        this.cameraManager = new BattleSceneCameraManager(this);
        
        // BGM 재생
        if (!this.initData || !this.initData.debugConfig) {
            let playKey = this.bgmKey;
            this.audioManager.playBgm(playKey, 0.5);
        } else {
            console.log("🔇 [BattleScene] Mock Battle - BGM Skipped");
        }
        
        this.placementZone = null;
        this.catsArea = null; 
        this.dogsArea = null; 
        
        this.zoneGraphics = null; 
        this.blocksDebugGraphics = null;
        this.gameConfig = null; 

        this.inputManager.setupControls();
        this.inputManager.checkMobileAndSetup();

        this.npcGroup = null; 
        
        // [New] 오브젝트 매니저 초기화 (쥐 그룹 생성 등)
        this.objectManager.create();

        this.input.keyboard.on('keydown-D', (event) => { if (event.shiftKey) this.toggleDebugMode(); });
        
        this.events.on('resume', this.handleResume, this);

        this.uiManager.create();

        this.initializer.fetchConfigAndStart();
    }

    handleResume(scene, data) {
        if (this.isWaitingForIntro) {
            console.log("▶️ [BattleScene] Intro Script Finished. Resuming game...");
            this.isWaitingForIntro = false;

            const storageKey = `map_script_played_${this.currentMapKey}`;
            localStorage.setItem(storageKey, 'true');

            if(this.playerUnit?.active && !this.sys.game.device.os.desktop) {
                this.cameraManager.followPlayer(this.playerUnit);
            }
        }
        else if (this.postBattleScriptPlayed && this.pendingFinishArgs) {
            console.log("▶️ [BattleScene] Win Script Finished. Showing Victory UI.");
            const args = this.pendingFinishArgs;
            this.pendingFinishArgs = null;
            this.finishGame(...args);
        }
    }

    pauseBattle(isPaused) {
        if (isPaused) {
            this.physics.world.pause();
            this.time.paused = true;
        } else {
            this.physics.world.resume();
            this.time.paused = false;
        }
    }

    playHitSound() {
        if (this.audioManager) {
            this.audioManager.playHitSound();
        }
    }

    playDieSound() {
        if (this.audioManager) {
            this.audioManager.playDieSound();
        }
    }

    handleUnitDeath(unit) {
        if (unit.team === 'blue' && unit.squadIndex !== undefined) {
            this.deadSquadIndices.push(unit.squadIndex);
        }
    }

    toggleDebugMode() {
        if (this.uiManager.isDebugEnabled) {
            this.uiManager.destroyDebugStats();
            if (this.blocksDebugGraphics) this.blocksDebugGraphics.setVisible(false);
        } else {
            this.uiManager.createDebugStats();
            if (!this.blocksDebugGraphics) this.createBlocksDebug();
            if (this.blocksDebugGraphics) this.blocksDebugGraphics.setVisible(true);
        }
    }

    initializeGameVariables(config) {
        this.isGameOver = false;
        this.battleStarted = false;
        this.isSetupPhase = true;
        this.checkBattleTimer = 0;
        this.isAutoBattle = true;
        this.squadState = 'FREE'; 
        this.gameSpeed = 1;
        this.physics.world.timeScale = 1;
        this.time.timeScale = 1;
        this.playerSkillCount = 0;
        this.battleStartTime = 0;

        this.retreatTimer = 0; 
        this.isRetreatModalOpen = false; 
        
        if (config.showDebugStats) this.uiManager.createDebugStats();
        this.uiManager.createStartButton(() => this.handleStartBattle());
        this.uiManager.updateAutoButton(this.isAutoBattle);
        this.createStandardAnimations();
        this.blueTeam = this.physics.add.group({ runChildUpdate: true });
        this.redTeam = this.physics.add.group({ runChildUpdate: true });
    }

    incrementSkillCount() { if (this.battleStarted && !this.isGameOver) { this.playerSkillCount++; } }
    
    createBlocksDebug() {
        this.blocksDebugGraphics = this.add.graphics().setDepth(1000);
        if (this.blockObjectGroup) {
            this.blocksDebugGraphics.lineStyle(2, 0xff0000, 0.5);
            this.blockObjectGroup.children.iterate((child) => {
                const { x, y, width, height } = child;
                this.blocksDebugGraphics.strokeRect(x - width/2, y - height/2, width, height);
            });
        }
    }
    
    createStandardAnimations() {
        if (this.assetLoader) {
            this.assetLoader.createUnitAnimations();
        }
    }

    createUnitInstance(x, y, team, target, stats, isLeader) {
        return this.unitSpawner.createUnitInstance(x, y, team, target, stats, isLeader);
    }

    spawnUnits(config, map) {
        this.unitSpawner.spawnAllUnits(config, map);
    }

    spawnRecruitedUnit(memberConfig) {
        this.unitSpawner.spawnRecruitedUnit(memberConfig);
    }
    
    getCameraTarget(speaker) {
        return this.initializer.getCameraTarget(speaker);
    }

    animateCoinDrop(startX, startY, amount) {
        const coin = this.add.graphics();
        coin.fillStyle(0xFFD700, 1); coin.fillCircle(0, 0, 8); coin.lineStyle(2, 0xFFFFFF, 1); coin.strokeCircle(0, 0, 8);
        coin.setPosition(startX, startY); coin.setDepth(900); 
        this.tweens.add({
            targets: coin, y: startY - 60, alpha: 0, duration: 800, ease: 'Power1',
            onComplete: () => { 
                coin.destroy(); 
                this.playerCoins += amount; 
                if(this.uiManager) this.uiManager.updateCoins(this.playerCoins); 
            }
        });
        this.showFloatingCoinText(startX, startY, amount);
    }
    showFloatingCoinText(x, y, amount) {
        const text = this.add.text(x, y, `+${amount}`, {
            fontFamily: 'Arial', fontSize: '24px', color: '#FFD700', stroke: '#000000', strokeThickness: 3, fontWeight: 'bold'
        });
        text.setOrigin(0.5); text.setDepth(2000);
        this.tweens.add({ targets: text, y: y - 50, alpha: 0, duration: 1000, ease: 'Power2', onComplete: () => { text.destroy(); } });
    }
    
    setupPhysicsColliders(wallLayer, blockLayer) {
        const onWallCollision = (unit, tile) => {
            if (unit && typeof unit.handleWallCollision === 'function') unit.handleWallCollision(tile);
        };
        
        // [Modified] 매니저로부터 miceGroup 가져오기
        const miceGroup = this.objectManager.getGroup();

        if (wallLayer) {
            const ignoreJumpCollision = (unit, tile) => {
                if (unit && unit.isJumping) return false;
                return true;
            };

            this.physics.add.collider(this.blueTeam, wallLayer, onWallCollision, ignoreJumpCollision, this);
            this.physics.add.collider(this.redTeam, wallLayer, onWallCollision, ignoreJumpCollision, this);
            if (miceGroup) this.physics.add.collider(miceGroup, wallLayer);
            console.log('[SMOKE] Wall TILE layer colliders setup - jumping units bypass wallLayer');
        } else {
            console.log('[SMOKE] Wall TILE layer NOT initialized (null/undefined)');
        }
        if (blockLayer) { 
            this.physics.add.collider(this.blueTeam, blockLayer, onWallCollision); 
            this.physics.add.collider(this.redTeam, blockLayer, onWallCollision); 
            if (miceGroup) this.physics.add.collider(miceGroup, blockLayer);
            console.log('[SMOKE] Block TILE layer colliders setup');
        } else {
            console.log('[SMOKE] Block TILE layer NOT initialized (null/undefined)');
        }
        if (this.wallObjectGroup) {
            const wallCount = this.wallObjectGroup.getChildren().length;
            console.log(`[SMOKE] wallObjectGroup found with ${wallCount} objects`);
            
            // Wall collider references 저장 (Jump 중 disable/enable용)
            this.wallObjectColliders = [];
            
            this.wallObjectColliders.push(
                this.physics.add.collider(
                    this.blueTeam, 
                    this.wallObjectGroup, 
                    onWallCollision,
                    (unit, wall) => {
                        // 점프 중이면 충돌 무시
                        if (unit.isJumping) {
                            console.log(`[SMOKE] Wall collision IGNORED (unit ${unit.role} is jumping)`);
                            return false;
                        }
                        console.log(`[SMOKE] Wall collision ALLOWED (unit ${unit.role} not jumping)`);
                        return true;
                    },
                    this
                )
            );
            
            this.wallObjectColliders.push(
                this.physics.add.collider(
                    this.redTeam, 
                    this.wallObjectGroup, 
                    onWallCollision,
                    (unit, wall) => {
                        // 점프 중이면 충돌 무시
                        if (unit.isJumping) {
                            console.log(`[SMOKE] Wall collision IGNORED (unit ${unit.role} is jumping)`);
                            return false;
                        }
                        console.log(`[SMOKE] Wall collision ALLOWED (unit ${unit.role} not jumping)`);
                        return true;
                    },
                    this
                )
            );
            
            if (miceGroup) this.physics.add.collider(miceGroup, this.wallObjectGroup);
            console.log('[SMOKE] Wall OBJECT group colliders setup - jumping units bypass wallObjectGroup');
        } else {
            console.log('[SMOKE] wallObjectGroup is NULL or undefined - no wall collisions possible');
        }
        if (this.blockObjectGroup) { 
            this.physics.add.collider(this.blueTeam, this.blockObjectGroup, onWallCollision); 
            this.physics.add.collider(this.redTeam, this.blockObjectGroup, onWallCollision); 
            if (miceGroup) this.physics.add.collider(miceGroup, this.blockObjectGroup);
            console.log('[SMOKE] Block OBJECT group colliders setup');
        }
        
        this.combatManager.setupColliders(this.blueTeam, this.redTeam);
        
        // [Modified] 점프 중 유닛 충돌 무시
        this.physics.add.collider(
            this.blueTeam, 
            this.blueTeam,
            null,
            (unit1, unit2) => {
                // 둘 중 하나라도 점프 중이면 충돌 무시
                if (unit1.isJumping || unit2.isJumping) return false;
                return true;
            },
            this
        );
        this.physics.add.collider(
            this.redTeam, 
            this.redTeam,
            null,
            (unit1, unit2) => {
                // 둘 중 하나라도 점프 중이면 충돌 무시
                if (unit1.isJumping || unit2.isJumping) return false;
                return true;
            },
            this
        );
        console.log('[SMOKE] Team self-colliders setup - jumping units bypass blue/red team collisions');
        
        if (this.npcGroup) {
            // [Modified] InteractionManager 콜백 사용
            this.physics.add.collider(
                this.redTeam, 
                this.npcGroup, 
                (unit, npc) => this.interactionManager.handleNpcCollision(unit, npc), 
                null, 
                this
            );
            this.physics.add.collider(
                this.blueTeam, 
                this.npcGroup, 
                (unit, npc) => this.interactionManager.handleNpcCollision(unit, npc), 
                null, 
                this
            );
        }

        // [Modified] 쥐 섭취 및 충돌 핸들러 연결
        if (miceGroup) {
            // 아군과 쥐 - overlap으로 먹기
            this.physics.add.overlap(
                this.blueTeam, 
                miceGroup, 
                (unit, mouse) => this.objectManager.handleMouseConsumption(unit, mouse), 
                null, 
                this
            );
            
            // 적군과 쥐 - collider로 물리적 충돌 (밀어내기)
            this.physics.add.collider(this.redTeam, miceGroup);
            
            // NPC와 쥐 - collider로 물리적 충돌 (밀어내기)
            if (this.npcGroup) {
                this.physics.add.collider(this.npcGroup, miceGroup);
            }
        }
    }

    handleStartBattle() {
        this.saveInitialFormation(); 
        this.isSetupPhase = false;
        if (this.zoneGraphics) { this.zoneGraphics.destroy(); this.zoneGraphics = null; }
        if (this.playerUnit?.active && !this.sys.game.device.os.desktop) {
            this.cameraManager.followPlayer(this.playerUnit);
        }
        this.startBattle();
    }
    saveInitialFormation() {
        if (!this.playerUnit || !this.playerUnit.active) return;
        const lx = this.playerUnit.x; const ly = this.playerUnit.y;
        this.blueTeam.getChildren().forEach(unit => { if (unit.active && typeof unit.saveFormationPosition === 'function') unit.saveFormationPosition(lx, ly); });
    }
    selectPlayerUnit(newUnit) {
        if (!newUnit || !newUnit.active || this.playerUnit === newUnit) return;
        if (this.playerUnit) {
            this.playerUnit.isLeader = false;
            if (this.playerUnit.active && !this.playerUnit.isDying) this.playerUnit.resetVisuals();
        }
        this.playerUnit = newUnit; newUnit.isLeader = true;
        if (newUnit.active && !newUnit.isDying) newUnit.resetVisuals();
        if (!this.sys.game.device.os.desktop) {
            this.cameraManager.followPlayer(newUnit);
        }
        this.updateFormationOffsets();
    }
    transferControlToNextUnit() {
        const nextLeader = this.blueTeam.getChildren().find(unit => unit.active && !unit.isDying && unit !== this.playerUnit);
        if (nextLeader) this.selectPlayerUnit(nextLeader);
    }
    updateFormationOffsets() {
        if (this.playerUnit?.active && !this.playerUnit.isDying) { this.blueTeam.getChildren().forEach(unit => { if (unit.active) unit.calculateFormationOffset(this.playerUnit); }); }
    }
    toggleAutoBattle() {
        this.isAutoBattle = !this.isAutoBattle;
        this.uiManager.updateAutoButton(this.isAutoBattle);
        if (!this.isAutoBattle && this.playerUnit?.body) this.playerUnit.setVelocity(0);
    }
    toggleSquadState() {
        if (this.squadState === 'FREE') {
            this.squadState = 'FORMATION';
        } else if (this.squadState === 'FORMATION') {
            this.squadState = 'HOLD';
        } else {
            this.squadState = 'FREE';
        }
        this.uiManager.updateSquadButton(this.squadState);
    }
    toggleGameSpeed() {
        this.gameSpeed++;
        if (this.gameSpeed > 3) this.gameSpeed = 1;
        this.physics.world.timeScale = 1 / this.gameSpeed; 
        this.time.timeScale = this.gameSpeed;
        this.uiManager.updateSpeedButton(this.gameSpeed);
    }
    slowMotionForModal(isActive) {
        if (isActive) {
            this.physics.world.timeScale = 5; 
            this.time.timeScale = 0.2;
            if (this.cameras.main.postFX) {
                this.cameras.main.postFX.clear(); 
                const colorMatrix = this.cameras.main.postFX.addColorMatrix();
                colorMatrix.saturate(0.5); 
            }
        } else {
            this.physics.world.timeScale = 1 / this.gameSpeed; 
            this.time.timeScale = this.gameSpeed;
            if (this.cameras.main.postFX) {
                this.cameras.main.postFX.clear();
            }
        }
    }
    startBattle() {
        if (this.lifecycleManager) {
            this.lifecycleManager.startBattle();
        }
    }
    
    update(time, delta) {
        if (this.inputManager.isOrientationBad) return;
        this.uiManager.updateDebugStats(this.game.loop, delta);
        
        if (this.uiManager.isDebugEnabled) {
            if (!this.blocksDebugGraphics) this.createBlocksDebug();
            if (this.blocksDebugGraphics) this.blocksDebugGraphics.setVisible(true);
        } else {
            if (this.blocksDebugGraphics) this.blocksDebugGraphics.setVisible(false);
        }
        
        if (this.battleStarted && this.playerUnit && this.playerUnit.active && !this.playerUnit.isDying) {
            if (this.inputManager.spaceKey && Phaser.Input.Keyboard.JustDown(this.inputManager.spaceKey)) { 
                console.log('[BattleScene] Space bar 눌림!', {
                    playerUnit: this.playerUnit?.role,
                    isActive: this.playerUnit?.active
                });
                
                // playerUnit(리더)가 Runner면 점프
                if (this.playerUnit.role === 'Runner') {
                    console.log('[BattleScene] Runner playerUnit 점프 시도');
                    this.playerUnit.tryUseSkill();
                }
                
                // 추가: 모든 아군 Runner 유닛도 점프
                this.blueTeam.getChildren().forEach(unit => {
                    if (unit.active && !unit.isDying && unit.role === 'Runner') {
                        console.log('[BattleScene] 아군 Runner 점프 시도', unit);
                        unit.tryUseSkill();
                    }
                });
            }
            if (!this.isGameOver && !this.isRetreatModalOpen) {
                this.checkRetreatCondition(delta);
            }
        }
        
        if (!this.blueTeam || !this.redTeam || this.isGameOver || this.isSetupPhase) return;
        
        // [Modified] 매니저에게 업데이트 위임
        this.objectManager.updateMiceBehavior(time);
        this.interactionManager.update(delta);

        if (!this.battleStarted && this.playerUnit?.active) {
            this.checkBattleTimer -= delta;
            if (this.checkBattleTimer <= 0) {
                this.checkBattleTimer = 100;
                if (this.combatManager.checkBattleDistance(this.blueTeam, this.redTeam)) { }
            }
        }
        if (this.battleStarted) {
            if (!this.playerUnit || !this.playerUnit.active || this.playerUnit.isDying) { this.transferControlToNextUnit(); }
            this.combatManager.handleRangedAttacks([this.blueTeam, this.redTeam]);
            const blueCount = this.blueTeam.countActive();
            const redCount = this.redTeam.countActive();
            if (blueCount === 0) { this.finishGame("패배!", '#ff4444', false); } 
            else if (redCount === 0) { this.finishGame("승리!", '#4488ff', true); }
        }
    }

    checkRetreatCondition(delta) {
        if (!this.playerUnit || !this.playerUnit.active) return;
        const bounds = this.physics.world.bounds;
        const padding = this.playerUnit.baseSize / 2 + 10; 
        const { x, y } = this.playerUnit;
        let isPushing = false;
        const cursors = this.cursors || {};
        const wasd = this.wasd || {};
        const joy = this.joystickCursors || {};
        const leftInput = cursors.left?.isDown || wasd.left?.isDown || joy.left?.isDown;
        const rightInput = cursors.right?.isDown || wasd.right?.isDown || joy.right?.isDown;
        const upInput = cursors.up?.isDown || wasd.up?.isDown || joy.up?.isDown;
        const downInput = cursors.down?.isDown || wasd.down?.isDown || joy.down?.isDown;
        if (x <= bounds.x + padding && leftInput) isPushing = true;
        else if (x >= bounds.width - padding && rightInput) isPushing = true;
        else if (y <= bounds.y + padding && upInput) isPushing = true;
        else if (y >= bounds.height - padding && downInput) isPushing = true;
        if (isPushing) {
            this.retreatTimer += delta;
            if (this.retreatTimer > 1000) {
                this.triggerRetreat();
                this.retreatTimer = 0; 
            }
        } else {
            this.retreatTimer = 0;
        }
    }
    triggerRetreat() {
        this.isRetreatModalOpen = true;
        this.physics.pause(); 
        this.playerUnit.setVelocity(0, 0);
        const bounds = this.physics.world.bounds;
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const angle = Phaser.Math.Angle.Between(this.playerUnit.x, this.playerUnit.y, centerX, centerY);
        const pushBackDist = 30;
        this.playerUnit.setPosition(
            this.playerUnit.x + Math.cos(angle) * pushBackDist,
            this.playerUnit.y + Math.sin(angle) * pushBackDist
        );
        this.uiManager.createRetreatConfirmModal(
            () => { 
                this.isRetreatModalOpen = false;
                this.finishGame("작전상 후퇴!", "#ffaa00", false, 2);
            },
            () => { 
                this.isRetreatModalOpen = false;
                this.physics.resume();
            }
        );
    }
    handleResize(gameSize) {
        this.inputManager.handleResize(gameSize);
        this.uiManager.handleResize(gameSize.width, gameSize.height);
        this.cameraManager.handleResize(gameSize.width, gameSize.height);
    }
    
    finishGame(message, color, isWin, fatiguePenalty = 1) {
        if (this.lifecycleManager) {
            this.lifecycleManager.finishGame(message, color, isWin, fatiguePenalty);
        }
    }

    processBattleOutcome(isWin, fatiguePenalty) {
        return this.lifecycleManager.processBattleOutcome(isWin, fatiguePenalty);
    }

    nextLevel(score) {
        if (this.lifecycleManager) {
            this.lifecycleManager.nextLevel(score);
        }
    }
    restartLevel() {
        if (this.lifecycleManager) {
            this.lifecycleManager.restartLevel();
        }
    }
    
    restartGamerFromBeginning() {
        if (this.lifecycleManager) {
            this.lifecycleManager.restartGameFromBeginning();
        }
    }
}