import * as THREE from './three.r168.module.js';
import { GLTFLoader } from './postprocessing/GLTFLoader.js';

// Створюємо сцену, камеру та рендерер
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Додаємо світло
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(5, 10, 7.5).normalize();
scene.add(directionalLight);

// Завантажуємо модель за допомогою GLTFLoader
const loader = new GLTFLoader();
loader.load(
  './vox_models/flower-1.glb', // Задайте шлях до вашої моделі
  function (gltf) {
    const model = gltf.scene;
    model.scale.set(1, 1, 1); // Масштабуємо модель, за потреби змініть масштаб
    scene.add(model);
  },
  undefined,
  function (error) {
    console.error('Помилка завантаження моделі:', error);
  }
);

// Налаштовуємо камеру
camera.position.z = 5;

// Функція для рендерингу сцени
function animate() {
  requestAnimationFrame(animate);

  // Додайте анімацію, наприклад, обертання моделі (за потреби)
  scene.rotation.y += 0.01;

  renderer.render(scene, camera);
}

animate();

// Ресайз для адаптації до розмірів екрану
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
