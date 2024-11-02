// app.js
import * as THREE from './three.r168.module.js';
import { FlyControls } from './FlyControls.js'; // Імпорт FlyControls
import { generateLandscape } from './terrain.js'; // Імпорт функції генерації ландшафту

// Ініціалізація сцени, камери та рендера
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Позиція камери для огляду на сітку кубів
camera.position.set(10, 10, 50);

// Функція для генерації чанку кубів з кольорами
// Функція для генерації чанку кубів з кольорами
function generateChunk(chunkX, chunkZ) {
    const cubeSize = 1; // Зменшимо розмір кубів для більшої деталізації
    const landscape = generateLandscape(chunkX, chunkZ);
    
    // Масив для зберігання позицій усіх блоків
    const blocks = new Set(); // Використовуємо Set для унікальних координат

    // Перший прохід: розміщення кубів і збереження їх позицій
    for (let x = 0; x < landscape.length; x++) {
        for (let z = 0; z < landscape[x].length; z++) {
            for (let y = 0; y < landscape[x][z].length; y++) {
                const blockData = landscape[x][z][y];
                const block = blockData.block;

                if (block === 'air') continue; // Пропустити, якщо це повітря

                // Зберегти позицію блоку у Set
                blocks.add(`${chunkX + x},${y},${chunkZ + z}`);
            }
        }
    }

    // Другий прохід: рендеринг кубів та перевірка сусідів
    for (let x = 0; x < landscape.length; x++) {
        for (let z = 0; z < landscape[x].length; z++) {
            for (let y = 0; y < landscape[x][z].length; y++) {
                const blockData = landscape[x][z][y];
                const block = blockData.block;

                if (block === 'air') continue; // Пропустити, якщо це повітря

                const position = `${chunkX + x},${y},${chunkZ + z}`;
                
                // Додаємо куб тільки якщо хоча б одна з граней не має сусіда
                const shouldRender = 
                    !blocks.has(`${chunkX + x - 1},${y},${chunkZ + z}`) || // Лівий сусід
                    !blocks.has(`${chunkX + x + 1},${y},${chunkZ + z}`) || // Правий сусід
                    !blocks.has(`${chunkX + x},${y - 1},${chunkZ + z}`) || // Нижній сусід
                    !blocks.has(`${chunkX + x},${y + 1},${chunkZ + z}`) || // Верхній сусід
                    !blocks.has(`${chunkX + x},${y},${chunkZ + z - 1}`) || // Задній сусід
                    !blocks.has(`${chunkX + x},${y},${chunkZ + z + 1}`);   // Передній сусід

                if (shouldRender) {
                    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
                    const material = new THREE.MeshBasicMaterial({ color: getBlockColor(block) });
                    const cube = new THREE.Mesh(geometry, material);
                    cube.position.set((chunkX + x) * cubeSize, y * cubeSize, (chunkZ + z) * cubeSize); // Розташування блоку
                    scene.add(cube);

                    // Створення контуру блоку
                    const edges = new THREE.EdgesGeometry(geometry);
                    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 }); // Чорний колір
                    const lineSegments = new THREE.LineSegments(edges, lineMaterial);
                    lineSegments.position.copy(cube.position); // Перемістити контур на ту ж позицію
                    scene.add(lineSegments); // Додати контур до сцени
                }
            }
        }
    }
}

// Функція для отримання кольору блоку
function getBlockColor(block) {
    switch (block) {
        case 'water':
            return 0x0000ff; // Синій
        case 'sand':
            return 0xffff00; // Жовтий
        case 'dirt':
            return 0x8B4513; // Коричневий
        case 'stone':
            return 0x808080; // Сірий
        default:
            return 0xffffff; // Білий за замовчуванням
    }
}


// Генерація одного чанку
function generateSingleChunk(chunkX, chunkZ) {
    const chunkSize = 16; // Розмір чанку 16x16
    generateChunk(chunkX, chunkZ); // Генерація одного чанку
}

// Виклик функції для створення одного чанку
generateSingleChunk(0, 0); // Задайте координати для нового чанку


// Ініціалізація FlyControls
const controls = new FlyControls(camera, renderer.domElement);
controls.movementSpeed = 100; // Швидкість руху
controls.rollSpeed = 1.3; // Швидкість обертання
controls.autoForward = false; // Автоматичний рух вперед
controls.dragToLook = true; // Дозволити рух за допомогою миші

const fpsCounter = document.createElement('div');
fpsCounter.style.position = 'absolute';
fpsCounter.style.top = '10px';
fpsCounter.style.left = '10px';
fpsCounter.style.color = '#ffffff';
fpsCounter.style.fontSize = '16px';
document.body.appendChild(fpsCounter);

let frameCount = 0;
let lastTime = performance.now();
// Анімація для рендеру сцени
function animate() {
    const currentTime = performance.now();
    frameCount++;

    // Обчислення FPS
    const deltaTime = currentTime - lastTime;
    if (deltaTime >= 1000) {
        const fps = (frameCount / (deltaTime / 1000)).toFixed(2);
        fpsCounter.textContent = `FPS: ${fps}`;
        frameCount = 0;
        lastTime = currentTime;
    }

    requestAnimationFrame(animate);
    controls.update(0.01); // Додайте це для оновлення контролів
    renderer.render(scene, camera);
}
animate();

