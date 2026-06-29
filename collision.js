import { getChunk } from './terrain_generator.js';

/*
 * Voxel collision queries for the walking player.
 *
 * Blocks are centred on integer world coordinates and span +/-0.5 on each axis
 * (the renderer offsets each face by cubeSize/2). So the block that contains a
 * world coordinate c is Math.round(c), and that block occupies [idx-0.5, idx+0.5].
 */

const CHUNK_SIZE = 16;

// Block at integer world coordinates (resolves across chunk boundaries).
export function getBlockAt(bx, by, bz) {
    const cx = Math.floor(bx / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    const chunk = getChunk(cx, cz);
    if (!chunk) return 'air';

    const lx = bx - cx * CHUNK_SIZE;
    const lz = bz - cz * CHUNK_SIZE;
    if (by < 0 || by >= chunk[0][0].length) return 'air';

    const cell = chunk[lx]?.[lz]?.[by];
    return cell ? cell.block : 'air';
}

/*
 * Is the block at these integer coordinates solid for collision?
 * Water counts as solid for now (per request); the "flower_" billboards do not
 * block movement, so you can walk through grass and flowers.
 */
export function isSolidAt(bx, by, bz) {
    const block = getBlockAt(bx, by, bz);
    return !!block && block !== 'air' && !block.startsWith('flower_');
}
