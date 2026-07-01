import { generateTrees } from './tree_generator.js';
import { WATER_CONFIG, WORLD_CONFIG } from '../config.js';

const simplex = new SimplexNoise();

const scale = 0.02;
const heightMultiplier = 22;

const chunkSize = WORLD_CONFIG.chunkSize;
const worldHeight = chunkSize * WORLD_CONFIG.worldHeightChunks;
const chunks = {};

// Block accessor bundle handed to the (pure) tree generator.
const treeApi = {
    chunkSize,
    worldHeight,
    getBlock(wx, wy, wz) {
        const cx = Math.floor(wx / chunkSize);
        const cz = Math.floor(wz / chunkSize);
        const ch = getChunk(cx, cz);
        if (!ch) return 'air';
        const lx = wx - cx * chunkSize;
        const lz = wz - cz * chunkSize;
        if (wy < 0 || wy >= ch[0][0].length) return 'air';
        const cell = ch[lx]?.[lz]?.[wy];
        return cell ? cell.block : 'air';
    },
    setBlock,
};

// Tracks which chunks have had their decorations (trees + plants) generated.
const featuresDone = new Set();


export function getChunk(chunkX, chunkZ) {
    return chunks[chunkX]?.[chunkZ] || null;
}

export function getBlockAt(bx, by, bz) {
    const cx = Math.floor(bx / chunkSize);
    const cz = Math.floor(bz / chunkSize);
    const chunk = getChunk(cx, cz);
    if (!chunk) return 'air';

    const lx = bx - cx * chunkSize;
    const lz = bz - cz * chunkSize;
    if (by < 0 || by >= chunk[0][0].length) return 'air';

    const cell = chunk[lx]?.[lz]?.[by];
    return cell ? cell.block : 'air';
}


// Ensure a chunk's terrain data (landscape + water) exists. On-demand, so the
// world can stream in around the player instead of being fully built up front.
export function ensureChunk(cx, cz) {
    if (!chunks[cx]?.[cz]) {
        generateLandscape(cx, cz);
        generateWater(cx, cz);
    }
    return chunks[cx][cz];
}


// Ensure a chunk's decorations (trees + plants). Trees can write leaves into the
// eight neighbouring chunks, so their terrain data is ensured first. Returns true
// only on the call that actually generated them.
export function ensureChunkFeatures(cx, cz) {
    const key = `${cx},${cz}`;
    if (featuresDone.has(key)) return false;
    featuresDone.add(key); // mark first so tree spill can't recurse back in

    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            ensureChunk(cx + dx, cz + dz);
        }
    }

    generateTrees(cx, cz, treeApi);
    generatePlants(cx, cz);
    return true;
}


// Set the block type at integer world coordinates. Returns true on success.
export function setBlock(worldX, worldY, worldZ, type) {
    const cx = Math.floor(worldX / chunkSize);
    const cz = Math.floor(worldZ / chunkSize);
    const chunk = getChunk(cx, cz);
    if (!chunk) return false;

    const lx = worldX - cx * chunkSize;
    const lz = worldZ - cz * chunkSize;
    if (worldY < 0 || worldY >= chunk[0][0].length) return false;

    if (chunk[lx]?.[lz]?.[worldY]) {
        chunk[lx][lz][worldY].block = type;
    } else {
        chunk[lx][lz][worldY] = { block: type };
    }
    return true;
}


function generateHeight(chunkX, chunkZ) {
    const noiseValue = simplex.noise2D(chunkX * scale, chunkZ * scale);
    return Math.floor((noiseValue + 1) * heightMultiplier / 2);
}


// First loop: Populate landscape with stone, dirt, water, and air
function generateLandscape(chunkX, chunkZ) {

    const landscape = [];

    for (let x = 0; x < chunkSize; x++) {
        landscape[x] = [];
        for (let z = 0; z < chunkSize; z++) {
            landscape[x][z] = [];

            const dirtheight = generateHeight(chunkX * chunkSize + x, chunkZ * chunkSize + z) / 2 + 4;
            const stoneheight = generateHeight(chunkX * chunkSize + x, chunkZ * chunkSize + z) / 8 + 2;

            for (let y = 0; y < worldHeight; y++) {
                let block;

                if (y < stoneheight) {
                    block = 'stone';
                } else if (y < dirtheight) {
                    block = 'dirt';
                } else if (y < WATER_CONFIG.generationLevel) {
                    block = 'water'; // Water below level 11
                } else {
                    block = 'air';
                }

                landscape[x][z][y] = { block };
            }
        }
    }

    if (!chunks[chunkX]) {
        chunks[chunkX] = {};
    }
    chunks[chunkX][chunkZ] = landscape;

    // console.log(`Chunk (${chunkX}, ${chunkZ}) stored in memory.`);
    return true;
}


// Second loop: Convert dirt adjacent to water into sand
function generateWater(chunkX, chunkZ) {
    const chunk = getChunk(chunkX, chunkZ);
    if (!chunk) {
        console.error(`Chunk (${chunkX}, ${chunkZ}) not found.`);
        return false;
    }

    for (let x = 0; x < chunkSize; x++) {
        for (let z = 0; z < chunkSize; z++) {
            for (let y = 0; y < chunkSize; y++) {
                if (chunk[x][z][y].block === 'dirt') {
                    // Define neighbors
                    const neighbors = [
                        [x - 1, z, y], [x + 1, z, y], // Horizontal neighbors (x-axis)
                        [x, z - 1, y], [x, z + 1, y], // Horizontal neighbors (z-axis)
                        [x, z, y - 1], [x, z, y + 1]  // Vertical neighbors (above and below)
                    ];

                    for (const [nx, nz, ny] of neighbors) {
                        let neighborChunk = chunk;
                        let localX = nx, localZ = nz;

                        // Handle boundary crossing
                        if (nx < 0) {
                            neighborChunk = getChunk(chunkX - 1, chunkZ);
                            localX = chunkSize - 1;
                        } else if (nx >= chunkSize) {
                            neighborChunk = getChunk(chunkX + 1, chunkZ);
                            localX = 0;
                        }
                        if (nz < 0) {
                            neighborChunk = getChunk(chunkX, chunkZ - 1);
                            localZ = chunkSize - 1;
                        } else if (nz >= chunkSize) {
                            neighborChunk = getChunk(chunkX, chunkZ + 1);
                            localZ = 0;
                        }

                        // Check if neighborChunk exists and has a water block
                        if (
                            neighborChunk &&
                            localX >= 0 && localX < chunkSize &&
                            localZ >= 0 && localZ < chunkSize &&
                            ny >= 0 && ny < chunkSize &&
                            neighborChunk[localX][localZ][ny]?.block === 'water'
                        ) {
                            chunk[x][z][y].block = 'sand';
                            break; // Stop checking other neighbors
                        }
                    }
                }
            }
        }
    }

    return true;
}


// Function to generate small plants, grass, flowers, and other vegetation in the chunk
function generatePlants(chunkX, chunkZ) {
    const chunk = getChunk(chunkX, chunkZ);
    if (!chunk) {
        console.error(`Chunk (${chunkX}, ${chunkZ}) not found.`);
        return false;
    }

    for (let x = 0; x < chunkSize; x++) {
        for (let z = 0; z < chunkSize; z++) {
            for (let y = chunkSize - 1; y >= 0; y--) {
                const block = chunk[x][z][y]?.block;

                // Grass and flower generation
                if (block === 'dirt') {
                    if (y === chunkSize - 1 || chunk[x][z][y + 1]?.block === 'air') {
                        chunk[x][z][y].block = 'grass';

                        const ran = Math.random();
                        if (ran < 0.035) {
                            chunk[x][z][y + 1] = { block: `flower_${Math.floor(Math.random() * 7) + 1}` };
                        } else if (ran < 0.55) {
                            if (true) {
                                chunk[x][z][y + 1] = { block: 'flower_grass' };
                            }
                        } else if (ran > 0.998) {
                            chunk[x][z][y + 1] = { block: 'flower_glowberries' };
                        }
                    }
                    break;
                }

                // Sugarcane generation on sand
                if (block === 'sand') {
                    if (Math.random() < 0.35 && (y === chunkSize - 1 || chunk[x][z][y + 1]?.block === 'air')) {
                        const sugarCaneHeight = Math.floor(Math.random() * 3) + 1;
                        for (let h = 1; h <= sugarCaneHeight; h++) {
                            if (y + h < chunkSize) {
                                chunk[x][z][y + h] = { block: 'flower_sugar_cane' };
                            }
                        }
                    }
                }

                // Ice and lily pad generation on water
                if (true) {
                    if (block === 'water') {
                        if (y === chunkSize - 1 || chunk[x][z][y + 1]?.block === 'air') {
                            const ran = Math.random();
                            if (ran < 0.25) {
                                chunk[x][z][y].block = 'ice';
                            } else if (ran > 0.9) {
                                chunk[x][z][y + 1] = { block: 'flower_lily' };
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    return true;
}
