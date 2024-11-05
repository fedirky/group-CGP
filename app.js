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

// Add ambient light
const ambientLight = new THREE.AmbientLight(0x404040, 3.5); // Soft white light
scene.add(ambientLight);

const textureLoader = new THREE.TextureLoader();

const materials = {}; // Зберігаємо матеріали за типами блоків

// Функція для отримання або створення матеріалу для типу блоку
function getBlockMaterial(block) {
    if (!materials[block]) {
        const texture = getBlockTexture(block);
        materials[block] = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide
        });
    }
    return materials[block];
}

function generateChunk(chunkX, chunkZ) {
    const cubeSize = 1;
    const landscape = generateLandscape(chunkX, chunkZ);
    const blocks = new Set();

    // Збір позицій блоків
    for (let x = 0; x < landscape.length; x++) {
        for (let z = 0; z < landscape[x].length; z++) {
            for (let y = 0; y < landscape[x][z].length; y++) {
                const blockData = landscape[x][z][y];
                if (blockData.block !== 'air') {
                    blocks.add(`${chunkX + x},${y},${chunkZ + z}`);
                }
            }
        }
    }

    // Рендеринг площин для кожної сторони
    for (let x = 0; x < landscape.length; x++) {
        for (let z = 0; z < landscape[x].length; z++) {
            for (let y = 0; y < landscape[x][z].length; y++) {
                const blockData = landscape[x][z][y];
                const block = blockData.block;

                if (block === 'air') continue;

                const posX = chunkX + x;
                const posY = y;
                const posZ = chunkZ + z;
                
                // Отримуємо матеріал для поточного типу блоку
                const material = getBlockMaterial(block);

                // Перевірка сусідніх блоків
                const directions = [
                    { offset: [-1, 0, 0], position: [posX - 1, posY, posZ], rotation: [0, Math.PI / 2, 0] }, // Left
                    { offset: [1, 0, 0], position: [posX + 1, posY, posZ], rotation: [0, -Math.PI / 2, 0] }, // Right
                    { offset: [0, -1, 0], position: [posX, posY - 1, posZ], rotation: [Math.PI / 2, 0, 0] }, // Bottom
                    { offset: [0, 1, 0], position: [posX, posY + 1, posZ], rotation: [-Math.PI / 2, 0, 0] }, // Top
                    { offset: [0, 0, -1], position: [posX, posY, posZ - 1], rotation: [0, 0, 0] },           // Front
                    { offset: [0, 0, 1], position: [posX, posY, posZ + 1], rotation: [0, Math.PI, 0] }       // Back
                ];

                // Рендеринг площини для кожної видимої сторони
                directions.forEach(({ offset, position, rotation }) => {
                    const neighborKey = `${position[0]},${position[1]},${position[2]}`;
                    if (!blocks.has(neighborKey)) {
                        const quadGeometry = new THREE.PlaneGeometry(cubeSize, cubeSize);
                        const quad = new THREE.Mesh(quadGeometry, material);
                        quad.position.set(
                            posX * cubeSize + offset[0] * cubeSize / 2,
                            posY * cubeSize + offset[1] * cubeSize / 2,
                            posZ * cubeSize + offset[2] * cubeSize / 2
                        );
                        quad.rotation.set(rotation[0], rotation[1], rotation[2]);
                        scene.add(quad);
                    }
                });
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

// Generate 4 chunks in a 2x2 grid
const chunkSize = 16; // Size of each chunk (optional, if you have a specific size)
const numChunksX = 2; // Number of chunks in the X direction
const numChunksZ = 1; // Number of chunks in the Z direction

for (let i = 0; i < numChunksX; i++) {
    for (let j = 0; j < numChunksZ; j++) {
        generateSingleChunk(i * chunkSize, j * chunkSize);
    }
}

const controls = new FlyControls(camera, renderer.domElement);
controls.movementSpeed = 20;
controls.rollSpeed = 1.3;
controls.autoForward = false;
controls.dragToLook = true;

const fpsCounter = document.createElement('div');
fpsCounter.style.position = 'absolute';
fpsCounter.style.top = '10px';
fpsCounter.style.left = '10px';
fpsCounter.style.color = '#000000';
fpsCounter.style.fontSize = '16px';
document.body.appendChild(fpsCounter);

let frameCount = 0;
let lastTime = performance.now();

function countVertices() {
    let vertexCount = 0;
    scene.traverse((object) => {
        if (object.isMesh) {
            vertexCount += object.geometry.attributes.position.count; // Count vertices
        }
    });
    return vertexCount;
}

// Initialize post-processing
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Add SAOPass with your parameters
const saoPass = new SAOPass(scene, camera);
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
saoPass.normalMaterial.side = THREE.DoubleSide;
saoPass.enabled = true;

// Add OutputPass for output result
const outputPass = new OutputPass();
composer.addPass(outputPass);

// Function to update composer size
function updateComposerSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    renderer.setSize(width, height); // Set renderer size
    composer.setSize(width, height); // Set composer size
}

// Add event handler for window resize
window.addEventListener('resize', updateComposerSize);

function adjustSAOScale() {
    const distance = camera.position.length(); // Distance from origin or target point
    saoPass.params.saoScale = 128 * 2.5 / distance; // Scale down with distance
}

// Animation loop
function animate() {
    const currentTime = performance.now();
    frameCount++;

    const deltaTime = currentTime - lastTime;
    if (deltaTime >= 1000) {
        const fps = (frameCount / (deltaTime / 1000)).toFixed(2);
        const vertices = countVertices(); // Count vertices
        fpsCounter.textContent = `FPS: ${fps}, Vertices: ${vertices}`; // Output FPS and vertex count
        frameCount = 0;
        lastTime = currentTime;
    }

    requestAnimationFrame(animate);
    controls.update(0.01);
    //adjustSAOScale(); // Adjust SAO scale based on distance
    composer.render(); // Use composer for rendering with SAO
}

animate();
