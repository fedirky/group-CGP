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
camera.position.set(5, 5, 25);

// Функція для генерації чанку кубів з кольорами
function generateChunk(chunkX, chunkZ) {
    const cubeSize = 1; // Зменшимо розмір кубів для більшої деталізації
    const landscape = generateLandscape(chunkX, chunkZ);
    
    for (let x = 0; x < landscape.length; x++) {
        for (let z = 0; z < landscape[x].length; z++) {
            const blockData = landscape[x][z];
            const block = blockData.block;
            let color;

            // Визначення кольору для блоку
            switch (block) {
                case 'water':
                    color = 0x0000ff; // Синій
                    break;
                case 'sand':
                    color = 0xffff00; // Жовтий
                    break;
                case 'dirt':
                    color = 0x8B4513; // Коричневий
                    break;
                case 'stone':
                    color = 0x808080; // Сірий
                    break;
                default:
                    continue; // Якщо блок невідомий, пропустити
            }

            const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
            const material = new THREE.MeshBasicMaterial({ color });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.set(x * cubeSize, blockData.height * cubeSize / 2, z * cubeSize); // Розташування блоку
            scene.add(cube);
        }
    }
}

// Генерація 4 сусідніх чанків
function generateAdjacentChunks() {
    const chunkSize = 32; // Розмір чанку
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            generateChunk(i * chunkSize, j * chunkSize); // Генерація кожного з 4 чанків
        }
    }
}

// Виклик функції для створення сусідніх чанків
generateAdjacentChunks();

// Ініціалізація FlyControls
const controls = new FlyControls(camera, renderer.domElement);
controls.movementSpeed = 100; // Швидкість руху
controls.rollSpeed = 0.5; // Швидкість обертання
controls.autoForward = false; // Автоматичний рух вперед
controls.dragToLook = true; // Дозволити рух за допомогою миші

// Анімація для рендеру сцени
function animate() {
    requestAnimationFrame(animate);
    controls.update(0.01); // Додайте це для оновлення контролів
    renderer.render(scene, camera);
}
animate();
