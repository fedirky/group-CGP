import { getBlockAt } from '../world/terrain_generator.js';
import { PLAYER_CONFIG } from '../config.js';

/*
 * Voxel collision queries for the walking player.
 *
 * Blocks are centred on integer world coordinates and span +/-0.5 on each axis
 * (the renderer offsets each face by cubeSize/2). So the block that contains a
 * world coordinate c is Math.round(c), and that block occupies [idx-0.5, idx+0.5].
 */

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
 *
 * The result also carries `px,py,pz` — the empty cell just before the hit (the
 * face the ray entered through), which is where a placed block goes.
 */
export function raycastVoxel(origin, dir, maxDistance = PLAYER_CONFIG.breakReach) {
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
        const prevX = ix, prevY = iy, prevZ = iz; // cell before this step (the empty face)

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
            return { x: ix, y: iy, z: iz, block, px: prevX, py: prevY, pz: prevZ };
        }
    }

    return null;
}
