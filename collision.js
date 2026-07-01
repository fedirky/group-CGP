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


// Is this block a valid target for breaking? Everything except air and water,
// so grass and flower billboards can be broken just like solid blocks.
function isBreakable(block) {
    return !!block && block !== 'air' && block !== 'water';
}


/*
 * March a ray through the voxel grid (Amanatides & Woo DDA) and return the first
 * breakable block it hits, or null. `origin` and `dir` are THREE.Vector3-likes
 * (dir need not be normalised). Coordinates use the same +/-0.5 block convention
 * as everything else, so the cell containing a point p is round(p) = floor(p+0.5).
 */
export function raycastVoxel(origin, dir, maxDistance = 6) {
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len === 0) return null;

    const dx = dir.x / len, dy = dir.y / len, dz = dir.z / len;

    // Work in a grid shifted by +0.5 so cells are the unit ranges [n, n+1].
    const px = origin.x + 0.5, py = origin.y + 0.5, pz = origin.z + 0.5;

    let ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);

    const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

    const fracX = px - ix, fracY = py - iy, fracZ = pz - iz;
    let tMaxX = stepX > 0 ? (1 - fracX) * tDeltaX : fracX * tDeltaX;
    let tMaxY = stepY > 0 ? (1 - fracY) * tDeltaY : fracY * tDeltaY;
    let tMaxZ = stepZ > 0 ? (1 - fracZ) * tDeltaZ : fracZ * tDeltaZ;

    let t = 0;
    while (t <= maxDistance) {
        // Advance to the next voxel boundary along the nearest axis.
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
            ix += stepX; t = tMaxX; tMaxX += tDeltaX;
        } else if (tMaxY < tMaxZ) {
            iy += stepY; t = tMaxY; tMaxY += tDeltaY;
        } else {
            iz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
        }

        const block = getBlockAt(ix, iy, iz);
        if (isBreakable(block)) {
            return { x: ix, y: iy, z: iz, block };
        }
    }

    return null;
}
