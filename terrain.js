const simplex = new SimplexNoise();

const scale = 0.1;
const heightMultiplier = 16; // Максимальна висота змінена на 16

export function generateHeight(chunkX, chunkZ) {
    const noiseValue = simplex.noise2D(chunkX * scale, chunkZ * scale);
    return Math.floor((noiseValue + 1) * heightMultiplier / 2);
}

export function generateLandscape(chunkX, chunkZ) {
    const width = 16;   // Ширина чанка 16
    const depth = 16;   // Глибина чанка 16
    const maxHeight = 16; // Максимальна висота чанка 16
    const landscape = [];

    for (let x = 0; x < width; x++) {
        landscape[x] = [];
        for (let z = 0; z < depth; z++) {
            landscape[x][z] = [];
            
            const dirtheight = generateHeight(chunkX + x, chunkZ + z);
            const stoneheight = dirtheight / 3;

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

    return landscape;
}
