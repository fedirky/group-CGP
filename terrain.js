const simplex = new SimplexNoise();

const scale = 0.1;
const heightMultiplier = 16; // Максимальна висота змінена на 16


export function generateHeight(chunkX, chunkZ) {
    const noiseValue = simplex.noise2D(chunkX * scale, chunkZ * scale);
    return Math.floor((noiseValue + 1) * heightMultiplier / 2);
}


export function generateLandscape(chunkX, chunkZ) {
    const width = 16;   // Width of the chunk
    const depth = 16;   // Depth of the chunk
    const maxHeight = 16; // Max height of the chunk
    const landscape = [];

    // First loop: Populate landscape with stone, dirt, water, and air
    for (let x = 0; x < width; x++) {
        landscape[x] = [];
        for (let z = 0; z < depth; z++) {
            landscape[x][z] = [];

            const dirtheight = generateHeight(chunkX + x, chunkZ + z) / 3 + 8;
            const stoneheight = generateHeight(chunkX + x, chunkZ + z) / 8 + 2;

            for (let y = 0; y < maxHeight; y++) {
                let block;

                if (y < stoneheight) {
                    block = 'stone';
                } else if (y < dirtheight) {
                    block = 'dirt';
                } else if (y < 11) {
                    block = 'water'; // Water below level 11
                } else {
                    block = 'air';
                }

                landscape[x][z][y] = { block };
            }
        }
    }

    // Second loop: Convert dirt adjacent to water into sand
    for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < maxHeight; y++) {
                if (landscape[x][z][y].block === 'dirt') {
                    // Check neighbors for water
                    const neighbors = [
                        [x - 1, z, y], [x + 1, z, y], // Horizontal neighbors (x-axis)
                        [x, z - 1, y], [x, z + 1, y], // Horizontal neighbors (z-axis)
                        [x, z, y - 1], [x, z, y + 1]  // Vertical neighbors (above and below)
                    ];

                    for (const [nx, nz, ny] of neighbors) {
                        if (
                            nx >= 0 && nx < width &&
                            nz >= 0 && nz < depth &&
                            ny >= 0 && ny < maxHeight &&
                            landscape[nx][nz][ny]?.block === 'water'
                        ) {
                            landscape[x][z][y].block = 'sand';
                            break; // Stop checking other neighbors
                        }
                    }
                }
            }
        }
    }

    // Third loop: Set topmost dirt blocks to grass, add random flowers, generate sugarcane, and convert water to ice
    for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
            for (let y = maxHeight - 1; y >= 0; y--) {
                if (landscape[x][z][y].block === 'dirt') {
                    // If no blocks are above, set to grass
                    if (y === maxHeight - 1 || landscape[x][z][y + 1].block === 'air') {
                        landscape[x][z][y].block = 'grass';

                        // With a 2.5% probability, add a random flower above grass
                        if (Math.random() < 0.025) {
                            const flowerType = `flower_${Math.floor(Math.random() * 7) + 1}`;
                            landscape[x][z][y + 1] = { block: flowerType };
                        }
                    }
                    break; // Stop after finding the first dirt block from the top
                }

                if (landscape[x][z][y].block === 'sand') {
                    // Generate sugarcane with a 5% probability
                    if (Math.random() < 0.05 && (y === maxHeight - 1 || landscape[x][z][y + 1].block === 'air')) {
                        const sugarCaneHeight = Math.floor(Math.random() * 3) + 1; // Random height: 1 to 3
                        for (let h = 1; h <= sugarCaneHeight; h++) {
                            if (y + h < maxHeight) { // Ensure within bounds
                                landscape[x][z][y + h] = { block: 'flower_sugar_cane' };
                            }
                        }
                    }
                }

                // Check for the topmost water block
                if (landscape[x][z][y].block === 'water') {
                    // If it's the topmost block or the block above is air
                    if (y === maxHeight - 1 || landscape[x][z][y + 1].block === 'air') {
                        // With a probability of 25%, turn it into ice
                        if (Math.random() < 0.25) {
                            landscape[x][z][y].block = 'ice';
                        }
                    }
                    break; // Stop after processing the topmost water block
                }
            }
        }
    }

    return landscape;
}
