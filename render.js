import * as THREE from './three.r168.module.js';
import { generateLandscape } from './terrain.js';


const textureLoader = new THREE.TextureLoader();
const materials = {};
const meshes = {}; // Store arrays of InstancedMeshes by block type


function getBlockTexture(block, isTopFace = false) {
    let texturePath, bumpPath;

    if (block === 'dirt') {
        texturePath = isTopFace ? './textures/grass.png' : './textures/dirt.png';
        bumpPath = isTopFace ? './textures/grass_bump.png' : './textures/dirt_bump.png';
    } else {
        // Handle other block types as before
        switch (block) {
            case 'water':
                texturePath = './textures/water.png';
                bumpPath = './textures/water_bump.png';
                break;
            case 'sand':
                texturePath = './textures/sand.png';
                bumpPath = './textures/sand_bump.png';
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
    }

    const texture = textureLoader.load(texturePath);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapNearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 16;
    texture.needsUpdate = true;

    const bumpMap = textureLoader.load(bumpPath);
    bumpMap.minFilter = THREE.LinearMipmapNearestFilter;
    bumpMap.magFilter = THREE.NearestFilter;
    bumpMap.generateMipmaps = true;
    bumpMap.anisotropy = 16;
    bumpMap.needsUpdate = true;

    return { map: texture, bumpMap: bumpMap };
}


function getBlockMaterial(block, isTopFace = false) {
    const textureKey = isTopFace ? `${block}_top` : block;
    if (!materials[textureKey]) {
        const { map, bumpMap } = getBlockTexture(block, isTopFace);
        materials[textureKey] = new THREE.MeshLambertMaterial({
            map: map,
            bumpMap: bumpMap,
            bumpScale: 1.2,
            side: THREE.DoubleSide
        });
    }
    return materials[textureKey];
}


// Helper to get or create an InstancedMesh array for a given block type
function getInstancedMeshesForMaterial(materialKey) {
    if (!meshes[materialKey]) {
        meshes[materialKey] = []; // Initialize as an array to hold multiple InstancedMeshes if needed
    }
    return meshes[materialKey];
}


function renderChunk(scene, chunkX, chunkZ) {
    const cubeSize = 1;
    const landscape = generateLandscape(chunkX, chunkZ);
    const maxInstancesPerMesh = 1024;
    const tempMatrix = new THREE.Matrix4();

    // Directions for each face, marking the top face
    const directions = [
        { offset: [-1, 0, 0], rotation: [0, Math.PI / 2, 0], isTopFace: false },   // Left
        { offset: [1, 0, 0], rotation: [0, -Math.PI / 2, 0], isTopFace: false },   // Right
        { offset: [0, -1, 0], rotation: [Math.PI / 2, 0, 0], isTopFace: false },   // Bottom
        { offset: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0], isTopFace: true },    // Top
        { offset: [0, 0, -1], rotation: [0, 0, 0], isTopFace: false },             // Front
        { offset: [0, 0, 1], rotation: [0, Math.PI, 0] }                           // Back
    ];

    landscape.forEach((column, x) => {
        column.forEach((row, z) => {
            row.forEach((blockData, y) => {
                const block = blockData.block;
                if (!block || block === 'air') return;

                const posX = chunkX + x;
                const posY = y;
                const posZ = chunkZ + z;

                directions.forEach(({ offset, rotation, isTopFace }) => {
                    const [nx, ny, nz] = [x + offset[0], y + offset[1], z + offset[2]];

                    // Check if the adjacent block is out of bounds or air
                    if (
                        nx < 0 || nx >= landscape.length ||
                        nz < 0 || nz >= landscape[0].length ||
                        ny < 0 || ny >= landscape[0][0].length ||
                        landscape[nx]?.[nz]?.[ny]?.block === 'air'
                    ) {
                        // Use a separate material for the top face of dirt blocks
                        const materialKey = isTopFace && block === 'dirt' ? 'dirt_top' : block;
                        const material = getBlockMaterial(block, isTopFace && block === 'dirt');
                        const instancedMeshes = getInstancedMeshesForMaterial(materialKey);
                        let instancedMesh = instancedMeshes[instancedMeshes.length - 1];

                        if (!instancedMesh || instancedMesh.count >= maxInstancesPerMesh - 6) {
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
    cloudGroup.layers.set(1);
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
