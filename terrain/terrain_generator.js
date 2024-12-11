import app_settings from "../settings.json" with { type: "json" };


const simplex = new SimplexNoise();

const scale = 0.02;
const heightMultiplier = 22;

const chunkSize = 16;
const numChunksX = app_settings.generation.world_size;
const numChunksZ = app_settings.generation.world_size;

const chunks = {};


for (let i = -Math.round(numChunksX/2); i < Math.round(numChunksX/2); i++) {
    for (let j = -Math.round(numChunksZ/2); j < Math.round(numChunksZ/2); j++) {
        generateLandscape(i, j);
        generateWater(i, j);
        generateVegetation(i, j);
    }
};


export function getChunk(chunkX, chunkZ) {
    return chunks[chunkX]?.[chunkZ] || null;
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

            const dirtheight = generateHeight(chunkX*16 + x, chunkZ*16 + z) / 2 + 4;
            const stoneheight = generateHeight(chunkX*16 + x, chunkZ*16 + z) / 8 + 2;

            for (let y = 0; y < chunkSize; y++) {
                let block;

                if (y < stoneheight) {
                    block = 'stone';
                } else if (y < dirtheight) {
                    block = 'dirt';
                } else if (y < 8) {
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


// Third loop: Set topmost dirt blocks to grass, add random flowers, generate sugarcane, and convert water to ice
function generateVegetation(chunkX, chunkZ) {

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
                            chunk[x][z][y + 1] = { block: 'flower_grass' };
                        } else if (ran > 0.995) {
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

    // Tree generation
    for (let quadrantX = 0; quadrantX < 2; quadrantX++) {
        for (let quadrantZ = 0; quadrantZ < 2; quadrantZ++) {
            const startX = quadrantX * 8 + 2; // Start x of the central 4x4 area
            const startZ = quadrantZ * 8 + 2; // Start z of the central 4x4 area

            if (Math.random() < 0.25) { // 25% chance to generate a tree in this quadrant
                let treePlaced = false;
                for (let attempt = 0; attempt < 10 && !treePlaced; attempt++) { // Try up to 10 times to find a valid position
                    const offsetX = Math.floor(Math.random() * 4);
                    const offsetZ = Math.floor(Math.random() * 4);
                    const x = startX + offsetX;
                    const z = startZ + offsetZ;

                    for (let y = chunkSize - 1; y >= 0; y--) {
                        if (chunk[x][z][y]?.block === 'grass' && chunk[x][z][y + 1]?.block === 'air') {
                            // Generate tree
                            const treeHeight = Math.floor(Math.random() * 2) + 4; // Random height between 4 and 7
                            for (let h = 1; h <= treeHeight; h++) {
                                if (y + h < chunkSize) {
                                    chunk[x][z][y + h] = { block: 'log_oak' };
                                }
                            }
                            treePlaced = true;
                            break;
                        }
                    }
                }
            }
        }
    }

    // console.log(`Vegetation generation complete for chunk (${chunkX}, ${chunkZ}).`);
    return chunk;
}

