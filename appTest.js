import * as THREE from './three.r168.module.js';
import { EffectComposer } from './postprocessing/EffectComposer.js';
import { RenderPass } from './postprocessing/RenderPass.js';
import { SAOPass } from './postprocessing/SAOPass.js';
import { OutputPass } from './postprocessing/OutputPass.js';
import { FontLoader } from 'https://threejs.org/examples/js/loaders/FontLoader.js';

// Створити сцену, камеру і рендерер
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true }); // Дозволяє прозорий фон
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Включити тіні
document.body.appendChild(renderer.domElement);

// Налаштування камери
camera.position.set(0, 5, 5); // Розташування камери
camera.lookAt(0, 0, 0); // Огляд на центр сцени

// Додати направлене світло
const directionalLight = new THREE.DirectionalLight(0xffffcc, 10); // Біле світло
directionalLight.position.set(5, 10, 5); // Позиція світла
directionalLight.castShadow = true; // Включити накладення тіней
scene.add(directionalLight);

// Додати амбієнтне світло
const ambientLight = new THREE.AmbientLight(0x404040, 2); // М'яке біле світло
scene.add(ambientLight);

// Створити плоску площину
const cubeGeometryPlane = new THREE.BoxGeometry(10, 10, 10);
const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x0077ff }); // Матеріал для куба
const cubePlane = new THREE.Mesh(cubeGeometryPlane, cubeMaterial);
cubePlane.position.set(0, -5.0, 0); // Розташування куба над площиною
cubePlane.castShadow = false; // Куб може кидати тіні
cubePlane.receiveShadow = true; // Куб може отримувати тіні
scene.add(cubePlane);

// Створити куб
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.position.set(0, 0.5, 0); // Розташування куба над площиною
cube.castShadow = false; // Куб може кидати тіні
cube.receiveShadow = true; // Куб може отримувати тіні
scene.add(cube);

// Ініціалізація постобробки
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Додати SAOPass
const saoPass = new SAOPass(scene, camera, false, true);
composer.addPass(saoPass);

// Налаштування параметрів SAO
saoPass.params.saoBias = 2;
saoPass.params.saoIntensity = 0.01;
saoPass.params.saoScale = 10;
saoPass.params.saoKernelRadius = 32;
saoPass.params.saoMinResolution = 0;
saoPass.params.saoBlur = true;
saoPass.params.saoBlurRadius = 20;
saoPass.params.saoBlurStdDev = 13;
saoPass.params.saoBlurDepthCutoff = 0.001;
saoPass.enabled = true;

// Додати OutputPass для виводу результату
const outputPass = new OutputPass();
composer.addPass(outputPass);

// Функція для оновлення розміру композера
function updateComposerSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    renderer.setSize(width, height); // Встановити розміри рендерера
    composer.setSize(width, height); // Встановити розміри композера
}

// Додати обробник подій для зміни розміру вікна
window.addEventListener('resize', updateComposerSize);

// Анімаційний цикл
function animate() {
    requestAnimationFrame(animate);
    composer.render(); // Рендеринг з використанням composer
}
animate();


