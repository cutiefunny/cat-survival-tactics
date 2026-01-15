import Phaser from 'phaser';

// 1. Vite의 glob 기능으로 맵 JSON 파일들을 자동 수집
const mapJsonFiles = import.meta.glob('../../assets/maps/*.json', { eager: true });

// 2. 타일셋 이미지 매핑
const TILESET_MAPPING = {
    'tileser_nature': new URL('../../assets/tilesets/TX_Tileset_Grass.png', import.meta.url).href,
    'tileset_trees': new URL('../../assets/tilesets/TX_Plant.png', import.meta.url).href,
    
    // [Fix] 대소문자 호환성을 위해 소문자 키 추가 및 매핑 보강
    'City': new URL('../../assets/tilesets/City_20.png', import.meta.url).href,
    'City2': new URL('../../assets/tilesets/City_20_2.png', import.meta.url).href,
    'Park': new URL('../../assets/tilesets/park.png', import.meta.url).href,
    
    'Car': new URL('../../assets/tilesets/car.png', import.meta.url).href,
    'car': new URL('../../assets/tilesets/car.png', import.meta.url).href, // 소문자 추가

    'Street1': new URL('../../assets/tilesets/street1.png', import.meta.url).href,
    'street1': new URL('../../assets/tilesets/street1.png', import.meta.url).href,

    'Street2': new URL('../../assets/tilesets/street2.png', import.meta.url).href,
    'street2': new URL('../../assets/tilesets/street2.png', import.meta.url).href, // 소문자 추가

    'Street3': new URL('../../assets/tilesets/street3.png', import.meta.url).href,
    'street3': new URL('../../assets/tilesets/street3.png', import.meta.url).href, // 소문자 추가

    'Street4': new URL('../../assets/tilesets/street4.png', import.meta.url).href,
    'street4': new URL('../../assets/tilesets/street4.png', import.meta.url).href,

    'Road': new URL('../../assets/tilesets/road.png', import.meta.url).href,
    'road': new URL('../../assets/tilesets/road.png', import.meta.url).href,

    'Big_city': new URL('../../assets/tilesets/big_city.png', import.meta.url).href,
    'Big_Street': new URL('../../assets/tilesets/big_street.png', import.meta.url).href,

    // 특정 레벨용 타일셋 매핑
    'level5': new URL('../../assets/tilesets/road.png', import.meta.url).href,
    'level5-2': new URL('../../assets/tilesets/street2.png', import.meta.url).href,
    'level6': new URL('../../assets/tilesets/parking.png', import.meta.url).href,
};

export default class MapAssetManager {
    constructor(scene) {
        this.scene = scene;
        this.loadedMapKeys = [];
    }

    preload() {
        // 1. 맵 JSON 자동 로드
        for (const path in mapJsonFiles) {
            const fileName = path.split('/').pop().replace('.json', '');
            this.scene.load.tilemapTiledJSON(fileName, mapJsonFiles[path].default || mapJsonFiles[path]);
            this.loadedMapKeys.push(fileName);
            console.log(`🗺️ [MapAssetManager] Auto-loaded Map: ${fileName}`);
        }

        // 2. 타일셋 이미지 로드
        for (const [tiledName, filePath] of Object.entries(TILESET_MAPPING)) {
            this.scene.load.image(tiledName, filePath);
        }
    }

    createMap(mapKey) {
        if (!this.loadedMapKeys.includes(mapKey)) {
            console.warn(`⚠️ Map key '${mapKey}' not found. Loading 'level0' instead.`);
            mapKey = 'level0';
        }

        const map = this.scene.make.tilemap({ key: mapKey });
        const tilesets = [];

        // 3. 스마트 타일셋 연결
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
                } else {
                    console.warn(`❌ Missing Tileset Image for: '${tilesetName}'`);
                }
            }
        });

        // [Fix] 레이어가 존재할 때만 생성하도록 안전 장치 추가
        const createLayerIfExist = (layerName) => {
            // 타일 레이어 데이터 확인
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

        // 디버그용 (블록 오브젝트)
        const blockObjectGroup = this.scene.physics.add.staticGroup();
        const blockObjectLayer = map.getObjectLayer('Blocks');
        
        if (blockObjectLayer) {
            blockObjectLayer.objects.forEach(obj => {
                const rect = this.scene.add.rectangle(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width, obj.height);
                this.scene.physics.add.existing(rect, true); 
                rect.setVisible(false); 
                
                // [Fix] this.scene.blockObjectGroup 대신 지역 변수 blockObjectGroup 사용
                blockObjectGroup.add(rect); 
            });
        }

        return { map, layers: { groundLayer, wallLayer, blockLayer }, blockObjectGroup };
    }
}