import { WATER_CONFIG, WORLD_CONFIG } from '../config.js';
import { getBlockAt, setBlock } from './terrain_generator.js';
import { invalidateChunkSources } from './blockLight.js';

const CHUNK_SIZE = WORLD_CONFIG.chunkSize;
const WATER_LEVEL = WATER_CONFIG.level;
const FLOOD_CAP = WATER_CONFIG.floodCap;

const chunkKey = (cx, cz) => `${cx},${cz}`;

// Rebuild the block's chunk AND its 3x3 chunk neighbourhood, because baked block
// light spans up to one chunk away and must be repropagated.
function addAffectedChunks(set, wx, wz) {
    const ccx = Math.floor(wx / CHUNK_SIZE);
    const ccz = Math.floor(wz / CHUNK_SIZE);
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            set.add(chunkKey(ccx + dx, ccz + dz));
        }
    }
}

function hasWaterNeighbor(x, y, z) {
    return getBlockAt(x - 1, y, z) === 'water' || getBlockAt(x + 1, y, z) === 'water' ||
           getBlockAt(x, y, z - 1) === 'water' || getBlockAt(x, y, z + 1) === 'water' ||
           getBlockAt(x, y - 1, z) === 'water' || getBlockAt(x, y + 1, z) === 'water';
}

function floodWater(sx, sy, sz, affected) {
    if (sy > WATER_LEVEL || getBlockAt(sx, sy, sz) !== 'air') return;
    if (!hasWaterNeighbor(sx, sy, sz)) return;

    const queue = [[sx, sy, sz]];
    const seen = new Set([`${sx},${sy},${sz}`]);
    let head = 0;
    let count = 0;

    while (head < queue.length && count < FLOOD_CAP) {
        const [x, y, z] = queue[head++];
        if (y > WATER_LEVEL || getBlockAt(x, y, z) !== 'air') continue;
        if (!setBlock(x, y, z, 'water')) continue;
        addAffectedChunks(affected, x, z);
        count++;

        const nb = [[x - 1, y, z], [x + 1, y, z], [x, y, z - 1], [x, y, z + 1], [x, y - 1, z], [x, y + 1, z]];
        for (let i = 0; i < 6; i++) {
            const [nx, ny, nz] = nb[i];
            if (ny < 0 || ny > WATER_LEVEL) continue;
            const key = `${nx},${ny},${nz}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (getBlockAt(nx, ny, nz) === 'air') queue.push([nx, ny, nz]);
        }
    }
}

export function breakVoxel(worldX, worldY, worldZ) {
    if (!setBlock(worldX, worldY, worldZ, 'air')) return null;

    invalidateChunkSources(Math.floor(worldX / CHUNK_SIZE), Math.floor(worldZ / CHUNK_SIZE));

    const affected = new Set();
    addAffectedChunks(affected, worldX, worldZ);
    floodWater(worldX, worldY, worldZ, affected);

    return affected;
}

export function placeVoxel(worldX, worldY, worldZ, type) {
    const existing = getBlockAt(worldX, worldY, worldZ);
    if (existing !== 'air' && existing !== 'water') return null;
    if (!setBlock(worldX, worldY, worldZ, type)) return null;

    invalidateChunkSources(Math.floor(worldX / CHUNK_SIZE), Math.floor(worldZ / CHUNK_SIZE));

    const affected = new Set();
    addAffectedChunks(affected, worldX, worldZ);

    return affected;
}
