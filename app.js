import * as THREE from './three.r168.module.js';
import { FlyControls } from './FlyControls.js'; // Імпорт FlyControls

// Ініціалізація сцени, камери та рендера
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Позиція камери для огляду на сітку кубів
camera.position.set(5, 5, 25);

// Функція для генерації чанку кубів з видимими ребрами
function generateChunk(chunkSize, cubeSize) {
    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });

    for (let x = 0; x < chunkSize; x++) {
        for (let y = 0; y < chunkSize; y++) {
            for (let z = 0; z < chunkSize; z++) {
                const edges = new THREE.EdgesGeometry(geometry);
                const line = new THREE.LineSegments(edges, edgesMaterial);
                line.position.set(x * cubeSize, y * cubeSize, z * cubeSize);
                scene.add(line);
            }
        }
    }
}

// Виклик функції для створення чанку
const chunkSize = 10; // Розмір чанку
const cubeSize = 10;   // Розмір кожного куба
generateChunk(chunkSize, cubeSize);

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
