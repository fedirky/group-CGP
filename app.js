import * as THREE from './three.r168.module.js';
import { FlyControls } from './FlyControls.js';
import { generateLandscape } from './terrain.js';
import { EffectComposer } from './postprocessing/EffectComposer.js';
import { RenderPass } from './postprocessing/RenderPass.js';
import { SAOPass } from './postprocessing/SAOPass.js';
import { OutputPass } from './postprocessing/OutputPass.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true }); // Allow transparent background
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadow maps
document.body.appendChild(renderer.domElement);

// Camera setup
camera.position.set(10, 10, 20);

// Add a directional light
const directionalLight = new THREE.DirectionalLight(0xffffcc, 9); // White light
directionalLight.position.set(10, 20, 10); // Position the light
directionalLight.castShadow = true; // Enable shadow casting
scene.add(directionalLight);

// Configure light shadows
directionalLight.shadow.mapSize.width = 512; // Default
directionalLight.shadow.mapSize.height = 512; // Default
directionalLight.shadow.camera.near = 0.5; // Default
directionalLight.shadow.camera.far = 50; // Default

// Додайте амбієнтне світло
const ambientLight = new THREE.AmbientLight(0x404040, 3.5); // М'яке біле світло
scene.add(ambientLight);

const textureLoader = new THREE.TextureLoader();

function generateChunk(chunkX, chunkZ) {
    const cubeSize = 1;
    const landscape = generateLandscape(chunkX, chunkZ);
    const blocks = new Set();

    for (let x = 0; x < landscape.length; x++) {
        for (let z = 0; z < landscape[x].length; z++) {
            for (let y = 0; y < landscape[x][z].length; y++) {
                const blockData = landscape[x][z][y];
                const block = blockData.block;

                if (block === 'air') continue;

                blocks.add(`${chunkX + x},${y},${chunkZ + z}`);
            }
        }
    }

    for (let x = 0; x < landscape.length; x++) {
        for (let z = 0; z < landscape[x].length; z++) {
            for (let y = 0; y < landscape[x][z].length; y++) {
                const blockData = landscape[x][z][y];
                const block = blockData.block;

                if (block === 'air') continue;

                const position = `${chunkX + x},${y},${chunkZ + z}`;
                const shouldRender = 
                    !blocks.has(`${chunkX + x - 1},${y},${chunkZ + z}`) ||
                    !blocks.has(`${chunkX + x + 1},${y},${chunkZ + z}`) ||
                    !blocks.has(`${chunkX + x},${y - 1},${chunkZ + z}`) ||
                    !blocks.has(`${chunkX + x},${y + 1},${chunkZ + z}`) ||
                    !blocks.has(`${chunkX + x},${y},${chunkZ + z - 1}`) ||
                    !blocks.has(`${chunkX + x},${y},${chunkZ + z + 1}`);

                if (shouldRender) {
                    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
                    const texture = getBlockTexture(block);

                    // Create the material with shadow properties
                    const material = new THREE.MeshStandardMaterial({ map: texture }); // Use MeshStandardMaterial for shadows
                    material.needsUpdate = true;

                    const cube = new THREE.Mesh(geometry, material);
                    cube.position.set((chunkX + x) * cubeSize, y * cubeSize, (chunkZ + z) * cubeSize);
                    cube.castShadow = false; // Disable cube from casting shadows
                    cube.receiveShadow = false; // Disable cube from receiving shadows
                    scene.add(cube);

                    const edges = new THREE.EdgesGeometry(geometry);
                    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
                    const lineSegments = new THREE.LineSegments(edges, lineMaterial);
                    lineSegments.position.copy(cube.position);
                    scene.add(lineSegments);
                }
            }
        }
    }
}

function getBlockTexture(block) {
    let texturePath;
    switch (block) {
        case 'water': texturePath = './textures/water.png'; break;
        case 'sand': texturePath = './textures/sand.png'; break;
        case 'dirt': texturePath = './textures/dirt.png'; break;
        case 'stone': texturePath = './textures/stone.png'; break;
        default: texturePath = './textures/default.png'; break;
    }

    const texture = textureLoader.load(texturePath);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    return texture;
}

function generateSingleChunk(chunkX, chunkZ) {
    const chunkSize = 16;
    generateChunk(chunkX, chunkZ);
}

generateSingleChunk(0, 0);

const controls = new FlyControls(camera, renderer.domElement);
controls.movementSpeed = 100;
controls.rollSpeed = 1.3;
controls.autoForward = false;
controls.dragToLook = true;

const fpsCounter = document.createElement('div');
fpsCounter.style.position = 'absolute';
fpsCounter.style.top = '10px';
fpsCounter.style.left = '10px';
fpsCounter.style.color = '#ffffff';
fpsCounter.style.fontSize = '16px';
document.body.appendChild(fpsCounter);

let frameCount = 0;
let lastTime = performance.now();

// Ініціалізація постобробки
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Додати SAOPass з вашими параметрами
const saoPass = new SAOPass(scene, camera, false, true);
composer.addPass(saoPass);

saoPass.params.saoBias = 10;
saoPass.params.saoIntensity = 0.023;
saoPass.params.saoScale = 9.5;
saoPass.params.saoKernelRadius = 100;
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
    const currentTime = performance.now();
    frameCount++;

    const deltaTime = currentTime - lastTime;
    if (deltaTime >= 1000) {
        const fps = (frameCount / (deltaTime / 1000)).toFixed(2);
        fpsCounter.textContent = `FPS: ${fps}`;
        frameCount = 0;
        lastTime = currentTime;
    }

    requestAnimationFrame(animate);
    controls.update(0.01);
    composer.render(); // Використовуємо composer для рендерингу з SAO
}

animate();