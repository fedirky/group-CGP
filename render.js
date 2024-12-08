import * as THREE from 'three';

import { generateLandscape } from './terrain.js';


const textureLoader = new THREE.TextureLoader();
const materials = {};
const meshes = {}; // Store arrays of InstancedMeshes by block type
const maxFlowerInstances = 1024;
const flowerMeshes = {};

const globalBumpScale = 1.2;


function getBlockTexture(block, isTopFace = false) {
    let texturePath, bumpPath;
    let texture;

    if (block === 'grass') {
        texturePath = isTopFace ? './textures/blocks/grass.png' : './textures/blocks/grass_side.png';
        bumpPath = './textures/blocks/dirt_bump.png';
    } else {
        switch (block) {
            case 'dirt':
                texturePath = './textures/blocks/dirt.png';
                bumpPath = './textures/blocks/dirt_bump.png';
                break;
            case 'water':
                texturePath = './textures/blocks/water_16x16.mp4';
                bumpPath = './textures/blocks/no_bump.png';
                break;
            case 'ice':
                texturePath = './textures/blocks/ice.png';
                bumpPath = './textures/blocks/no_bump.png';
                break;
            case 'sand':
                texturePath = './textures/blocks/sand.png';
                bumpPath = './textures/blocks/sand_bump.png';
                break;
            case 'stone':
                texturePath = './textures/blocks/stone.png';
                bumpPath = './textures/blocks/stone_bump.png';
                break;
        }
    }

    if (block === 'water') {
        const video = document.createElement('video');
        video.src = texturePath;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
    
        video.addEventListener('loadeddata', () => {
            video.play();
        });
    
        texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace; // Додаємо правильний колірний простір
        texture.minFilter = THREE.NearestFilter; // Вимикаємо міпмапи
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false; // Вимикаємо генерацію міпмапів
    } else {
        texture = textureLoader.load(texturePath);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapNearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 16;
    }

    const bumpMap = textureLoader.load(bumpPath);
    bumpMap.minFilter = THREE.LinearMipmapNearestFilter;
    bumpMap.magFilter = THREE.NearestFilter;
    bumpMap.generateMipmaps = true;
    bumpMap.anisotropy = 16;

    return { map: texture, bumpMap: bumpMap };
}


function getBlockMaterial(block, isTopFace = false) {
    const textureKey = isTopFace && block === 'grass' ? 'grass_top' : block;
    if (!materials[textureKey]) {
        const { map, bumpMap } = getBlockTexture(block, isTopFace);
        let materialConfig = {
            map: map,
            bumpMap: bumpMap,
            bumpScale: globalBumpScale,
            side: THREE.DoubleSide,
        };

        // Special case for ice (using Phong material)
        if (block === 'ice') {
            materialConfig = {
                map: map,
                bumpMap: bumpMap,
                bumpScale: globalBumpScale,
                side: THREE.DoubleSide,
                shininess: 10,
                specular: new THREE.Color(0x99ccff),
                transparent: false,
                opacity: 1.0,
                depthWrite: true,
            };
            materials[textureKey] = new THREE.MeshPhongMaterial(materialConfig);
        } else if (block === 'water') {
            // Special case for water (transparency and material settings)
            Object.assign(materialConfig, {
                transparent: true,
                opacity: 1.0,
                depthWrite: true,
            });
            materials[textureKey] = new THREE.MeshLambertMaterial(materialConfig);
        } else {
            materials[textureKey] = new THREE.MeshLambertMaterial(materialConfig);
        }
    }
    return materials[textureKey];
}


function getInstancedMeshesForMaterial(materialKey) {
    if (!meshes[materialKey]) {
        meshes[materialKey] = []; // Initialize as an array to hold multiple InstancedMeshes if needed
    }
    return meshes[materialKey];
}


function createFlowerPlaneMaterial(flowerType) {
    if (!materials[flowerType]) {
        const texture = textureLoader.load(`./textures/flowers/${flowerType}.png`);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapNearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = true;

        materials[flowerType] = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true, // Ensure transparency works for flowers
            alphaTest: 0.5,
        });
    }
    return materials[flowerType];
}


function getOrCreateFlowerInstancedMesh(scene, flowerType) {
    if (!flowerMeshes[flowerType]) {
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = createFlowerPlaneMaterial(flowerType);

        const instancedMesh = new THREE.InstancedMesh(geometry, material, maxFlowerInstances);
        instancedMesh.count = 0; // Track number of active instances
        flowerMeshes[flowerType] = instancedMesh;
        scene.add(instancedMesh);
    }
    return flowerMeshes[flowerType];
}


function spawnFlowerInstance(scene, posX, posY, posZ, flowerType) {
    const instancedMesh = getOrCreateFlowerInstancedMesh(scene, flowerType);

    if (instancedMesh.count >= maxFlowerInstances) {
        console.warn(`Max instances reached for ${flowerType}`);
        return;
    }

    if (flowerType === 'flower_lily') {
        // Лілія: пласка, горизонтальна
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.compose(
            new THREE.Vector3(posX, posY-0.62, posZ),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), // Лежить горизонтально
            new THREE.Vector3(1.0, 1.0, 1.0) // Можна змінити масштаб
        );

        instancedMesh.setMatrixAt(instancedMesh.count++, tempMatrix);
    } else {
        // First flower plane
        const tempMatrix1 = new THREE.Matrix4();
        tempMatrix1.compose(
            new THREE.Vector3(posX, posY, posZ),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, - Math.PI / 4, 0)), // No rotation
            new THREE.Vector3(1.0, 1.0, 1.0) // Adjust scale as needed
        );

        instancedMesh.setMatrixAt(instancedMesh.count++, tempMatrix1);

        // Second flower plane (rotated by 90 degrees)
        const tempMatrix2 = new THREE.Matrix4();
        tempMatrix2.compose(
            new THREE.Vector3(posX, posY, posZ),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)), // 90 degree rotation
            new THREE.Vector3(1.0, 1.0, 1.0) // Adjust scale as needed
        );

        instancedMesh.setMatrixAt(instancedMesh.count++, tempMatrix2);
    }
    // Mark the instanced mesh as needing an update
    instancedMesh.instanceMatrix.needsUpdate = true;
}


function renderChunk(scene, chunkX, chunkZ) {
    const cubeSize = 1;
    const landscape = generateLandscape(chunkX, chunkZ);
    const maxInstancesPerMesh = 1024;
    const tempMatrix = new THREE.Matrix4();

    const renderFace = (block, posX, posY, posZ, offset, rotation, isTopFace) => {
        const materialKey = block === 'grass' && isTopFace ? 'grass_top' : block;
        const material = getBlockMaterial(block, isTopFace);
        const instancedMeshes = getInstancedMeshesForMaterial(materialKey);
        let instancedMesh = instancedMeshes[instancedMeshes.length - 1];

        if (!instancedMesh || instancedMesh.count >= maxInstancesPerMesh) {
            const geometry = new THREE.PlaneGeometry(cubeSize, cubeSize);
            instancedMesh = new THREE.InstancedMesh(geometry, material, maxInstancesPerMesh);
            instancedMesh.count = 0;
            instancedMeshes.push(instancedMesh);
            scene.add(instancedMesh);
        }

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
    };

    landscape.forEach((column, x) => {
        column.forEach((row, z) => {
            row.forEach((blockData, y) => {
                const block = blockData.block;
                if (!block || block === 'air') return;

                const posX = chunkX + x;
                const posY = y;
                const posZ = chunkZ + z;

                if (block.startsWith('flower_')) {
                    spawnFlowerInstance(scene, posX, posY, posZ, block);
                    return;
                }

                const neighbors = [
                    { offset: [-1, 0, 0], rotation: [0, Math.PI / 2, 0], isTopFace: false },
                    { offset: [1, 0, 0], rotation: [0, -Math.PI / 2, 0], isTopFace: false },
                    { offset: [0, -1, 0], rotation: [Math.PI / 2, 0, 0], isTopFace: false },
                    { offset: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0], isTopFace: true },
                    { offset: [0, 0, -1], rotation: [0, 0, 0], isTopFace: false },
                    { offset: [0, 0, 1], rotation: [0, Math.PI, 0], isTopFace: false },
                ];

                neighbors.forEach(({ offset, rotation, isTopFace }) => {
                    const [nx, ny, nz] = [x + offset[0], y + offset[1], z + offset[2]];

                    const neighborBlock =
                        nx < 0 || nx >= landscape.length ||
                        nz < 0 || nz >= landscape[0].length ||
                        ny < 0 || ny >= landscape[0][0].length
                            ? 'air'
                            : landscape[nx]?.[nz]?.[ny]?.block;

                    const isExposed = neighborBlock === 'air' || neighborBlock.startsWith('flower_');

                    if (block === 'water' && isTopFace && isExposed) {
                        renderFace(block, posX, posY - cubeSize / 8, posZ, offset, rotation, true);
                    } else if (block !== 'water' && (isExposed || neighborBlock === 'water')) {
                        renderFace(block, posX, posY, posZ, offset, rotation, isTopFace);
                    }
                });
            });
        });
    });

    // Update instance matrices
    Object.values(meshes).forEach(instancedMeshes => {
        instancedMeshes.forEach(mesh => {
            mesh.instanceMatrix.needsUpdate = true;
        });
    });
}


export function renderSingleChunk(scene, chunkX, chunkZ) {
    renderChunk(scene, chunkX, chunkZ);
}


export function createClouds(scene) {
    const cloudGroup = new THREE.Group();
    const cloudCount = 64;
    const cubeSize = 1;
    const maxInstancesPerMesh = 1024;
    const minWidth = 8, maxWidth = 16;
    const minLength = 16, maxLength = 32;
    const minAltitude = 64, maxAltitude = 96;
    const spreadDistance = 512;
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
        const segmentCount = THREE.MathUtils.randInt(1, 3); // Number of segments in each cloud
        const altitude = THREE.MathUtils.lerp(minAltitude, maxAltitude, Math.random()); // Set uniform altitude for all segments in a cloud
        const distance = THREE.MathUtils.randFloat(0, spreadDistance);
        const angle = Math.random() * Math.PI * 2;

        // Create a unified 3D array to represent the entire cloud and avoid duplicates
        const cloudWidth = maxWidth * segmentCount;
        const cloudLength = maxLength * segmentCount;
        const cloudShape = Array.from({ length: cloudWidth }, () => 
            Array.from({ length: cloudLength }, () => Array(2).fill(false))
        );

        for (let s = 0; s < segmentCount; s++) {
            const segmentWidth = THREE.MathUtils.randInt(minWidth, maxWidth);
            const segmentLength = THREE.MathUtils.randInt(minLength, maxLength);

            // Random offset for each segment to position them close to each other
            const offsetX = THREE.MathUtils.randInt(0, cloudWidth - segmentWidth);
            const offsetZ = THREE.MathUtils.randInt(0, cloudLength - segmentLength);

            // Fill blocks in the unified cloudShape array without duplicates
            for (let x = 0; x < segmentWidth; x++) {
                for (let z = 0; z < segmentLength; z++) {
                    for (let y = 0; y < 2; y++) { // Height of 2 for volumetric effect
                        cloudShape[offsetX + x][offsetZ + z][y] = true;
                    }
                }
            }
        }

        // Create instanced meshes for this cloud cluster
        const instancedMeshes = [];
        let instancedMesh;

        for (let x = 0; x < cloudWidth; x++) {
            for (let z = 0; z < cloudLength; z++) {
                for (let y = 0; y < 2; y++) { // Height of 2 for volumetric effect
                    if (!cloudShape[x][z][y]) continue; // Skip empty blocks

                    const posX = x - cloudWidth / 2;
                    const posY = y;
                    const posZ = z - cloudLength / 2;

                    // Check for instanced mesh capacity
                    if (!instancedMesh || instancedMesh.count >= maxInstancesPerMesh - 6) {
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
