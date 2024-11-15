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

    // First loop: Populate landscape with stone, dirt, and air
    for (let x = 0; x < width; x++) {
        landscape[x] = [];
        for (let z = 0; z < depth; z++) {
            landscape[x][z] = [];

            const dirtheight = generateHeight(chunkX + x, chunkZ + z) / 4 + 8;
            const stoneheight = generateHeight(chunkX + x, chunkZ + z) / 8 + 2;            

            for (let y = 0; y < maxHeight; y++) {
                let block;

                if (y < stoneheight) {
                    block = 'stone';
                } else if (y < dirtheight) {
                    block = 'dirt';
                } else {
                    block = 'air';
                }

                landscape[x][z][y] = { block };
            }
        }
    }

    // Second loop: Set topmost dirt blocks to grass and add random flowers
    for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
            for (let y = maxHeight - 1; y >= 0; y--) {
                if (landscape[x][z][y].block === 'dirt') {
                    // If no blocks are above, set to grass
                    if (y === maxHeight - 1 || landscape[x][z][y + 1].block === 'air') {
                        landscape[x][z][y].block = 'grass';

                        // З вірогідністю 0.25% додаємо випадкову квітку над блоком "grass"
                        if (Math.random() < 0.025) {
                            const flowerType = `flower_${Math.floor(Math.random() * 7) + 1}`;
                            landscape[x][z][y + 1] = { block: flowerType };
                        }
                    }
                    break; // Stop after finding the first dirt block from the top
                }
            }
        }
    }

    return landscape;
}

