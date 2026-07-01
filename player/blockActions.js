import { getChunk } from '../world/terrain_generator.js';
import { breakVoxel, placeVoxel } from '../world/worldMutations.js';
import { rebuildChunk } from '../rendering/terrain_renderer.js';

function rebuildAffectedChunks(scene, affected) {
    affected.forEach((key) => {
        const [cx, cz] = key.split(',').map(Number);
        if (getChunk(cx, cz)) rebuildChunk(scene, cx, cz);
    });
}

export function breakBlock(scene, worldX, worldY, worldZ) {
    const affected = breakVoxel(worldX, worldY, worldZ);
    if (!affected) return false;

    rebuildAffectedChunks(scene, affected);
    return true;
}

export function placeBlock(scene, worldX, worldY, worldZ, type) {
    const affected = placeVoxel(worldX, worldY, worldZ, type);
    if (!affected) return false;

    rebuildAffectedChunks(scene, affected);
    return true;
}
