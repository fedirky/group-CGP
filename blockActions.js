import { getChunk, setBlock } from './terrain_generator.js';
import { getBlockAt } from './collision.js';
import { rebuildChunk } from './terrain_renderer.js';

const CHUNK_SIZE = 16;
const WATER_LEVEL = 7;
const FLOOD_CAP = 4096;

const chunkKey = (cx, cz) => `${cx},${cz}`;

function addAffectedChunks(set, wx, wz) {
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            set.add(chunkKey(Math.floor((wx + dx) / CHUNK_SIZE), Math.floor((wz + dz) / CHUNK_SIZE)));
        }
    }
}

function rebuildAffectedChunks(scene, affected) {
    affected.forEach((key) => {
        const [cx, cz] = key.split(',').map(Number);
        if (getChunk(cx, cz)) rebuildChunk(scene, cx, cz);
    });
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

export function breakBlock(scene, worldX, worldY, worldZ) {
    if (!setBlock(worldX, worldY, worldZ, 'air')) return false;

    const affected = new Set();
    addAffectedChunks(affected, worldX, worldZ);

    floodWater(worldX, worldY, worldZ, affected);
    rebuildAffectedChunks(scene, affected);

    return true;
}

export function placeBlock(scene, worldX, worldY, worldZ, type) {
    const existing = getBlockAt(worldX, worldY, worldZ);
    if (existing !== 'air' && existing !== 'water') return false;
    if (!setBlock(worldX, worldY, worldZ, type)) return false;

    const affected = new Set();
    addAffectedChunks(affected, worldX, worldZ);
    rebuildAffectedChunks(scene, affected);

    return true;
}
