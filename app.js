import * as THREE from './three.r168.module.js';
import { FlyControls } from './FlyControls.js';
import { generateLandscape } from './terrain.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true }); // Allow transparent background
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadow maps
document.body.appendChild(renderer.domElement);

// Camera setup
camera.position.set(10, 10, 50);

// Add a directional light
const directionalLight = new THREE.DirectionalLight(0xffffcc, 10); // White light
directionalLight.position.set(10, 20, 10); // Position the light
directionalLight.castShadow = true; // Enable shadow casting
scene.add(directionalLight);

// Configure light shadows
directionalLight.shadow.mapSize.width = 512; // Default
directionalLight.shadow.mapSize.height = 512; // Default
directionalLight.shadow.camera.near = 0.5; // Default
directionalLight.shadow.camera.far = 50; // Default

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
    renderer.render(scene, camera);
}
animate();
