import Phaser from 'phaser';
import { ROLE_BASE_STATS } from '../data/UnitData';

export default class BattleInteractionManager {
    constructor(scene) {
        this.scene = scene;
        
        // NPC 상호작용 관련 상태 변수 이동
        this.touchingNpc = null;
        this.currentFrameTouchingNpc = null;
        this.npcTouchTimer = 0;
        this.npcInteractionTriggered = false;
    }

    // [Moved] 매 프레임 충돌 체크 (콜라이더 콜백)
    handleNpcCollision(unit, npc) {
        // 플레이어 유닛만 상호작용 가능
        if (unit === this.scene.playerUnit) {
            this.currentFrameTouchingNpc = npc;
        }
    }

    // [Moved] NPC 상호작용 업데이트 (Update 루프에서 호출)
    update(delta) {
        if (this.currentFrameTouchingNpc) {
            const cursors = this.scene.cursors || {};
            const wasd = this.scene.wasd || {};
            const joy = this.scene.joystickCursors || {};
            
            // 플레이어가 이동 키를 누르고 있는지 확인 (밀고 있는지)
            const isPushing = (
                cursors.left?.isDown || cursors.right?.isDown || cursors.up?.isDown || cursors.down?.isDown ||
                wasd.left?.isDown || wasd.right?.isDown || wasd.up?.isDown || wasd.down?.isDown ||
                joy.left?.isDown || joy.right?.isDown || joy.up?.isDown || joy.down?.isDown
            );

            if (isPushing) {
                if (this.touchingNpc === this.currentFrameTouchingNpc) {
                    if (!this.npcInteractionTriggered) {
                        this.npcTouchTimer += delta;
                        // 0.5초 이상 비비면 이벤트 발생
                        if (this.npcTouchTimer > 500) {
                            console.log("✅ [Interaction] NPC Event Triggered!"); 
                            this.triggerNpcEvent(this.touchingNpc);
                            this.npcInteractionTriggered = true; 
                        }
                    }
                } else {
                    // 새로운 NPC와 접촉 시작
                    this.touchingNpc = this.currentFrameTouchingNpc;
                    this.npcTouchTimer = 0;
                    this.npcInteractionTriggered = false;
                }
            } else {
                this.npcTouchTimer = 0;
            }
        } else {
            // 접촉 해제
            this.touchingNpc = null;
            this.npcTouchTimer = 0;
            this.npcInteractionTriggered = false;
        }
        
        // 프레임 리셋
        this.currentFrameTouchingNpc = null;
    }

    // [Moved] NPC 이벤트 트리거
    triggerNpcEvent(npc) {
        if (!npc.scriptData) return;
        console.log("🗣️ [Interaction] Script Action:", npc.texture.key);
        
        // 모달/이벤트 중 슬로우 모션
        if (this.scene.slowMotionForModal) this.scene.slowMotionForModal(true);

        npc.scriptData.forEach(script => {
            if (script.type === 'dialog_confirm') {
                let dialogText = script.text;
                let dialogOptions = script.options;

                // 코인 제거 조건 확인 (UI 표시용)
                const costOption = script.options.find(opt => 
                    opt.action && opt.action.includes('remove_coins')
                );

                if (costOption) {
                    const idx = costOption.action.indexOf('remove_coins');
                    const cost = costOption.action[idx + 1];
                    
                    if (this.scene.playerCoins < cost) {
                        dialogText = "코인이 부족합니다!";
                        dialogOptions = [
                            { text: "닫기", action: ["close"] }
                        ];
                    }
                }

                this.scene.uiManager.showDialogConfirm(
                    dialogText, 
                    dialogOptions, 
                    (actionArray) => this.executeScriptAction(actionArray)
                );
            }
        });
    }

    // [Moved] 스크립트 액션 실행기
    executeScriptAction(actions) {
        if (!Array.isArray(actions)) return;
        let i = 0;
        while (i < actions.length) {
            const command = actions[i];
            i++;
            switch (command) {
                case 'restore_fatigue':
                    const fatigueAmount = actions[i]; 
                    i++;
                    this.restoreFatigue(fatigueAmount);
                    break;
                case 'restore_energy': 
                    const energyAmount = actions[i];
                    i++;
                    this.restoreEnergy(energyAmount);
                    break;
                case 'remove_coins':
                    const cost = actions[i]; 
                    i++;
                    this.removeCoins(cost);
                    break;
                case 'close':
                    if (this.scene.slowMotionForModal) this.scene.slowMotionForModal(false);
                    break;
                default:
                    console.warn(`Unknown script command: ${command}`);
                    break;
            }
        }
    }

    // [Moved] 피로도 회복 로직
    restoreFatigue(amount) {
        const squad = this.scene.registry.get('playerSquad') || [];
        squad.forEach(member => {
            if (member.fatigue > 0) {
                member.fatigue = Math.max(0, member.fatigue - amount);
            }
        });
        this.scene.registry.set('playerSquad', squad);
        
        // 화면에 있는 유닛들에게 이모트 표시
        this.scene.blueTeam.getChildren().forEach(unit => {
            if (unit.active && !unit.isDying) {
                if (unit.showEmote) {
                    unit.showEmote(`피로도 -${amount}`, '#44ff44'); 
                }
            }
        });
        
        console.log(`💪 Fatigue restored by ${amount}`);
    }

    // [Moved] 체력(Energy) 회복 로직
    restoreEnergy(amount) {
        console.log(`%c[restoreEnergy] Amount: ${amount}`, 'color: cyan; font-weight: bold;');
        const numericAmount = Number(amount);

        const squad = this.scene.registry.get('playerSquad') || [];
        
        // 1. 레지스트리(데이터) 업데이트
        squad.forEach((member, i) => {
            let maxHp = member.maxHp;
            const activeUnit = this.scene.blueTeam.getChildren().find(u => u.squadIndex === i);
            
            if (activeUnit && activeUnit.maxHp) {
                maxHp = activeUnit.maxHp;
            } 
            if (maxHp === undefined) {
                 const baseStats = ROLE_BASE_STATS[member.role] || {};
                 maxHp = member.hp || baseStats.hp || 100; 
            }

            const curHp = (member.hp !== undefined) ? member.hp : maxHp;
            const nextHp = Math.min(maxHp, curHp + numericAmount);
            member.hp = nextHp;
        });
        this.scene.registry.set('playerSquad', squad);

        // 2. 인게임 유닛 업데이트
        this.scene.blueTeam.getChildren().forEach((unit, i) => {
            if (unit.active && !unit.isDying) {
                if (unit.maxHp === undefined) unit.maxHp = 100;
                
                unit.hp = Math.min(unit.maxHp, unit.hp + numericAmount);
                unit.redrawHpBar();
                
                if (unit.showEmote) {
                    if(numericAmount > 999) unit.showEmote(`완전 회복!`, '#030e9eff'); 
                    else unit.showEmote(`체력 +${numericAmount}`, '#030e9eff'); 
                }
            }
        });
    }

    // [Moved] 코인 차감 로직
    removeCoins(amount) {
        if (this.scene.playerCoins >= amount) {
            this.scene.playerCoins -= amount;
            this.scene.uiManager.updateCoins(this.scene.playerCoins);
            console.log(`💰 Coins removed: ${amount}.`);
        } else {
            console.log("💸 Not enough coins!");
        }
    }
}