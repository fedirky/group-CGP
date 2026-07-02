import { getBlockAt } from '../world/terrain_generator.js';
import { PLAYER_CONFIG } from '../config.js';
import { isBreakableBlock, isCollidableBlock, getSelectionBox } from '../data/blocks.js';

// Ray vs AABB (slab method). Returns the entry distance along a NORMALISED dir,
// or -1 if the ray misses the box.
function rayBoxEntry(ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz) {
    let t0 = 0, t1 = Infinity;
    // X
    if (Math.abs(dx) < 1e-8) { if (ox < minx || ox > maxx) return -1; }
    else { let a = (minx - ox) / dx, b = (maxx - ox) / dx; if (a > b) { const s = a; a = b; b = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
    // Y
    if (Math.abs(dy) < 1e-8) { if (oy < miny || oy > maxy) return -1; }
    else { let a = (miny - oy) / dy, b = (maxy - oy) / dy; if (a > b) { const s = a; a = b; b = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
    // Z
    if (Math.abs(dz) < 1e-8) { if (oz < minz || oz > maxz) return -1; }
    else { let a = (minz - oz) / dz, b = (maxz - oz) / dz; if (a > b) { const s = a; a = b; b = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
    return t0 <= t1 ? t0 : -1;
}

/*
 * Voxel collision queries for the walking player.
 *
 * Blocks are centred on integer world coordinates and span +/-0.5 on each axis
 * (the renderer offsets each face by cubeSize/2). So the block that contains a
 * world coordinate c is Math.round(c), and that block occupies [idx-0.5, idx+0.5].
 */

/*
 * Is the block at these integer coordinates solid for collision?
 * Collision rules come from the block registry. Water currently collides;
 * billboard vegetation does not.
 */
export function isSolidAt(bx, by, bz) {
    const block = getBlockAt(bx, by, bz);
    return isCollidableBlock(block);
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
        if (isBreakableBlock(block)) {
            const box = getSelectionBox(block);
            if (!box) {
                // Full cube.
                return { x: ix, y: iy, z: iz, block, px: prevX, py: prevY, pz: prevZ };
            }
            // Plant: only register if the ray actually crosses its short box
            // (its texture), not the empty space above it — otherwise keep marching.
            const hw = box.halfWidth;
            const t0 = rayBoxEntry(
                origin.x, origin.y, origin.z, dx, dy, dz,
                ix - hw, iy - 0.5, iz - hw,
                ix + hw, iy - 0.5 + box.height, iz + hw,
            );
            if (t0 >= 0 && t0 <= maxDistance) {
                return { x: ix, y: iy, z: iz, block, px: prevX, py: prevY, pz: prevZ };
            }
        }
    }

    return null;
}
