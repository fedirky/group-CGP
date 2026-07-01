import * as THREE from '../three.r168.module.js';

import { getChunk, ensureChunkFeatures } from '../world/terrain_generator.js';

import { computeFaceAO, patchMaterialWithAO, patchBlockLight, AO_OFFSETS } from '../voxelAO.js';

import { getLayer, getAtlasMaterial } from './blockAtlas.js';
import { patchWaterShader } from './shaders/WaterShader.js';
import { computeChunkLight } from '../world/blockLight.js';
import { RENDER_CONFIG, WATER_CONFIG, WORLD_CONFIG } from '../config.js';


const textures = `../resources/texturepacks/default`;

const globalBumpScale = 0.8;

const textureLoader = new THREE.TextureLoader();
const materials = {};

// Per-chunk render data. Each chunk bakes ONE merged BufferGeometry per material
// (a single draw call, tightly sized) instead of thousands of InstancedMesh
// faces — far less memory churn and GPU upload, which is what makes streaming
// smooth. chunkMeshes["cx,cz"] = { meshes: [Mesh, ...] }
const chunkMeshes = {};

const chunkKey = (cx, cz) => `${cx},${cz}`;


// --- Precomputed face quads --------------------------------------------------
// Corner offsets (relative to a block centre) + UVs for each of the six faces,
// derived once from the same rotations the old per-face planes used so textures
// keep their orientation. PlaneGeometry vertex order: TL, TR, BL, BR.
const _PLANE = [
    { p: [-0.5,  0.5, 0], uv: [0, 1] }, // v0 top-left
    { p: [ 0.5,  0.5, 0], uv: [1, 1] }, // v1 top-right
    { p: [-0.5, -0.5, 0], uv: [0, 0] }, // v2 bottom-left
    { p: [ 0.5, -0.5, 0], uv: [1, 0] }, // v3 bottom-right
];

const _FACE_DEFS = {
    left:  { offset: [-1, 0, 0], rotation: [0, -Math.PI / 2, 0] },
    right: { offset: [1, 0, 0],  rotation: [0, Math.PI / 2, 0] },
    down:  { offset: [0, -1, 0], rotation: [Math.PI / 2, 0, 0] },
    up:    { offset: [0, 1, 0],  rotation: [-Math.PI / 2, 0, 0] },
    back:  { offset: [0, 0, -1], rotation: [0, Math.PI, 0] },
    front: { offset: [0, 0, 1],  rotation: [0, 0, 0] },
};

const FACE_QUADS = {};
(function buildFaceQuads() {
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    for (const dir in _FACE_DEFS) {
        const { offset, rotation } = _FACE_DEFS[dir];
        m.makeRotationFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2]));
        const verts = _PLANE.map(({ p }) => {
            v.set(p[0], p[1], p[2]).applyMatrix4(m);
            return [v.x + 0.5 * offset[0], v.y + 0.5 * offset[1], v.z + 0.5 * offset[2]];
        });
        FACE_QUADS[dir] = { normal: offset.slice(), verts, uvs: _PLANE.map((c) => c.uv) };
    }
})();


// The six face directions (constant; hoisted so it isn't re-allocated per block).
const NEIGHBORS = [
    { offset: [-1, 0, 0], isTopFace: false, direction: 'left' },
    { offset: [1, 0, 0],  isTopFace: false, direction: 'right' },
    { offset: [0, -1, 0], isTopFace: false, direction: 'down' },
    { offset: [0, 1, 0],  isTopFace: true,  direction: 'up' },
    { offset: [0, 0, -1], isTopFace: false, direction: 'back' },
    { offset: [0, 0, 1],  isTopFace: false, direction: 'front' },
];

const WATER_PATH_BLUR_RADIUS = WATER_CONFIG.pathBlurRadius;
const WATER_PATH_BLUR_FALLOFF = WATER_CONFIG.pathBlurFalloff;

// A geometry accumulator for one material within one chunk.
function newBuilder(material, withAO, withLayer, withWater) {
    return {
        pos: [], norm: [], uv: [],
        light: [],                     // baked per-vertex block light (RGB)
        shade: withAO ? [] : null,
        layer: withLayer ? [] : null,
        wpath: withWater ? [] : null, // center water depth used for ray path length
        idx: [], vcount: 0, material,
    };
}

// Push one RGB block light onto all 4 vertices (flat; used for flowers).
function pushLight(b, light) {
    for (let k = 0; k < 4; k++) b.light.push(light[0], light[1], light[2]);
}

// Push a distinct RGB per vertex (smooth block light on block/water faces).
function pushLight4(b, l4) {
    for (let k = 0; k < 4; k++) b.light.push(l4[k][0], l4[k][1], l4[k][2]);
}

// Smooth per-vertex block light: for each face corner, average the four air-side
// cells meeting at it (bilinear -> no hard per-cell steps). (bx,by,bz) = block
// integer world coords; the air side is at +normal.
const _l4 = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
function faceLight4(lightField, bx, by, bz, direction) {
    const n = FACE_QUADS[direction].normal;
    const table = AO_OFFSETS[direction];
    for (let k = 0; k < 4; k++) {
        const o = table[k];
        let r = 0, g = 0, bl = 0;
        let L = lightField.at(bx + n[0], by + n[1], bz + n[2]); r += L[0]; g += L[1]; bl += L[2];
        L = lightField.at(bx + o.s1[0], by + o.s1[1], bz + o.s1[2]); r += L[0]; g += L[1]; bl += L[2];
        L = lightField.at(bx + o.s2[0], by + o.s2[1], bz + o.s2[2]); r += L[0]; g += L[1]; bl += L[2];
        L = lightField.at(bx + o.c[0], by + o.c[1], bz + o.c[2]); r += L[0]; g += L[1]; bl += L[2];
        _l4[k][0] = r * 0.25; _l4[k][1] = g * 0.25; _l4[k][2] = bl * 0.25;
    }
    return _l4;
}

// Append one water face (simple quad). The shader derives both colour and
// opacity from the interpolated view-ray path length.
function addWaterFace(b, dir, x, y, z, paths, light4) {
    const q = FACE_QUADS[dir];
    const base = b.vcount;
    for (let k = 0; k < 4; k++) {
        const vert = q.verts[k];
        b.pos.push(x + vert[0], y + vert[1], z + vert[2]);
        b.norm.push(q.normal[0], q.normal[1], q.normal[2]);
        b.uv.push(q.uvs[k][0], q.uvs[k][1]);
        b.wpath.push(paths[k]);
    }
    pushLight4(b, light4);
    b.vcount += 4;
    b.idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
}

// Append one block face (with per-corner AO, optional atlas layer, and the
// anisotropy-avoiding triangulation flip).
function addFace(b, dir, x, y, z, ao, layer, light4) {
    const q = FACE_QUADS[dir];
    const base = b.vcount;
    for (let k = 0; k < 4; k++) {
        const vert = q.verts[k];
        b.pos.push(x + vert[0], y + vert[1], z + vert[2]);
        b.norm.push(q.normal[0], q.normal[1], q.normal[2]);
        b.uv.push(q.uvs[k][0], q.uvs[k][1]);
        b.shade.push(ao[k]);
        if (b.layer) b.layer.push(layer);
    }
    pushLight4(b, light4);
    b.vcount += 4;
    // Split along the brighter diagonal so a dark corner doesn't bleed across.
    if (ao[0] + ao[3] > ao[1] + ao[2]) {
        b.idx.push(base, base + 2, base + 3, base, base + 3, base + 1);
    } else {
        b.idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
}

// Append one rotated/translated quad (used for flower billboards; no AO).
const _qm = new THREE.Matrix4();
const _qe = new THREE.Euler();
const _qv = new THREE.Vector3();
const _qn = new THREE.Vector3();
function addQuad(b, px, py, pz, ex, ey, ez, light) {
    _qm.makeRotationFromEuler(_qe.set(ex, ey, ez));
    const base = b.vcount;
    for (let k = 0; k < 4; k++) {
        const p = _PLANE[k].p;
        _qv.set(p[0], p[1], p[2]).applyMatrix4(_qm);
        _qn.set(0, 0, 1).applyMatrix4(_qm);
        b.pos.push(px + _qv.x, py + _qv.y, pz + _qv.z);
        b.norm.push(_qn.x, _qn.y, _qn.z);
        b.uv.push(_PLANE[k].uv[0], _PLANE[k].uv[1]);
    }
    pushLight(b, light);
    b.vcount += 4;
    b.idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
}

// Turn an accumulator into a Mesh (tightly-sized buffers + bounding sphere for
// frustum culling). Returns null if nothing was emitted.
function finalizeBuilder(b) {
    if (b.vcount === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
    if (b.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('blockLight', new THREE.Float32BufferAttribute(b.light, 3));
    if (b.shade) g.setAttribute('aoShade', new THREE.Float32BufferAttribute(b.shade, 1));
    if (b.layer) g.setAttribute('layer', new THREE.Float32BufferAttribute(b.layer, 1));
    if (b.wpath) g.setAttribute('wpath', new THREE.Float32BufferAttribute(b.wpath, 1));
    g.setIndex(b.vcount > 65535
        ? new THREE.Uint32BufferAttribute(b.idx, 1)
        : new THREE.Uint16BufferAttribute(b.idx, 1));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, b.material);
}


function getBlockTexture(block, isTopFace = false) {

    let texturePath, bumpPath, emissivePath;
    let texture;

    if (block === 'grass') {
        texturePath = isTopFace ? `${textures}/blocks/grass.png` : `${textures}/blocks/grass_side.png`;
        bumpPath = `${textures}blocks/dirt_bump.png`;
        emissivePath = `${textures}/blocks/no_bump.png`;
    } else if (block === 'water') {
        texturePath = `${textures}/blocks/water_16x16.mp4`;
        bumpPath = `${textures}/blocks/no_bump.png`;
        emissivePath = `${textures}/blocks/no_bump.png`;
    } else {
        texturePath = `${textures}/blocks/${block}.png`;
        bumpPath = `${textures}/blocks/${block}_bump.png`;
        emissivePath = `${textures}/blocks/${block}_emissive.png`
    }

    if (block === 'water') {
        const video = document.createElement('video');
        video.src = texturePath;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
    
        video.addEventListener('loadeddata', () => {
            video.play();
        });
    
        texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace; // Додаємо правильний колірний простір
        texture.minFilter = THREE.NearestFilter; // Вимикаємо міпмапи
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false; // Вимикаємо генерацію міпмапів
    } 
    else {
        texture = textureLoader.load(texturePath);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapNearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 16;
    }

    const bumpMap = textureLoader.load(bumpPath);
    bumpMap.minFilter = THREE.LinearMipmapNearestFilter;
    bumpMap.magFilter = THREE.NearestFilter;
    bumpMap.generateMipmaps = true;
    bumpMap.anisotropy = 16;

    const emissiveMap = textureLoader.load(emissivePath);
    emissiveMap.minFilter = THREE.LinearMipmapNearestFilter;
    emissiveMap.magFilter = THREE.NearestFilter;
    emissiveMap.generateMipmaps = true;
    emissiveMap.anisotropy = 16;

    return { map: texture, bumpMap: bumpMap, emissiveMap: emissiveMap };
}


function getBlockMaterial(block, isTopFace = false) {
    const textureKey = isTopFace && block === 'grass' ? 'grass_top' : block;

    if (!materials[textureKey]) {
        const { map, bumpMap, emissiveMap } = getBlockTexture(block, isTopFace);
        const baseConfig = {
            map: map,
            bumpMap: bumpMap,
            bumpScale: globalBumpScale,
            side: THREE.FrontSide,
        };

        let materialConfig = { ...baseConfig };

        if (block === 'ice') {
            Object.assign(materialConfig, {
                shininess: 10,
                specular: new THREE.Color(0x99ccff),
            });
            materials[textureKey] = new THREE.MeshPhongMaterial(materialConfig);
        } else if (block.includes('oak_gold')) {
            Object.assign(materialConfig, {
                emissiveMap: emissiveMap,
                emissive: new THREE.Color(0xA48601),
                emissiveIntensity: 0.45,
                depthWrite: true,
            });
            materials[textureKey] = new THREE.MeshPhongMaterial(materialConfig);
        } else if (block.includes('skyroot_leaves_berry')) {
            Object.assign(materialConfig, {
                emissiveMap: emissiveMap,
                emissive: new THREE.Color(0x2D3D59),
                emissiveIntensity: 0.35,
                depthWrite: true,
            });
            materials[textureKey] = new THREE.MeshPhongMaterial(materialConfig);
        } else {
            materials[textureKey] = new THREE.MeshLambertMaterial(materialConfig);
        }

        patchMaterialWithAO(materials[textureKey]);
    }

    return materials[textureKey];
}



function createFlowerPlaneMaterial(flowerType) {
    if (!materials[flowerType]) {
        const texture = textureLoader.load(`${textures}/flowers/${flowerType}.png`);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapNearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = true;

        materials[flowerType] = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true, // Ensure transparency works for flowers
            alphaTest: 0.5,
        });

        if (flowerType == "flower_glowberries") {

            const emissive_texture = textureLoader.load(`${textures}/flowers/${flowerType}_emissive.png`);
            emissive_texture.colorSpace = THREE.SRGBColorSpace;
            emissive_texture.minFilter = THREE.LinearMipmapNearestFilter;
            emissive_texture.magFilter = THREE.NearestFilter;
            emissive_texture.generateMipmaps = true;

            materials[flowerType] = new THREE.MeshStandardMaterial({
                map: texture,
                side: THREE.DoubleSide,
                transparent: true, // Ensure transparency works for flowers
                alphaTest: 0.5,
                emissiveMap: emissive_texture,
                emissive: new THREE.Color(0xEA8931),
                emissiveIntensity: 0.75,
            });

        }

        // Flowers/grass receive baked berry light too.
        patchBlockLight(materials[flowerType]);
    }
    return materials[flowerType];
}


// Deterministic 0..1 value hashed from integer coordinates (+ salt). Used for
// decoration offsets so grass/flowers keep the SAME position when a chunk is
// rebuilt after breaking a block (instead of re-rolling Math.random()).
function hashUnit(x, y, z, salt) {
    let h = 2166136261;
    h = Math.imul(h ^ (x | 0), 16777619);
    h = Math.imul(h ^ (y | 0), 16777619);
    h = Math.imul(h ^ (z | 0), 16777619);
    h = Math.imul(h ^ (salt | 0), 16777619);
    // murmur3 fmix32 finalizer — strong avalanche so different salts decorrelate.
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}


// Bake a flower's billboard quads into a merged geometry builder. Offsets are
// deterministic (hash-based) so they stay put when a chunk is rebuilt.
function addFlower(b, posX, posY, posZ, flowerType, light) {
    if (flowerType === 'flower_lily') {
        // Lily: flat, horizontal, with a deterministic 90° rotation.
        const rotationZ = (Math.floor(hashUnit(posX, posY, posZ, 0) * 3) + 1) * Math.PI / 2;
        addQuad(b, posX, posY - 0.62, posZ, -Math.PI / 2, 0, rotationZ, light);
    } else {
        let shiftX = (Math.floor(hashUnit(posX, posY, posZ, 1) * 3) - 1) / 16;
        let shiftZ = (Math.floor(hashUnit(posX, posY, posZ, 2) * 3) - 1) / 16;
        if (flowerType === 'flower_sugar_cane') { shiftX = 0; shiftZ = 0; }

        // Two crossed planes.
        addQuad(b, posX + shiftX, posY, posZ + shiftZ, 0, -Math.PI / 4, 0, light);
        addQuad(b, posX + shiftX, posY, posZ + shiftZ, 0, Math.PI / 4, 0, light);
    }
}


// Water column depth (in blocks) that maps to the fully-deep colour.
const WATER_MAX_DEPTH = WATER_CONFIG.maxDepth;

let waterMaterial = null;
let waterTexture = null;

// Transparent, depth-tinted water. Depth colour comes from the water column
// depth, while opacity comes from view-ray absorption.
function getWaterMaterial() {
    if (waterMaterial) return waterMaterial;

    if (!waterTexture) {
        waterTexture = textureLoader.load(`${textures}/liquids/water.png`);
        waterTexture.colorSpace = THREE.SRGBColorSpace;
        waterTexture.minFilter = THREE.LinearMipmapNearestFilter;
        waterTexture.magFilter = THREE.NearestFilter;
        waterTexture.generateMipmaps = true;
        waterTexture.anisotropy = 16;
    }

    waterMaterial = new THREE.MeshLambertMaterial({
        map: waterTexture,
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        forceSinglePass: true,
    });

    waterMaterial.onBeforeCompile = patchWaterShader;

    return waterMaterial;
}


function renderChunk(scene, chunkX, chunkZ) {
    const cubeSize = 1;
    const CHUNK_SIZE = WORLD_CONFIG.chunkSize;

    const chunkData = getChunk(chunkX, chunkZ);
    if (!chunkData) return;

    const H = chunkData[0][0].length;
    const baseX = chunkX * CHUNK_SIZE;
    const baseZ = chunkZ * CHUNK_SIZE;

    // Baked block-light field for this chunk (seeded from nearby glowing blocks).
    const lightField = computeChunkLight(chunkX, chunkZ);

    // One merged-geometry builder per material in this chunk. Atlased blocks all
    // share a single builder (one draw call); special/water blocks keep their own.
    const builders = {};       // materialKey -> block builder (with AO)
    const flowerBuilders = {}; // flowerType  -> flower builder (no AO)
    let atlasBuilder = null;
    let waterBuilder = null;

    const getAtlasBuilder = () => {
        if (!atlasBuilder) atlasBuilder = newBuilder(getAtlasMaterial(), true, true, false);
        return atlasBuilder;
    };
    const getWaterBuilder = () => {
        if (!waterBuilder) waterBuilder = newBuilder(getWaterMaterial(), false, false, true);
        return waterBuilder;
    };
    const getBuilder = (materialKey, block, isTopFace) => {
        let b = builders[materialKey];
        if (!b) { b = newBuilder(getBlockMaterial(block, isTopFace), true, false, false); builders[materialKey] = b; }
        return b;
    };
    const getFlowerBuilder = (type) => {
        let b = flowerBuilders[type];
        if (!b) { b = newBuilder(createFlowerPlaneMaterial(type), false, false, false); flowerBuilders[type] = b; }
        return b;
    };

    // Block name at LOCAL chunk coords. Interior reads the chunk array directly
    // (fast); only the surrounding 1-block ring falls back to getChunk.
    const blockAtLocal = (lx, ly, lz) => {
        if (ly < 0 || ly >= H) return 'air';
        if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
            const c = chunkData[lx][lz][ly];
            return c ? c.block : 'air';
        }
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const ch = getChunk(cx, cz);
        if (!ch) return 'air';
        const cell = ch[wx - cx * CHUNK_SIZE]?.[wz - cz * CHUNK_SIZE]?.[ly];
        return cell ? cell.block : 'air';
    };

    // AO occluder test (1 = solid cube). Air, water and flowers don't occlude.
    // Only "flower_" blocks start with 'f', so a char check replaces startsWith.
    const isOcc = (lx, ly, lz) => {
        const b = blockAtLocal(lx, ly, lz);
        if (b === 'air' || b === 'water' || b.charCodeAt(0) === 102) return 0;
        return 1;
    };

    // Water column depth in blocks (down from surface ly), capped. Cached per
    // column so it's scanned only once per chunk build.
    const rawCache = new Map();
    const waterDepth = (cx, cz, ly) => {
        const key = cx + ',' + cz + ',' + ly;
        const hit = rawCache.get(key);
        if (hit !== undefined) return hit;
        let d = 0;
        while (d < WATER_MAX_DEPTH && blockAtLocal(cx, ly - d, cz) === 'water') d++;
        rawCache.set(key, d);
        return d;
    };

    const waterPathAtCorner = (lx, lz, ly, sx, sz) => {
        let sum = 0;
        let weightSum = 0;
        const cornerX = lx + sx * 0.5;
        const cornerZ = lz + sz * 0.5;

        for (let oz = -WATER_PATH_BLUR_RADIUS; oz <= WATER_PATH_BLUR_RADIUS; oz++) {
            for (let ox = -WATER_PATH_BLUR_RADIUS; ox <= WATER_PATH_BLUR_RADIUS; ox++) {
                const cx = lx + ox;
                const cz = lz + oz;
                const d = waterDepth(cx, cz, ly);
                if (d <= 0) continue;

                const dx = cx - cornerX;
                const dz = cz - cornerZ;
                const weight = Math.exp(-(dx * dx + dz * dz) * WATER_PATH_BLUR_FALLOFF);
                sum += d * weight;
                weightSum += weight;
            }
        }

        return weightSum > 0 ? sum / weightSum : waterDepth(lx, lz, ly);
    };

    const waterPathCorners = (lx, lz, ly) => [
        waterPathAtCorner(lx, lz, ly, -1, -1),
        waterPathAtCorner(lx, lz, ly,  1, -1),
        waterPathAtCorner(lx, lz, ly, -1,  1),
        waterPathAtCorner(lx, lz, ly,  1,  1),
    ];

    const emitFace = (block, lx, ly, lz, isTopFace, direction, yShift) => {
        const wx = baseX + lx, wy = ly + yShift, wz = baseZ + lz;

        // Smooth per-vertex block light for this face.
        const light4 = faceLight4(lightField, baseX + lx, ly, baseZ + lz, direction);

        if (block === 'water') {
            addWaterFace(getWaterBuilder(), direction, wx, wy, wz, waterPathCorners(lx, lz, ly), light4);
            return;
        }

        const materialKey = block === 'grass' && isTopFace ? 'grass_top' : block;
        const ao = computeFaceAO(direction, lx, ly, lz, isOcc);
        const layer = getLayer(materialKey);
        if (layer >= 0) {
            addFace(getAtlasBuilder(), direction, wx, wy, wz, ao, layer, light4);
        } else {
            addFace(getBuilder(materialKey, block, isTopFace), direction, wx, wy, wz, ao, null, light4);
        }
    };

    for (let x = 0; x < CHUNK_SIZE; x++) {
        const column = chunkData[x];
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const row = column[z];
            for (let y = 0; y < H; y++) {
                const cell = row[y];
                const block = cell && cell.block;
                if (!block || block === 'air') continue;

                if (block.charCodeAt(0) === 102 /* 'f' */ && block.startsWith('flower_')) {
                    const flight = lightField.at(baseX + x, y, baseZ + z);
                    addFlower(getFlowerBuilder(block), baseX + x, y, baseZ + z, block, flight);
                    continue;
                }

                const isWater = block === 'water';

                for (let n = 0; n < 6; n++) {
                    const nb = NEIGHBORS[n];
                    const off = nb.offset;
                    const neighborBlock = blockAtLocal(x + off[0], y + off[1], z + off[2]);

                    const exposed = neighborBlock === 'air' ||
                        (neighborBlock.charCodeAt(0) === 102 && neighborBlock.startsWith('flower_'));

                    if (isWater) {
                        if (nb.isTopFace && exposed) {
                            emitFace(block, x, y, z, true, nb.direction, -cubeSize / 8);
                        }
                    } else if (exposed || neighborBlock === 'water') {
                        emitFace(block, x, y, z, nb.isTopFace, nb.direction, 0);
                    }
                }
            }
        }
    }

    const meshes = [];
    const pushMesh = (b) => {
        const mesh = finalizeBuilder(b);
        if (mesh) { scene.add(mesh); meshes.push(mesh); }
    };

    if (atlasBuilder) pushMesh(atlasBuilder);          // all atlased blocks
    for (const k in builders) pushMesh(builders[k]);   // special blocks (ice/gold/berry)
    for (const k in flowerBuilders) pushMesh(flowerBuilders[k]);
    if (waterBuilder) pushMesh(waterBuilder);          // transparent water last

    chunkMeshes[chunkKey(chunkX, chunkZ)] = { meshes };
}


// Remove a chunk's meshes/lights from the scene and free their geometries.
// Materials are shared and cached, so they are intentionally left untouched.
function clearChunk(scene, chunkX, chunkZ) {
    const key = chunkKey(chunkX, chunkZ);
    const entry = chunkMeshes[key];
    if (!entry) return;

    entry.meshes.forEach((mesh) => {
        scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
    });

    delete chunkMeshes[key];
}


// Tear down and rebuild a single chunk (re-evaluating faces, AO and lighting).
export function rebuildChunk(scene, chunkX, chunkZ) {
    clearChunk(scene, chunkX, chunkZ);
    renderChunk(scene, chunkX, chunkZ);
}


// --- Infinite world streaming -----------------------------------------------

const _dirtyChunks = new Set(); // built chunks that need rebuilding (e.g. tree spill)
const BUILD_BUDGET = RENDER_CONFIG.buildBudget; // max chunk meshes built per update (avoids hitches)

function markNeighboursDirty(fx, fz) {
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const key = chunkKey(fx + dx, fz + dz);
            if (chunkMeshes[key]) _dirtyChunks.add(key);
        }
    }
}

function buildChunkMesh(scene, cx, cz) {
    // Generate decorations for this chunk and its neighbours so cross-chunk tree
    // canopies are present before the mesh is built. If a neighbour's features
    // are generated now, its spill can dirty already-built chunks -> rebuild them.
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            if (ensureChunkFeatures(cx + dx, cz + dz)) {
                markNeighboursDirty(cx + dx, cz + dz);
            }
        }
    }
    rebuildChunk(scene, cx, cz);
    _dirtyChunks.delete(chunkKey(cx, cz));
}

// Stream chunk meshes around a centre chunk: unload distant ones, build the
// nearest missing/dirty ones (bounded per call so the frame rate stays smooth).
export function updateChunks(scene, centerCX, centerCZ, renderDistance) {
    const unloadR = renderDistance + 1;

    // Unload meshes that drifted out of range (cheap; do them all).
    for (const key of Object.keys(chunkMeshes)) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - centerCX) > unloadR || Math.abs(cz - centerCZ) > unloadR) {
            clearChunk(scene, cx, cz);
            _dirtyChunks.delete(key);
        }
    }

    // Collect missing/dirty chunks in range, nearest first.
    const todo = [];
    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
        for (let dz = -renderDistance; dz <= renderDistance; dz++) {
            const cx = centerCX + dx;
            const cz = centerCZ + dz;
            const key = chunkKey(cx, cz);
            if (!chunkMeshes[key] || _dirtyChunks.has(key)) {
                todo.push({ cx, cz, d: dx * dx + dz * dz });
            }
        }
    }
    todo.sort((a, b) => a.d - b.d);

    for (let i = 0; i < todo.length && i < BUILD_BUDGET; i++) {
        buildChunkMesh(scene, todo[i].cx, todo[i].cz);
    }
}




export function renderClouds(scene) {
    const cloudGroup = new THREE.Group();
    const cloudCount = 64;
    const cubeSize = 1;
    const maxInstancesPerMesh = 1024;
    const minWidth = 8, maxWidth = 16;
    const minLength = 16, maxLength = 32;
    const minAltitude = 64, maxAltitude = 96;
    const spreadDistance = 512;
    const tempMatrix = new THREE.Matrix4();

    // Define directions and rotations for each face of the cube
    const directions = [
        { offset: [-1, 0, 0], rotation: [0, Math.PI / 2, 0] },   // Left
        { offset: [1, 0, 0], rotation: [0, -Math.PI / 2, 0] },   // Right
        { offset: [0, -1, 0], rotation: [Math.PI / 2, 0, 0] },   // Bottom
        { offset: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0] },   // Top
        { offset: [0, 0, -1], rotation: [0, 0, 0] },             // Front
        { offset: [0, 0, 1], rotation: [0, Math.PI, 0] }         // Back
    ];

    // Loop through to create cloud clusters
    for (let i = 0; i < cloudCount; i++) {
        const segmentCount = THREE.MathUtils.randInt(1, 3); // Number of segments in each cloud
        const altitude = THREE.MathUtils.lerp(minAltitude, maxAltitude, Math.random()); // Set uniform altitude for all segments in a cloud
        const distance = THREE.MathUtils.randFloat(0, spreadDistance);
        const angle = Math.random() * Math.PI * 2;

        // Create a unified 3D array to represent the entire cloud and avoid duplicates
        const cloudWidth = maxWidth * segmentCount;
        const cloudLength = maxLength * segmentCount;
        const cloudShape = Array.from({ length: cloudWidth }, () => 
            Array.from({ length: cloudLength }, () => Array(2).fill(false))
        );

        for (let s = 0; s < segmentCount; s++) {
            const segmentWidth = THREE.MathUtils.randInt(minWidth, maxWidth);
            const segmentLength = THREE.MathUtils.randInt(minLength, maxLength);

            // Random offset for each segment to position them close to each other
            const offsetX = THREE.MathUtils.randInt(0, cloudWidth - segmentWidth);
            const offsetZ = THREE.MathUtils.randInt(0, cloudLength - segmentLength);

            // Fill blocks in the unified cloudShape array without duplicates
            for (let x = 0; x < segmentWidth; x++) {
                for (let z = 0; z < segmentLength; z++) {
                    for (let y = 0; y < 2; y++) { // Height of 2 for volumetric effect
                        cloudShape[offsetX + x][offsetZ + z][y] = true;
                    }
                }
            }
        }

        // Create instanced meshes for this cloud cluster
        const instancedMeshes = [];
        let instancedMesh;

        for (let x = 0; x < cloudWidth; x++) {
            for (let z = 0; z < cloudLength; z++) {
                for (let y = 0; y < 2; y++) { // Height of 2 for volumetric effect
                    if (!cloudShape[x][z][y]) continue; // Skip empty blocks

                    const posX = x - cloudWidth / 2;
                    const posY = y;
                    const posZ = z - cloudLength / 2;

                    // Check for instanced mesh capacity
                    if (!instancedMesh || instancedMesh.count >= maxInstancesPerMesh - 6) {
                        const geometry = new THREE.PlaneGeometry(cubeSize, cubeSize);
                        const material = new THREE.MeshLambertMaterial({
                            color: 0xffffff,
                            transparent: false,
                            opacity: 0.8,
                            depthWrite: true,
                            side: THREE.DoubleSide
                        });
                        instancedMesh = new THREE.InstancedMesh(geometry, material, maxInstancesPerMesh);
                        instancedMesh.count = 0;
                        instancedMeshes.push(instancedMesh);
                        cloudGroup.add(instancedMesh);
                    }

                    // Add faces for visible sides only
                    directions.forEach(({ offset, rotation }) => {
                        const [nx, ny, nz] = [x + offset[0], y + offset[1], z + offset[2]];
                        const isEdgeBlock = 
                            nx < 0 || nx >= cloudWidth || 
                            nz < 0 || nz >= cloudLength || 
                            ny < 0 || ny >= 2 || !cloudShape[nx]?.[nz]?.[ny]; // Add faces if adjacent block is undefined or out of bounds

                        if (isEdgeBlock) {
                            tempMatrix.compose(
                                new THREE.Vector3(
                                    posX * cubeSize + offset[0] * cubeSize / 2 + Math.cos(angle) * distance,
                                    posY * cubeSize + offset[1] * cubeSize / 2 + altitude,
                                    posZ * cubeSize + offset[2] * cubeSize / 2 + Math.sin(angle) * distance
                                ),
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
                                new THREE.Vector3(1, 1, 1)
                            );
                            instancedMesh.setMatrixAt(instancedMesh.count++, tempMatrix);
                        }
                    });
                }
            }
        }

        // Ensure all instance matrices are updated for rendering
        instancedMeshes.forEach(mesh => {
            mesh.instanceMatrix.needsUpdate = true;
        });
    }

    scene.add(cloudGroup);
    return cloudGroup;
}
