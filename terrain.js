// terrain.js
const simplex = new SimplexNoise();

// Налаштування
const scale = 0.1;          // Масштаб для шуму
const heightMultiplier = 30; // Максимальна висота

// Функція для генерації висоти на основі координат чанка
export function generateHeight(chunkX, chunkZ) {
    const noiseValue = simplex.noise2D(chunkX * scale, chunkZ * scale);
    return Math.floor((noiseValue + 1) * heightMultiplier / 2); // Нормалізуємо значення до діапазону 0-30
}

// Генерація ландшафту для чанка 32x32
export function generateLandscape(chunkX, chunkZ) {
    const width = 32;   // Ширина чанка
    const height = 32;  // Висота чанка
    const landscape = [];

    for (let x = 0; x < width; x++) {
        landscape[x] = [];
        for (let z = 0; z < height; z++) {
            // Генерація висоти для конкретних координат чанка
            const height = generateHeight(chunkX + x, chunkZ + z);
            
            // Визначення блоку на основі висоти
            let block;
            if (height < 5) {
                block = 'water'; // Вода
            } else if (height < 10) {
                block = 'sand'; // Пісок
            } else if (height < 20) {
                block = 'dirt'; // Земля
            } else {
                block = 'stone'; // Камінь
            }
            landscape[x][z] = { height, block };
        }
    }

    return landscape;
}
