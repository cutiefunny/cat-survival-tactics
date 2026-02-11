/**
 * BattleUnitSpawner
 * 유닛 생성 및 스폰 관리
 * - 아군/적군 유닛 생성
 * - 스폰 위치 결정
 * - 유닛 클래스 인스턴스화
 */

import Unit from '../objects/Unit';
import Shooter from '../objects/roles/Shooter';
import Runner from '../objects/roles/Runner';
import Tanker from '../objects/roles/Tanker';
import Dealer from '../objects/roles/Dealer';
import Normal from '../objects/roles/Normal';
import Leader from '../objects/roles/Leader';
import Healer from '../objects/roles/Healer';
import Raccoon from '../objects/roles/Raccoon';
import Wawa from '../objects/roles/Wawa';
import { ROLE_BASE_STATS, DEFAULT_AI_SETTINGS, getRandomUnitName } from '../data/UnitData';

const UnitClasses = {
    'Shooter': Shooter,
    'Runner': Runner,
    'Tanker': Tanker,
    'Dealer': Dealer,
    'Normal': Normal,
    'Leader': Leader,
    'Healer': Healer,
    'Raccoon': Raccoon,
    'Wawa': Wawa,
    'NormalDog': Unit
};

export default class BattleUnitSpawner {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 유닛 인스턴스 생성
     */
    createUnitInstance(x, y, team, target, stats, isLeader) {
        // AI 설정 병합
        if (this.scene.gameConfig && this.scene.gameConfig.aiSettings) {
            stats.aiConfig = this.scene.gameConfig.aiSettings;
        } else {
            stats.aiConfig = DEFAULT_AI_SETTINGS;
        }

        // 유닛 클래스 선택
        const UnitClass = UnitClasses[stats.role] || UnitClasses['Normal'];
        let baseStats = ROLE_BASE_STATS[stats.role] || {};

        // 역할 정의 오버라이드
        if (this.scene.gameConfig && this.scene.gameConfig.roleDefinitions && 
            this.scene.gameConfig.roleDefinitions[stats.role]) {
            baseStats = { ...baseStats, ...this.scene.gameConfig.roleDefinitions[stats.role] };
        }

        const safeStats = { ...stats };
        if (baseStats.attackRange) {
            safeStats.attackRange = baseStats.attackRange;
        }

        const finalStats = { ...baseStats, ...safeStats };

        // 레벨에 따른 스탯 증가
        const growthHp = this.scene.gameConfig?.gameSettings?.growthHp ?? 10;
        const growthAtk = this.scene.gameConfig?.gameSettings?.growthAtk ?? 1;
        const level = safeStats.level || 1;

        if (level > 1) {
            finalStats.attackPower += (level - 1) * growthAtk;
            finalStats.hp += (level - 1) * growthHp;
            finalStats.maxHp = finalStats.hp;
        }

        // 피로도 패널티 적용 (아군만)
        let applyFatigueTint = false;
        if (team === 'blue') {
            const fatigue = safeStats.fatigue || 0;
            const penaltyRate = this.scene.gameConfig?.gameSettings?.fatiguePenaltyRate ?? 0.05;
            const penaltyRatio = fatigue * penaltyRate;
            const multiplier = Math.max(0, 1 - penaltyRatio);

            if (fatigue > 0) {
                finalStats.hp = Math.floor(finalStats.hp * multiplier);
                finalStats.attackPower = Math.floor(finalStats.attackPower * multiplier);
                if (finalStats.defense) {
                    finalStats.defense = Math.floor(finalStats.defense * multiplier);
                }
                finalStats.moveSpeed = Math.floor(finalStats.moveSpeed * multiplier);
                applyFatigueTint = true;
            }
        }

        // 유닛 인스턴스 생성
        const unit = new UnitClass(this.scene, x, y, null, team, target, finalStats, isLeader);
        unit.setInteractive();

        if (stats.name) {
            unit.unitName = stats.name;
        }

        // 아군 설정
        if (team === 'blue') {
            this.scene.input.setDraggable(unit);
            if (applyFatigueTint) {
                unit.setTint(0x999999);
            }
        }

        return unit;
    }

    /**
     * 아군 유닛들 스폰
     */
    spawnBlueTeam(config, map, spawnZone) {
        const { startY, spawnGap } = config.gameSettings;
        const playerSquad = this.scene.registry.get('playerSquad') || [{ role: 'Leader' }];

        playerSquad.forEach((member, i) => {
            const roleConfig = { ...member };
            if (!roleConfig.name) {
                roleConfig.name = getRandomUnitName(roleConfig.role);
            }

            // Cats이 핀만 있는 경우, 리더가 아닌 다른 유닛은 스폰되지 않음
            const isLeader = (member.role === 'Leader');
            if (this.scene.catsPointOnly && !isLeader) {
                console.log(`⏭️ [Spawner] Skipping non-Leader unit (${member.role}) in point-only Cats zone`);
                return;
            }

            let spawnX, spawnY;

            // NPC를 유닛으로 변환
            let matchedNpc = null;
            if (this.scene.npcGroup) {
                matchedNpc = this.scene.npcGroup.getChildren().find(npc =>
                    npc.active &&
                    (npc.texture.key === member.role || 
                     npc.texture.key.toLowerCase() === member.role.toLowerCase())
                );
            }

            if (matchedNpc) {
                spawnX = matchedNpc.x;
                spawnY = matchedNpc.y;
                matchedNpc.destroy();
                console.log(`✨ [Spawner] NPC Transformed: ${member.role} at (${spawnX}, ${spawnY})`);
            } else if (spawnZone) {
                // 핀만 있는 경우 리더는 정확한 위치에, 그 외는 랜덤
                if (this.scene.catsPointOnly && isLeader) {
                    spawnX = this.scene.catsPoint.x;
                    spawnY = this.scene.catsPoint.y;
                } else {
                    spawnX = Phaser.Math.Between(spawnZone.x + 20, spawnZone.right - 20);
                    spawnY = Phaser.Math.Between(spawnZone.y + 20, spawnZone.bottom - 20);
                }
            } else {
                spawnX = 300;
                spawnY = startY + (i * spawnGap);
            }

            const unit = this.createUnitInstance(
                spawnX, spawnY, 'blue', 
                this.scene.redTeam, roleConfig, isLeader
            );
            unit.squadIndex = i;

            if (isLeader) {
                this.scene.playerUnit = unit;
            }

            this.scene.blueTeam.add(unit);
        });
    }

    /**
     * 적군 유닛들 스폰
     */
    spawnRedTeam(config, map, redSpawnArea, bossSpawnPoint) {
        const { startY, spawnGap } = config.gameSettings;

        // 적군 구성 결정
        let enemyRoster = [];
        if (this.scene.armyConfig) {
            const configs = Array.isArray(this.scene.armyConfig) 
                ? this.scene.armyConfig 
                : [this.scene.armyConfig];
            
            configs.forEach(cfg => {
                const count = cfg.count || 1;
                const type = cfg.type || 'NormalDog';
                const role = type.charAt(0).toUpperCase() + type.slice(1);
                for (let i = 0; i < count; i++) {
                    enemyRoster.push(role);
                }
            });
        } else {
            const redCount = config.gameSettings.redCount ?? 6;
            const defaultRedRoles = config.redTeamRoles || [config.redTeamStats];
            for (let i = 0; i < redCount; i++) {
                const stats = defaultRedRoles[i % defaultRedRoles.length];
                enemyRoster.push(stats.role || 'NormalDog');
            }
        }

        // 보스 유닛 선정
        let bossUnitRole = null;
        let bossIndex = -1;

        if (this.scene.armyConfig) {
            const priority = ['Boss', 'Tanker', 'Leader', 'Raccoon', 'Shooter', 'Healer', 'Runner'];
            
            // 정확한 매칭 시도
            for (const pRole of priority) {
                bossIndex = enemyRoster.findIndex(r => r === pRole);
                if (bossIndex !== -1) {
                    bossUnitRole = enemyRoster[bossIndex];
                    break;
                }
            }

            // 부분 매칭 시도
            if (bossIndex === -1) {
                for (const pRole of priority) {
                    bossIndex = enemyRoster.findIndex(r => r.includes(pRole));
                    if (bossIndex !== -1) {
                        bossUnitRole = enemyRoster[bossIndex];
                        break;
                    }
                }
            }

            // 첫 번째 유닛을 보스로
            if (bossIndex === -1 && enemyRoster.length > 0) {
                bossIndex = 0;
                bossUnitRole = enemyRoster[0];
            }
        }

        // 보스 유닛 스폰
        if (bossIndex !== -1) {
            let bossX, bossY;
            if (bossSpawnPoint) {
                bossX = bossSpawnPoint.x;
                bossY = bossSpawnPoint.y;
            } else if (redSpawnArea) {
                bossX = redSpawnArea.centerX;
                bossY = redSpawnArea.centerY;
            } else {
                bossX = 1300;
                bossY = startY;
            }

            const bossStats = {
                role: bossUnitRole,
                name: `Boss ${bossUnitRole}`,
                level: bossUnitRole === 'Tanker' ? 10 : (bossUnitRole === 'Raccoon' ? 3 : 10)
            };

            const bossUnit = this.createUnitInstance(
                bossX, bossY, 'red',
                this.scene.blueTeam, bossStats, false
            );

            // 보스 크기 증가
            if ((bossUnitRole === 'Boss' || bossUnitRole === 'Tanker') && bossUnit.team === 'red') {
                bossUnit.baseSize *= 2;
                bossUnit.resetVisuals();
            }

            this.scene.redTeam.add(bossUnit);
            enemyRoster.splice(bossIndex, 1);
        }

        // 일반 적군 스폰
        enemyRoster.forEach((role, i) => {
            const stats = { role: role, name: `${role} ${i + 1}` };
            let spawnX, spawnY;

            if (redSpawnArea) {
                spawnX = Phaser.Math.Between(redSpawnArea.x, redSpawnArea.right);
                spawnY = Phaser.Math.Between(redSpawnArea.y, redSpawnArea.bottom);
            } else {
                spawnX = 1300 + Phaser.Math.Between(-50, 50);
                spawnY = startY + (i * spawnGap);
            }

            const unit = this.createUnitInstance(
                spawnX, spawnY, 'red',
                this.scene.blueTeam, stats, false
            );

            this.scene.redTeam.add(unit);
        });

        this.scene.initialRedCount = this.scene.redTeam.getLength();
    }

    /**
     * 전체 유닛 스폰 프로세스
     */
    spawnAllUnits(config, map) {
        const { startY, spawnGap } = config.gameSettings;

        // 스폰 존 확인
        let spawnZone = null;
        this.scene.catsPointOnly = false;
        this.scene.catsPoint = null;

        if (map) {
            const catsLayer = map.getObjectLayer('Cats');
            if (catsLayer && catsLayer.objects.length > 0) {
                const obj = catsLayer.objects[0];
                
                // Cats이 핀만 있는 경우 (width: 0, height: 0)
                if (obj.width === 0 && obj.height === 0) {
                    this.scene.catsPointOnly = true;
                    this.scene.catsPoint = { x: obj.x, y: obj.y };
                    console.log(`📍 [Spawner] Cats is point-only at (${obj.x}, ${obj.y}) - only Leader will spawn`);
                    
                    // 핀 위치를 중심으로 작은 사각형 생성 (시각화용)
                    spawnZone = new Phaser.Geom.Rectangle(obj.x - 10, obj.y - 10, 20, 20);
                } else {
                    // Cats이 영역인 경우
                    this.scene.catsPointOnly = false;
                    spawnZone = new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height);
                    console.log(`📦 [Spawner] Cats is area-based - all units can spawn in zone`);
                }
                
                this.scene.placementZone = spawnZone;
                
                // 스폰 존 시각화
                this.scene.zoneGraphics = this.scene.add.graphics();
                this.scene.zoneGraphics.fillStyle(0x00ff00, 0.2);
                this.scene.zoneGraphics.fillRectShape(spawnZone);
                this.scene.zoneGraphics.setDepth(0);
            }
        }
        this.scene.catsArea = spawnZone;

        // 적군 스폰 영역 확인
        let redSpawnArea = null;
        let bossSpawnPoint = null;

        if (map) {
            const dogLayer = map.getObjectLayer('Dogs');
            if (dogLayer && dogLayer.objects.length > 0) {
                const areaObj = dogLayer.objects.find(obj => obj.width > 0 && obj.height > 0);
                if (areaObj) {
                    redSpawnArea = new Phaser.Geom.Rectangle(
                        areaObj.x, areaObj.y, 
                        areaObj.width, areaObj.height
                    );
                }

                const pointObj = dogLayer.objects.find(obj => !obj.width && !obj.height);
                if (pointObj) {
                    bossSpawnPoint = { x: pointObj.x, y: pointObj.y };
                }
            }
        }
        this.scene.dogsArea = redSpawnArea;

        // 유닛 스폰 실행
        this.spawnBlueTeam(config, map, spawnZone);
        this.spawnRedTeam(config, map, redSpawnArea, bossSpawnPoint);
    }

    /**
     * 신규 모집 유닛 스폰
     */
    spawnRecruitedUnit(memberConfig) {
        if (!memberConfig) return;

        console.log(`🆕 [Spawner] Spawning recruited unit: ${memberConfig.role}`);

        let spawnX = this.scene.playerUnit ? this.scene.playerUnit.x : 300;
        let spawnY = this.scene.playerUnit ? this.scene.playerUnit.y : 300;

        // NPC 변환 체크
        let matchedNpc = null;
        if (this.scene.npcGroup) {
            matchedNpc = this.scene.npcGroup.getChildren().find(npc =>
                npc.active &&
                (npc.texture.key === memberConfig.role || 
                 npc.texture.key.toLowerCase() === memberConfig.role.toLowerCase())
            );
        }

        if (matchedNpc) {
            spawnX = matchedNpc.x;
            spawnY = matchedNpc.y;
            matchedNpc.destroy();
            console.log(`✨ [Spawner] NPC Transformed at (${spawnX}, ${spawnY})`);
        } else {
            spawnX += Phaser.Math.Between(-60, 60);
            spawnY += Phaser.Math.Between(-60, 60);
        }

        const unit = this.createUnitInstance(
            spawnX, spawnY, 'blue',
            this.scene.redTeam, memberConfig, false
        );
        unit.squadIndex = this.scene.blueTeam.getLength();

        this.scene.blueTeam.add(unit);

        // 대형 오프셋 계산
        if (this.scene.playerUnit && this.scene.playerUnit.active) {
            unit.calculateFormationOffset(this.scene.playerUnit);
        }
    }
}
