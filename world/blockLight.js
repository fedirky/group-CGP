import * as THREE from '../three.r168.module.js';
import { WORLD_CONFIG } from '../config.js';
import { getBlockAt, getChunk } from './terrain_generator.js';
import { getBlockLight, isTransparentForBlockLight } from '../data/blocks.js';

/*
 * Minecraft-style per-voxel block light.
 *
 * Glowing blocks (berries) are light sources. Their (coloured) light floods
 * outward through non-opaque cells (air / water / flowers), losing one level per
 * block, and is baked per-vertex into the chunk geometry as a `blockLight`
 * attribute. The forward shader then does `outgoingLight += albedo * blockLight`,
 * so surfaces genuinely light up (revealing their texture) even in full darkness,
 * with no screen-space passes. Colour is carried per channel: a channel's value
 * encodes both hue and reach (a dim channel dies out sooner).
 */

const CHUNK = WORLD_CONFIG.chunkSize;
const H = WORLD_CONFIG.chunkSize * WORLD_CONFIG.worldHeightChunks;

// Max light level = reach in blocks. Kept < CHUNK so a source only ever affects
// the 3x3 chunk neighbourhood.
// BFS reach (Manhattan) — the diamond within which a source can own cells. Kept
// large enough that a source's round euclidean sphere (RADIUS_MAX) fits inside
// it (diamond radius >= sqrt(3) * sphere radius), and < CHUNK so light stays in
// the 3x3 neighbourhood.
export const LIGHT_MAX = 14;
const RADIUS_MAX = LIGHT_MAX / Math.sqrt(3); // ~8 blocks, round reach

const chunkKey = (cx, cz) => `${cx},${cz}`;

// Per-chunk cached source list, so we don't rescan every rebuild.
const chunkSources = new Map(); // "cx,cz" -> [{ x, y, z, r, g, b }]

// Called with (cx, cz) the first time a chunk with sources is scanned, so the
// renderer can dirty the neighbourhood and repropagate light into it.
let dirtyCallback = null;
export function setDirtyCallback(fn) { dirtyCallback = fn; }

const _c = new THREE.Color();

function scanChunkSources(cx, cz) {
    const ch = getChunk(cx, cz);
    if (!ch) return null; // data not generated yet — don't cache, retry later
    const list = [];
    const baseX = cx * CHUNK;
    const baseZ = cz * CHUNK;
    for (let lx = 0; lx < CHUNK; lx++) {
        for (let lz = 0; lz < CHUNK; lz++) {
            const col = ch[lx][lz];
            for (let y = 0; y < H; y++) {
                const cell = col[y];
                const b = cell && cell.block;
                const light = b ? getBlockLight(b) : null;
                if (!light || light.radius === undefined) continue;
                _c.set(light.color).convertSRGBToLinear();
                list.push({
                    x: baseX + lx, y, z: baseZ + lz,
                    r: _c.r, g: _c.g, b: _c.b,
                    radius: Math.min(RADIUS_MAX, light.radius),
                });
            }
        }
    }
    return list;
}

function getChunkSources(cx, cz) {
    const k = chunkKey(cx, cz);
    let s = chunkSources.get(k);
    if (s === undefined) {
        s = scanChunkSources(cx, cz);
        if (s === null) return []; // chunk not ready; leave uncached
        chunkSources.set(k, s);
        if (s.length > 0 && dirtyCallback) dirtyCallback(cx, cz);
    }
    return s;
}

/** Drop a chunk's cached sources (call when its blocks change). */
export function invalidateChunkSources(cx, cz) {
    chunkSources.delete(chunkKey(cx, cz));
}

// --- Propagation scratch (reused; a light field is consumed synchronously
// during the chunk build that produced it). ---------------------------------
const REGW = CHUNK + 2 * LIGHT_MAX;   // region width/depth in cells
const CELLS = REGW * REGW * H;
const owner = new Int32Array(CELLS);  // index into _srcs of the cell's source, -1 = unlit
const budget = new Float32Array(CELLS); // BFS reach remaining (for owner priority)
const _queue = [];
const _srcs = [];                     // sources seeded this compute

const NB = [
    [-1, 0, 0], [1, 0, 0],
    [0, -1, 0], [0, 1, 0],
    [0, 0, -1], [0, 0, 1],
];

// Light passes through air, water and flowers ('f'...); solid blocks stop it.
function transparent(wb) {
    return isTransparentForBlockLight(wb);
}

const _out = [0, 0, 0];

/**
 * Compute the block-light field for a chunk and return `at(ix, iy, iz)` giving
 * 0..1 RGB at integer cell coords. BFS assigns each reachable (non-occluded)
 * cell to its nearest source; brightness then falls off ROUND (euclidean) with a
 * smoothstep, and the source hue stays constant.
 */
export function computeChunkLight(cx, cz) {
    owner.fill(-1);
    budget.fill(0);
    _queue.length = 0;
    _srcs.length = 0;

    const ox = cx * CHUNK - LIGHT_MAX; // region origin (world) X
    const oz = cz * CHUNK - LIGHT_MAX; // region origin (world) Z
    const cidx = (rx, ry, rz) => (rx * REGW + rz) * H + ry;

    // Seed sources from the 3x3 chunk neighbourhood.
    for (let dcx = -1; dcx <= 1; dcx++) {
        for (let dcz = -1; dcz <= 1; dcz++) {
            const srcs = getChunkSources(cx + dcx, cz + dcz);
            for (let i = 0; i < srcs.length; i++) {
                const s = srcs[i];
                const rx = s.x - ox, rz = s.z - oz, ry = s.y;
                if (rx < 0 || rx >= REGW || rz < 0 || rz >= REGW || ry < 0 || ry >= H) continue;
                const si = _srcs.length;
                _srcs.push(s);
                const c = cidx(rx, ry, rz);
                if (LIGHT_MAX > budget[c]) {
                    budget[c] = LIGHT_MAX;
                    owner[c] = si;
                    _queue.push(rx, ry, rz);
                }
            }
        }
    }

    // BFS: spread ownership through non-opaque cells (occlusion-aware reach).
    let head = 0;
    while (head < _queue.length) {
        const rx = _queue[head++], ry = _queue[head++], rz = _queue[head++];
        const c = cidx(rx, ry, rz);
        const nb = budget[c] - 1;
        if (nb <= 0) continue;
        const o = owner[c];

        for (let n = 0; n < 6; n++) {
            const nx = rx + NB[n][0], ny = ry + NB[n][1], nz = rz + NB[n][2];
            if (nx < 0 || nx >= REGW || nz < 0 || nz >= REGW || ny < 0 || ny >= H) continue;
            if (!transparent(getBlockAt(ox + nx, ny, oz + nz))) continue;
            const q = cidx(nx, ny, nz);
            if (nb > budget[q]) {
                budget[q] = nb;
                owner[q] = o;
                _queue.push(nx, ny, nz);
            }
        }
    }

    return {
        at(ix, iy, iz) {
            const rx = ix - ox, rz = iz - oz;
            if (rx < 0 || rx >= REGW || rz < 0 || rz >= REGW || iy < 0 || iy >= H) {
                _out[0] = _out[1] = _out[2] = 0;
                return _out;
            }
            const o = owner[cidx(rx, iy, rz)];
            if (o < 0) { _out[0] = _out[1] = _out[2] = 0; return _out; }
            const s = _srcs[o];
            const dx = ix - s.x, dy = iy - s.y, dz = iz - s.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            let t = 1 - d / s.radius;
            if (t <= 0) { _out[0] = _out[1] = _out[2] = 0; return _out; }
            t = t * t * (3 - 2 * t); // smoothstep for a soft round falloff
            _out[0] = s.r * t;
            _out[1] = s.g * t;
            _out[2] = s.b * t;
            return _out;
        },
    };
}
