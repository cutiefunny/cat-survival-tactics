import Phaser from 'phaser';

const mapJsonFiles = import.meta.glob('../../assets/maps/*.json', { eager: true });
const npcImageFiles = import.meta.glob('../../assets/npcs/*.png', { eager: true });

// ... (TILESET_MAPPING 생략 - 기존과 동일) ...
const TILESET_MAPPING = {
    'tileser_nature': new URL('../../assets/tilesets/TX_Tileset_Grass.png', import.meta.url).href,
    'tileset_trees': new URL('../../assets/tilesets/TX_Plant.png', import.meta.url).href,
    'City': new URL('../../assets/tilesets/City_20.jpg', import.meta.url).href,
    'City2': new URL('../../assets/tilesets/City_20_2.jpg', import.meta.url).href,
    'Park': new URL('../../assets/tilesets/park.png', import.meta.url).href,
    'Car': new URL('../../assets/tilesets/car.jpg', import.meta.url).href,
    'car': new URL('../../assets/tilesets/car.jpg', import.meta.url).href,
    'Street1': new URL('../../assets/tilesets/street1.jpg', import.meta.url).href,
    'street1': new URL('../../assets/tilesets/street1.jpg', import.meta.url).href,
    'Street2': new URL('../../assets/tilesets/street2.jpg', import.meta.url).href,
    'street2': new URL('../../assets/tilesets/street2.jpg', import.meta.url).href,
    'Street3': new URL('../../assets/tilesets/street3.jpg', import.meta.url).href,
    'street3': new URL('../../assets/tilesets/street3.jpg', import.meta.url).href,
    'Street4': new URL('../../assets/tilesets/street4.jpg', import.meta.url).href,
    'street4': new URL('../../assets/tilesets/street4.jpg', import.meta.url).href,
    'Road': new URL('../../assets/tilesets/road.jpg', import.meta.url).href,
    'road': new URL('../../assets/tilesets/road.jpg', import.meta.url).href,
    'baekam': new URL('../../assets/tilesets/baekam.jpg', import.meta.url).href,
    'mega_coffee': new URL('../../assets/tilesets/mega_coffee.jpg', import.meta.url).href,
    'Big_city': new URL('../../assets/tilesets/big_city.jpg', import.meta.url).href,
    'Big_Street': new URL('../../assets/tilesets/big_street.jpg', import.meta.url).href,
    'level5': new URL('../../assets/tilesets/road.jpg', import.meta.url).href,
    'level5-2': new URL('../../assets/tilesets/street2.jpg', import.meta.url).href,
    'level6': new URL('../../assets/tilesets/parking.jpg', import.meta.url).href,
};

export default class MapAssetManager {
    constructor(scene) {
        this.scene = scene;
        this.loadedMapKeys = [];
    }

    preload() {
        for (const path in mapJsonFiles) {
            const fileName = path.split('/').pop().replace('.json', '');
            this.scene.load.tilemapTiledJSON(fileName, mapJsonFiles[path].default || mapJsonFiles[path]);
            this.loadedMapKeys.push(fileName);
        }

        for (const path in npcImageFiles) {
            const fileName = path.split('/').pop().replace(/\.png$/i, '');
            this.scene.load.image(fileName, npcImageFiles[path].default || npcImageFiles[path]);
        }

        for (const [tiledName, filePath] of Object.entries(TILESET_MAPPING)) {
            this.scene.load.image(tiledName, filePath);
        }
    }

    createMap(mapKey) {
        if (!this.loadedMapKeys.includes(mapKey)) {
            mapKey = 'level0';
        }

        const map = this.scene.make.tilemap({ key: mapKey });
        const tilesets = [];

        map.tilesets.forEach(tilesetData => {
            const tilesetName = tilesetData.name;
            if (this.scene.textures.exists(tilesetName)) {
                const ts = map.addTilesetImage(tilesetName, tilesetName);
                if (ts) tilesets.push(ts);
            } else {
                const partialMatch = Object.keys(TILESET_MAPPING).find(key => tilesetName.includes(key));
                if (partialMatch && this.scene.textures.exists(partialMatch)) {
                    const ts = map.addTilesetImage(tilesetName, partialMatch);
                    if (ts) tilesets.push(ts);
                }
            }
        });

        const createLayerIfExist = (layerName) => {
            if (map.getLayer(layerName)) {
                return map.createLayer(layerName, tilesets, 0, 0);
            }
            return null;
        };

        const groundLayer = createLayerIfExist('Ground');
        const wallLayer = createLayerIfExist('Walls');
        const blockLayer = createLayerIfExist('Blocks');

        if (wallLayer) wallLayer.setCollisionByExclusion([-1]);
        if (blockLayer) blockLayer.setCollisionByExclusion([-1]);

        // Walls 오브젝트 그룹 생성
        const wallObjectGroup = this.scene.physics.add.staticGroup();
        const wallObjectLayer = map.getObjectLayer('Walls');
        
        if (wallObjectLayer) {
            wallObjectLayer.objects.forEach(obj => {
                const rect = this.scene.add.rectangle(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width, obj.height);
                this.scene.physics.add.existing(rect, true); 
                rect.setVisible(false); 
                wallObjectGroup.add(rect); 
            });
        }

        // Blocks 오브젝트 그룹 생성
        const blockObjectGroup = this.scene.physics.add.staticGroup();
        const blockObjectLayer = map.getObjectLayer('Blocks');
        
        if (blockObjectLayer) {
            blockObjectLayer.objects.forEach(obj => {
                const rect = this.scene.add.rectangle(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width, obj.height);
                this.scene.physics.add.existing(rect, true); 
                rect.setVisible(false); 
                blockObjectGroup.add(rect); 
            });
        }

        // [Modified] NPC 생성 및 스크립트 데이터 주입 (Raw Data 참조 로직 추가)
        const npcGroup = this.scene.physics.add.staticGroup();
        const npcLayer = map.getObjectLayer('NPC');

        // [New] Raw JSON 데이터 가져오기 (스크립트 복구용)
        let rawNpcObjects = [];
        if (this.scene.cache.tilemap.exists(mapKey)) {
            const rawData = this.scene.cache.tilemap.get(mapKey).data;
            if (rawData && rawData.layers) {
                const rawLayer = rawData.layers.find(l => l.name === 'NPC');
                if (rawLayer && rawLayer.objects) {
                    rawNpcObjects = rawLayer.objects;
                }
            }
        }
        
        if (npcLayer) {
            npcLayer.objects.forEach(obj => {
                const textureKey = obj.name; 
                if (this.scene.textures.exists(textureKey)) {
                    
                    const finalX = obj.x;
                    const finalY = obj.y;

                    const npc = npcGroup.create(finalX, finalY, textureKey);
                    
                    npc.setDisplaySize(obj.width, obj.height);
                    npc.setDepth(obj.y); 
                    
                    if (npc.body) {
                        npc.body.updateFromGameObject();
                    }

                    // [Modified] 스크립트 데이터 주입 로직 강화
                    // 1. Phaser 객체에 이미 있다면 사용
                    if (obj.script) {
                        npc.scriptData = obj.script;
                    } 
                    // 2. 없다면 Raw Data에서 id로 검색하여 복구
                    else {
                        const rawObj = rawNpcObjects.find(r => r.id === obj.id);
                        if (rawObj && rawObj.script) {
                            npc.scriptData = rawObj.script;
                            // console.log(`🔧 Script recovered for NPC ${textureKey} from raw JSON`);
                        }
                    }

                    if (npc.scriptData) {
                        console.log(`✅ NPC Created: ${textureKey} (Script Loaded: YES)`);
                    } else {
                        console.log(`✅ NPC Created: ${textureKey} (Script Loaded: NO)`);
                    }

                    npcGroup.add(npc);

                } else {
                    console.warn(`⚠️ NPC Texture missing: '${textureKey}'`);
                }
            });
        }

        return { map, layers: { groundLayer, wallLayer, blockLayer }, wallObjectGroup, blockObjectGroup, npcGroup };
    }
}