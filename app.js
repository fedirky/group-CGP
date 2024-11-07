import * as THREE from './three.r168.module.js';
import { FlyControls } from './FlyControls.js';
import { generateLandscape } from './terrain.js';
import { EffectComposer } from './postprocessing/EffectComposer.js';
import { RenderPass } from './postprocessing/RenderPass.js';
import { SAOPass } from './postprocessing/SAOPass.js';
import { OutputPass } from './postprocessing/OutputPass.js';
import { ShaderPass } from './postprocessing/ShaderPass.js';
import { FXAAShader } from './shaders/FXAAShader.js';


const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false}); // Allow transparent background
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadow maps
document.body.appendChild(renderer.domElement);

// Camera setup
camera.position.set(20, 15, 30);

// Add a directional light
const directionalLight = new THREE.DirectionalLight(0xffffcc, 10); // White light
directionalLight.position.set(20, 20, 10); // Position the light
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


function createClouds() {
    const cloudGroup = new THREE.Group();
    cloudGroup.layers.set(1);
    const cloudCount = 50;
    const cubeSize = 1;
    const maxInstancesPerMesh = 512;
    const minWidth = 8, maxWidth = 16;
    const minLength = 16, maxLength = 32;
    const minAltitude = 30, maxAltitude = 80;
    const spreadDistance = 500;
    const tempMatrix = new THREE.Matrix4();

    // Define directions and rotations for each face of the cube
    const directions = [
        { offset: [-1, 0, 0], rotation: [0, Math.PI / 2, 0] },   // Left
        { offset: [1, 0, 0], rotation: [0, -Math.PI / 2, 0] },   // Right
        { offset: [0, -1, 0], rotation: [Math.PI / 2, 0, 0] },   // Bottom
        { offset: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0] },   // Top
        { offset: [0, 0, -1], rotation: [0, 0, 0] },             // Front
        { offset: [0, 0, 1], rotation: [0, Math.PI, 0] }         // Back
    ];

    // Loop through to create cloud clusters
    for (let i = 0; i < cloudCount; i++) {
        const cloudWidth = THREE.MathUtils.randInt(minWidth, maxWidth);
        const cloudLength = THREE.MathUtils.randInt(minLength, maxLength);
        const altitude = THREE.MathUtils.lerp(minAltitude, maxAltitude, Math.random());
        const distance = THREE.MathUtils.randFloat(0, spreadDistance);
        const angle = Math.random() * Math.PI * 2;

        // Create a 3D array to mark blocks as undefined based on 0.2 probability
        const cloudShape = Array.from({ length: cloudWidth }, () => 
            Array.from({ length: cloudLength }, () => 
                Array.from({ length: 2 }, () => Math.random() > 0.2) // True if the block exists, false if "undefined"
            )
        );

        // Create instanced meshes for this cloud cluster
        const instancedMeshes = [];
        let instancedMesh;

        for (let x = 0; x < cloudWidth; x++) {
            for (let z = 0; z < cloudLength; z++) {
                for (let y = 0; y < 3; y++) { // Height of 2 for volumetric effect
                    if (!cloudShape[x][z][y]) continue; // Skip rendering undefined blocks

                    const posX = x - cloudWidth / 2;
                    const posY = y;
                    const posZ = z - cloudLength / 2;

                    // Check for instanced mesh capacity
                    if (!instancedMesh || instancedMesh.count >= maxInstancesPerMesh -6) {
                        const geometry = new THREE.PlaneGeometry(cubeSize, cubeSize);
                        const material = new THREE.MeshBasicMaterial({
                            color: 0xffffff,
                            transparent: true,
                            opacity: 0.7,
                            depthWrite: false,
                            side: THREE.DoubleSide
                        });
                        instancedMesh = new THREE.InstancedMesh(geometry, material, maxInstancesPerMesh);
                        instancedMesh.count = 0;
                        instancedMeshes.push(instancedMesh);
                        cloudGroup.add(instancedMesh);
                    }

                    // Add faces for visible sides only
                    directions.forEach(({ offset, rotation }) => {
                        const [nx, ny, nz] = [x + offset[0], y + offset[1], z + offset[2]];
                        const isEdgeBlock = 
                            nx < 0 || nx >= cloudWidth || 
                            nz < 0 || nz >= cloudLength || 
                            ny < 0 || ny >= 2 || !cloudShape[nx]?.[nz]?.[ny]; // Add faces if adjacent block is undefined or out of bounds

                        if (isEdgeBlock) {
                            tempMatrix.compose(
                                new THREE.Vector3(
                                    posX * cubeSize + offset[0] * cubeSize / 2 + Math.cos(angle) * distance,
                                    posY * cubeSize + offset[1] * cubeSize / 2 + altitude,
                                    posZ * cubeSize + offset[2] * cubeSize / 2 + Math.sin(angle) * distance
                                ),
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
                                new THREE.Vector3(1, 1, 1)
                            );
                            instancedMesh.setMatrixAt(instancedMesh.count++, tempMatrix);
                        }
                    });
                }
            }
        }

        // Ensure all instance matrices are updated for rendering
        instancedMeshes.forEach(mesh => {
            mesh.instanceMatrix.needsUpdate = true;
        });
    }

    scene.add(cloudGroup);
}


createClouds()

const textureLoader = new THREE.TextureLoader();
const materials = {};
const meshes = {}; // Store arrays of InstancedMeshes by block type


function getBlockTexture(block) {
    let texturePath, bumpPath;
    switch (block) {
        case 'water': 
            texturePath = './textures/water.png'; 
            bumpPath = './textures/water_bump.png';
            break;
        case 'sand': 
            texturePath = './textures/sand.png'; 
            bumpPath = './textures/sand_bump.png';
            break;
        case 'dirt': 
            texturePath = './textures/dirt.png'; 
            bumpPath = './textures/dirt_bump.png';
            break;
        case 'stone': 
            texturePath = './textures/stone.png'; 
            bumpPath = './textures/stone_bump.png';
            break;
        default: 
            texturePath = './textures/default.png'; 
            bumpPath = './textures/default_bump.png';
            break;
    }

    // Load the color texture with pixelated effect but mipmaps
    const texture = textureLoader.load(texturePath);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestMipmapNearestFilter;  // Nearest filtering for minification with mipmaps
    texture.magFilter = THREE.NearestFilter;  // Nearest filtering for magnification (pixelated effect)
    texture.generateMipmaps = true;  // Ensure mipmaps are generated

    // Load the bump map with pixelated effect but mipmaps
    const bumpMap = textureLoader.load(bumpPath);
    bumpMap.minFilter = THREE.NearestMipmapNearestFilter;  // Nearest filtering for minification with mipmaps
    bumpMap.magFilter = THREE.NearestFilter;  // Nearest filtering for magnification (pixelated effect)
    bumpMap.generateMipmaps = true;  // Ensure mipmaps are generated

    return { map: texture, bumpMap: bumpMap };
}

function getBlockMaterial(block) {
    if (!materials[block]) {
        const { map, bumpMap } = getBlockTexture(block);
        materials[block] = new THREE.MeshLambertMaterial({
            map: map,
            bumpMap: bumpMap,
            bumpScale: 0.7,  // Adjust bump intensity as needed
            side: THREE.DoubleSide
        });
    }
    return materials[block];
}



// Helper to get or create an InstancedMesh array for a given block type
function getInstancedMeshes(block) {
    if (!meshes[block]) {
        meshes[block] = []; // Initialize as an array to hold multiple InstancedMeshes if needed
    }
    return meshes[block];
}


function renderChunk(chunkX, chunkZ) {
    const cubeSize = 1;
    const landscape = generateLandscape(chunkX, chunkZ);
    const maxInstancesPerMesh = 512;
    const tempMatrix = new THREE.Matrix4();

    // Define directions and rotations for each face of the cube
    const directions = [
        { offset: [-1, 0, 0], rotation: [0, Math.PI / 2, 0] },   // Left
        { offset: [1, 0, 0], rotation: [0, -Math.PI / 2, 0] },   // Right
        { offset: [0, -1, 0], rotation: [Math.PI / 2, 0, 0] },   // Bottom
        { offset: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0] },   // Top
        { offset: [0, 0, -1], rotation: [0, 0, 0] },             // Front
        { offset: [0, 0, 1], rotation: [0, Math.PI, 0] }         // Back
    ];

    landscape.forEach((column, x) => {
        column.forEach((row, z) => {
            row.forEach((blockData, y) => {
                const block = blockData.block;
                if (!block || block === 'air') return;

                const posX = chunkX + x;
                const posY = y;
                const posZ = chunkZ + z;

                const instancedMeshes = getInstancedMeshes(block);
                let instancedMesh = instancedMeshes[instancedMeshes.length - 1];

                // Check if there are fewer than 6 available spots in the current mesh
                if (!instancedMesh || instancedMesh.count >= maxInstancesPerMesh - 6) {
                    // Create a new instanced mesh if there are not enough spots
                    const geometry = new THREE.PlaneGeometry(cubeSize, cubeSize);
                    const material = getBlockMaterial(block);
                    instancedMesh = new THREE.InstancedMesh(geometry, material, maxInstancesPerMesh);
                    instancedMesh.count = 0; // Reset count for the new mesh
                    instancedMeshes.push(instancedMesh);
                    scene.add(instancedMesh);
                }

                // Add the new block to the mesh
                directions.forEach(({ offset, rotation }) => {
                    const [nx, ny, nz] = [x + offset[0], y + offset[1], z + offset[2]];

                    if (
                        nx < 0 || nx >= landscape.length ||
                        nz < 0 || nz >= landscape[0].length ||
                        ny < 0 || ny >= landscape[0][0].length ||
                        landscape[nx]?.[nz]?.[ny]?.block === 'air'
                    ) {
                        tempMatrix.compose(
                            new THREE.Vector3(
                                posX * cubeSize + offset[0] * cubeSize / 2,
                                posY * cubeSize + offset[1] * cubeSize / 2,
                                posZ * cubeSize + offset[2] * cubeSize / 2
                            ),
                            new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
                            new THREE.Vector3(1, 1, 1)
                        );
                        instancedMesh.setMatrixAt(instancedMesh.count++, tempMatrix);
                    }
                });
            });
        });
    });

    // Ensure all instance matrices are updated for rendering
    Object.values(meshes).forEach(instancedMeshes => {
        instancedMeshes.forEach(mesh => {
            mesh.instanceMatrix.needsUpdate = true;
        });
    });
}


function renderSingleChunk(chunkX, chunkZ) {
    renderChunk(chunkX, chunkZ);
}


let frameCount = 0;
let lastTime = performance.now();

// Generate 4 chunks in a 2x2 grid
const chunkSize = 16; // Size of each chunk (optional, if you have a specific size)
const numChunksX = 4; // Number of chunks in the X direction
const numChunksZ = 4; // Number of chunks in the Z direction

for (let i = 0; i < numChunksX; i++) {
    for (let j = 0; j < numChunksZ; j++) {
        renderSingleChunk(i * chunkSize, j * chunkSize);
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

const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.material.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
composer.addPass(fxaaPass);

// Add OutputPass for output result
const outputPass = new OutputPass();
composer.addPass(outputPass);

// Function to update composer size
function updateComposerSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    renderer.setSize(width, height); // Set renderer size
    composer.setSize(width, height); // Set composer size

    fxaaPass.material.uniforms['resolution'].value.set(1 / width, 1 / height);
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
