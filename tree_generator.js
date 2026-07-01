/*
 * Procedural tree generation for the voxel world.
 *
 * Placement — a jittered grid thinned by a minimum-distance rule: each CELL x
 * CELL world cell proposes one tree at a hashed position, but a proposal is only
 * kept if no nearby cell has a higher-priority proposal within MIN_DIST. That is
 * a cheap deterministic Poisson-disk: forests stay dense yet trees never sit on
 * top of each other, and it's seamless across chunks.
 *
 * Canopy — several silhouettes (round / bushy / oblong ellipsoids and a conical
 * crown), each carved by a signed-distance test whose surface is roughened by a
 * per-voxel hash, plus a per-tree size jitter. So crowns vary in both shape and
 * size instead of all being the same round blob.
 *
 * Pure module: the host passes an `api` with block accessors (no import cycle).
 *   api = { chunkSize, worldHeight, getBlock(x,y,z), setBlock(x,y,z,type) }
 */

// ---- deterministic hashing (FNV-1a + murmur3 fmix32 finalizer) --------------

function hash3(x, y, z, salt) {
    let h = 2166136261;
    h = Math.imul(h ^ (x | 0), 16777619);
    h = Math.imul(h ^ (y | 0), 16777619);
    h = Math.imul(h ^ (z | 0), 16777619);
    h = Math.imul(h ^ (salt | 0), 16777619);
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296; // 0..1
}

const hash2 = (x, z, salt) => hash3(x, 0, z, salt);

// ---- placement tuning -------------------------------------------------------

const CELL = 5;       // proposal grid cell size
const DENSITY = 0.85; // chance a cell proposes a tree at all
const MIN_DIST = 7;   // minimum distance (blocks) between accepted tree trunks

// ---- canopy shapes ----------------------------------------------------------

// Multipliers applied to a species' base radii. `gen` selects the builder.
const SHAPES = {
    round:  { rh: 1.0,  rv: 1.0,  gen: 'ellipsoid' },
    bushy:  { rh: 1.2,  rv: 0.8,  gen: 'ellipsoid' },
    oblong: { rh: 0.82, rv: 1.35, gen: 'ellipsoid' },
    cone:   { rh: 1.1,  rv: 1.3,  gen: 'cone' },
};

// ---- species ----------------------------------------------------------------

const SPECIES = {
    // Classic oak: short trunk, mixed rounded crowns.
    oak: {
        log: 'oak_log',
        leaves: 'oak_leaves',
        trunkMin: 3,
        trunkMax: 4,
        radiusH: 2.3,
        radiusV: 2.0,
        shapes: ['round', 'bushy', 'oblong'],
        branches: false,
    },
    // Grand golden oak: a bit taller and fuller, with a few raised branches.
    oak_gold: {
        log: 'oak_gold_log',
        leaves: 'oak_gold_leaves',
        trunkMin: 4,
        trunkMax: 5,
        radiusH: 2.7,
        radiusV: 2.3,
        shapes: ['round', 'oblong', 'bushy'],
        branches: true,
    },
    // Tall skyroot: long bare trunk, crown near the top (often conical), berries.
    skyroot: {
        log: 'skyroot_log',
        leaves: 'skyroot_leaves',
        trunkMin: 7,
        trunkMax: 11,
        radiusH: 2.4,
        radiusV: 2.1,
        shapes: ['cone', 'oblong', 'round'],
        branches: false,
        berry: 'skyroot_leaves_berry_glowing_2D3D59_3',
        maxBerries: 1,         // each berry becomes a point light — keep it tiny
        berryTreeChance: 0.55, // only some skyroots glow at all
    },
};

function pickSpecies(r) {
    if (r < 0.6) return SPECIES.oak;
    if (r < 0.9) return SPECIES.skyroot;
    return SPECIES.oak_gold;
}

// ---- placement (deterministic Poisson-disk over the proposal grid) ----------

// The tree a cell proposes, or null. Position + a priority used to resolve
// conflicts between nearby cells.
function cellProposal(cellX, cellZ) {
    if (hash2(cellX, cellZ, 3) >= DENSITY) return null;
    return {
        x: cellX * CELL + Math.floor(hash2(cellX, cellZ, 1) * CELL),
        z: cellZ * CELL + Math.floor(hash2(cellX, cellZ, 2) * CELL),
        prio: hash2(cellX, cellZ, 9),
    };
}

// A proposal survives only if it out-prioritises every conflicting neighbour.
function acceptedTree(cellX, cellZ) {
    const me = cellProposal(cellX, cellZ);
    if (!me) return null;

    const R = Math.ceil(MIN_DIST / CELL);
    for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
            if (dx === 0 && dz === 0) continue;
            const other = cellProposal(cellX + dx, cellZ + dz);
            if (!other) continue;

            const ex = other.x - me.x;
            const ez = other.z - me.z;
            if (ex * ex + ez * ez >= MIN_DIST * MIN_DIST) continue;

            // Conflict: the higher priority wins; ties broken by cell coords.
            const otherWins = other.prio > me.prio ||
                (other.prio === me.prio && (dx < 0 || (dx === 0 && dz < 0)));
            if (otherWins) return null;
        }
    }
    return me;
}

// ---- canopy builders --------------------------------------------------------

function placeLeaf(api, x, y, z, sp, seed, allowBerries, state) {
    if (y < 1 || y >= api.worldHeight) return;
    if (api.getBlock(x, y, z) !== 'air') return; // never overwrite logs/terrain

    let leaf = sp.leaves;
    if (sp.berry && allowBerries && state.berries < sp.maxBerries &&
        hash3(x, y, z, seed + 1) < 0.18) {
        leaf = sp.berry;
        state.berries++;
    }
    api.setBlock(x, y, z, leaf);
}

function buildEllipsoid(api, cx, cy, cz, sp, rh, rv, seed, allowBerries, state) {
    const spanH = Math.ceil(rh);
    const spanV = Math.ceil(rv);

    for (let dy = -spanV; dy <= spanV; dy++) {
        for (let dx = -spanH; dx <= spanH; dx++) {
            for (let dz = -spanH; dz <= spanH; dz++) {
                const nx = dx / rh, ny = dy / rv, nz = dz / rh;
                const d = nx * nx + ny * ny + nz * nz;
                const jitter = (hash3(cx + dx, cy + dy, cz + dz, seed) - 0.5) * 0.45;
                if (d + jitter > 1.0) continue;
                placeLeaf(api, cx + dx, cy + dy, cz + dz, sp, seed, allowBerries, state);
            }
        }
    }
}

function buildCone(api, cx, cyTop, cz, sp, rh, rv, seed, allowBerries, state) {
    const layers = Math.max(3, Math.round(rv * 2));
    const baseY = cyTop - Math.floor(layers * 0.45); // start a bit below the top log

    for (let i = 0; i < layers; i++) {
        const y = baseY + i;
        const t = i / (layers - 1);                 // 0 at bottom, 1 at the tip
        const ringR = Math.max(0.6, rh * (1 - 0.9 * t));
        const span = Math.ceil(ringR);

        for (let dx = -span; dx <= span; dx++) {
            for (let dz = -span; dz <= span; dz++) {
                const dist = Math.sqrt(dx * dx + dz * dz);
                const jitter = (hash3(cx + dx, y, cz + dz, seed) - 0.5) * 0.9;
                if (dist + jitter > ringR) continue;
                placeLeaf(api, cx + dx, y, cz + dz, sp, seed, allowBerries, state);
            }
        }
    }
}

// A couple of short raised branches for the fancy golden oak.
function buildBranches(api, wx, groundY, wz, sp, trunkH, seed) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < dirs.length; i++) {
        if (hash3(wx, groundY, wz, seed + 10 + i) > 0.5) continue; // ~half sprout
        const [sx, sz] = dirs[i];
        const baseY = groundY + trunkH - 1;
        for (let step = 1; step <= 2; step++) {
            const bx = wx + sx * step;
            const bz = wz + sz * step;
            const by = baseY + step;
            if (by < api.worldHeight && api.getBlock(bx, by, bz) === 'air') {
                api.setBlock(bx, by, bz, sp.log);
            }
        }
    }
}

// ---- tree assembly ----------------------------------------------------------

// Topmost dirt surface in a column, or -1 if it can't host a tree.
function findGround(api, wx, wz) {
    for (let y = api.worldHeight - 1; y >= 1; y--) {
        const block = api.getBlock(wx, y, wz);
        if (block !== 'air') {
            return block === 'dirt' ? y : -1;
        }
    }
    return -1;
}

function buildTree(api, wx, groundY, wz, sp, seed) {
    const trunkH = sp.trunkMin +
        Math.floor(hash3(wx, groundY, wz, seed + 6) * (sp.trunkMax - sp.trunkMin + 1));
    const topY = groundY + trunkH;

    // Trunk.
    for (let h = 1; h <= trunkH; h++) {
        const y = groundY + h;
        if (y < api.worldHeight) api.setBlock(wx, y, wz, sp.log);
    }

    if (sp.branches) buildBranches(api, wx, groundY, wz, sp, trunkH, seed);

    // Per-tree crown shape and size.
    const shapeName = sp.shapes[Math.floor(hash3(wx, groundY, wz, seed + 7) * sp.shapes.length)];
    const shape = SHAPES[shapeName];
    const sizeJit = 0.9 + hash3(wx, groundY, wz, seed + 8) * 0.25; // 0.90..1.15
    const rh = sp.radiusH * shape.rh * sizeJit;
    const rv = sp.radiusV * shape.rv * sizeJit;

    const allowBerries = !!sp.berry &&
        hash3(wx, groundY, wz, seed + 3) < (sp.berryTreeChance || 0);
    const state = { berries: 0 };

    if (shape.gen === 'cone') {
        buildCone(api, wx, topY, wz, sp, rh, rv, seed + 100, allowBerries, state);
    } else {
        buildEllipsoid(api, wx, topY, wz, sp, rh, rv, seed + 100, allowBerries, state);
    }
}

// ---- entry point ------------------------------------------------------------

export function generateTrees(chunkX, chunkZ, api) {
    const CS = api.chunkSize;

    for (let x = 0; x < CS; x++) {
        for (let z = 0; z < CS; z++) {
            const wx = chunkX * CS + x;
            const wz = chunkZ * CS + z;

            const cellX = Math.floor(wx / CELL);
            const cellZ = Math.floor(wz / CELL);

            const tree = acceptedTree(cellX, cellZ);
            if (!tree || wx !== tree.x || wz !== tree.z) continue; // build at the spot only

            const groundY = findGround(api, wx, wz);
            if (groundY < 0) continue;

            const sp = pickSpecies(hash2(cellX, cellZ, 5));
            const seed = (cellX * 73856093) ^ (cellZ * 19349663);
            buildTree(api, wx, groundY, wz, sp, seed);
        }
    }
}
