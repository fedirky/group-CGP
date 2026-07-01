import * as THREE from './three.r168.module.js';

import Stats from './Stats.js';

import { EffectComposer } from './postprocessing/EffectComposer.js';
import { RenderPass } from './postprocessing/RenderPass.js';
import { OutputPass } from './postprocessing/OutputPass.js';
import { ShaderPass } from './postprocessing/ShaderPass.js';
import { FXAAShader } from './rendering/shaders/FXAAShader.js';

import { renderClouds, updateChunks } from './rendering/terrain_renderer.js';
import { breakBlock, placeBlock } from './player/blockActions.js';
import { raycastVoxel } from './player/collision.js';
import { buildBlockAtlas, setAtlasWhiteTextureDebug } from './rendering/blockAtlas.js';

import { MinecraftControls } from './player/MinecraftControls.js';
import { updateLighting, 
         setTestMode } from './effects/dayNightCycle.js';
import { createGradientSky } from './effects/GradientSky.js';
import { isSimulationPlaying, updateUI } from './ui/dayNightWidget.js'; 
import { getSimulatedTime } from './timeState.js';
import { createFireflies, updateFireflies } from './effects/fireFlies.js';
import { createAurora, updateAurora } from './effects/aurora.js';
import { toggleAO } from './voxelAO.js';
import { PLAYER_CONFIG, RENDER_CONFIG, UI_CONFIG, WORLD_CONFIG } from './config.js';


// import { FireFlies } from './utils/fire_fly/FireFly.ts';


// Stats UI
const stats = Array.from({ length: 3 }, (_, i) => {
    const stat = new Stats();
    stat.showPanel(i);
    stat.domElement.style.cssText = `position:absolute;top:0px;left:${i * 80}px;`;
    document.body.appendChild(stat.dom);
    return stat;
});

// Scene creation
export const scene = new THREE.Scene();
// scene.background = new THREE.Color(0x87CEEB);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false}); // Allow transparent background
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadow maps
document.body.appendChild(renderer.domElement);

// Camera setup
camera.position.set(...PLAYER_CONFIG.startPosition);

// Add a directional light
const directionalLight = new THREE.DirectionalLight(0xffffcc, 5); // White light
directionalLight.position.set(64, 64, 64); // Position the light
directionalLight.castShadow = true; // Enable shadow casting
scene.add(directionalLight);

// Configure light shadows
directionalLight.shadow.mapSize.width = 512; // Default
directionalLight.shadow.mapSize.height = 512; // Default
directionalLight.shadow.camera.near = 0.5; // Default
directionalLight.shadow.camera.far = 64; // Default

// Add ambient light
const ambientLight = new THREE.AmbientLight(0x404040, 15); // Soft white light
scene.add(ambientLight);

// Add fog
const fogDensity = Math.sqrt(-Math.log(0.0001) / Math.pow(UI_CONFIG.fogChunkDistance * WORLD_CONFIG.chunkSize, 2));
scene.fog = new THREE.FogExp2(0x87CEEB, fogDensity); 

const cloudGroup = renderClouds(scene);
cloudGroup.position.set(0,0,0);

// Render distance (in chunks) for the infinite world; editable in the menu.
let renderDistance = RENDER_CONFIG.defaultRenderDistance;

// The block texture-array atlas must finish loading before chunks can be built.
let atlasReady = false;
buildBlockAtlas().then(() => { atlasReady = true; });

let lastMinute = null; // track minute changes

const clock = new THREE.Clock();
const controls = new MinecraftControls(camera, renderer.domElement);
controls.movementSpeed = PLAYER_CONFIG.movementSpeed;
controls.lookSpeed = PLAYER_CONFIG.lookSpeed;

const whiteTextureData = new Uint8Array([255, 255, 255, 255]);
const whiteDebugTexture = new THREE.DataTexture(whiteTextureData, 1, 1);
whiteDebugTexture.colorSpace = THREE.SRGBColorSpace;
whiteDebugTexture.needsUpdate = true;
let whiteTextureDebugEnabled = false;

function countVertices() {
    let vertexCount = 0;
    scene.traverse((object) => {
        if (object.isMesh) {
            vertexCount += object.geometry.attributes.position.count; // Count vertices
        }
    });
    return vertexCount;
}

function setWhiteTextureDebug(enabled) {
    whiteTextureDebugEnabled = enabled;
    setAtlasWhiteTextureDebug(enabled);

    scene.traverse((object) => {
        if (!object.material) return;

        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];

        objectMaterials.forEach((material) => {
            if (!material) return;

            if (!material.userData.whiteTextureDebugOriginal) {
                material.userData.whiteTextureDebugOriginal = {
                    map: material.map || null,
                    bumpMap: material.bumpMap || null,
                    normalMap: material.normalMap || null,
                    roughnessMap: material.roughnessMap || null,
                    metalnessMap: material.metalnessMap || null,
                    emissiveMap: material.emissiveMap || null,
                    bumpScale: 'bumpScale' in material ? material.bumpScale : null,
                    color: material.color ? material.color.clone() : null,
                    emissive: material.emissive ? material.emissive.clone() : null,
                };
            }

            const original = material.userData.whiteTextureDebugOriginal;

            if (enabled) {
                if ('map' in material) material.map = whiteDebugTexture;
                if ('bumpMap' in material) material.bumpMap = null;
                if ('normalMap' in material) material.normalMap = null;
                if ('roughnessMap' in material) material.roughnessMap = null;
                if ('metalnessMap' in material) material.metalnessMap = null;
                if ('emissiveMap' in material) material.emissiveMap = null;
                if ('bumpScale' in material) material.bumpScale = 0;
                if (material.color) material.color.set(0xffffff);
                if (material.emissive) material.emissive.set(0x000000);
            } else {
                if ('map' in material) material.map = original.map;
                if ('bumpMap' in material) material.bumpMap = original.bumpMap;
                if ('normalMap' in material) material.normalMap = original.normalMap;
                if ('roughnessMap' in material) material.roughnessMap = original.roughnessMap;
                if ('metalnessMap' in material) material.metalnessMap = original.metalnessMap;
                if ('emissiveMap' in material) material.emissiveMap = original.emissiveMap;
                if ('bumpScale' in material && original.bumpScale !== null) material.bumpScale = original.bumpScale;
                if (material.color && original.color) material.color.copy(original.color);
                if (material.emissive && original.emissive) material.emissive.copy(original.emissive);
            }

            material.needsUpdate = true;
        });
    });
}

export const { skyMesh, skyMaterial } = createGradientSky(scene);
createFireflies(scene);
createAurora(scene);

// Initialize post-processing (plain forward pipeline; block light is baked
// per-vertex into the chunk geometry, so no screen-space light passes are needed).
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
    composer.addPass(fxaaPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// Function to update composer size
function updateComposerSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    renderer.setSize(width, height); // Set renderer size
    composer.setSize(width, height); // Set composer size

    // Keep the camera aspect in sync (the original handler never did this).
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    fxaaPass.material.uniforms['resolution'].value.set(1 / width, 1 / height);
}

// Add event handler for window resize
window.addEventListener('resize', updateComposerSize);

// Keyboard controls for testing the day-night cycle
document.addEventListener('keydown', (event) => {
    const keyTimeMap = {
        t: 5, // Dawn or Twilight
        y: 9, // Morning
        u: 13, // Afternoon
        i: 17, // Dusk
        o: 20, // Evening
        p: 23, // Night
    };

    if (keyTimeMap[event.key] !== undefined) {
        setTestMode(true, keyTimeMap[event.key]);
        console.log(`Test Mode: ${event.key} - ${keyTimeMap[event.key]} hours`);
    } else if (event.key === 'l') {
        setTestMode(false);
        console.log('Test Mode Disabled: Using Real Time');
    } else if (event.key === 'v' || event.key === 'V') {
        const enabled = toggleAO();
        console.log(`Ambient Occlusion: ${enabled ? 'ON' : 'OFF'}`);
    } else if (event.key === 'b' || event.key === 'B') {
        setWhiteTextureDebug(!whiteTextureDebugEnabled);
        console.log(`White texture debug: ${whiteTextureDebugEnabled ? 'ON' : 'OFF'}`);
    } else if (event.key === 'e' || event.key === 'E') {
        toggleInventory();
    }
});

export function updateLightingWithTime(time) {
    updateLighting(scene, time);
}


// --- Settings / pause menu (opens on Escape, lets you pick a movement mode) ---
const settingsMenu = document.getElementById('settings-menu');
const modeButtons = document.querySelectorAll('.mode-button');
const resumeButton = document.getElementById('resume-button');
let hasPlayed = false; // only show the menu after the player has started
let inventoryOpen = false; // inventory also releases the pointer; suppress the settings menu then

function refreshModeButtons() {
    modeButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.mode === controls.mode);
    });
}

function showSettingsMenu() {
    refreshModeButtons();
    settingsMenu.classList.add('visible');
}

function hideSettingsMenu() {
    settingsMenu.classList.remove('visible');
}

modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        controls.setMode(button.dataset.mode);
        refreshModeButtons();
        console.log(`Movement mode: ${controls.mode}`);
        controls.lock(); // re-enter the world
    });
});

resumeButton.addEventListener('click', () => {
    controls.lock();
});

// Pointer lock drives menu visibility: locked = playing, unlocked = menu open.
document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) {
        hasPlayed = true;
        hideSettingsMenu();
    } else if (hasPlayed && !inventoryOpen) {
        showSettingsMenu();
    }
});

refreshModeButtons();

// Render distance slider.
const rdSlider = document.getElementById('render-distance-slider');
const rdValue = document.getElementById('render-distance-value');
rdSlider.value = String(renderDistance);
rdValue.textContent = String(renderDistance);
rdSlider.addEventListener('input', () => {
    renderDistance = parseInt(rdSlider.value, 10);
    rdValue.textContent = String(renderDistance);
});


// --- Inventory (E) + selected block for placement ---------------------------
const BLOCK_TEX = './resources/texturepacks/default/blocks';
const PLACEABLE_BLOCKS = [
    'grass', 'dirt', 'stone', 'sand',
    'oak_log', 'oak_leaves', 'oak_gold_log', 'oak_gold_leaves',
    'skyroot_log', 'skyroot_leaves', 'skyroot_leaves_berry_glowing_2D3D59_3', 'ice',
];

const inventory = document.getElementById('inventory');
const inventoryGrid = document.getElementById('inventory-grid');
const hotbarSlot = document.getElementById('hotbar-slot');
let selectedBlock = PLACEABLE_BLOCKS[0];

function iconUrl(block) {
    return `url('${BLOCK_TEX}/${block}.png')`;
}

function selectBlock(block) {
    selectedBlock = block;
    hotbarSlot.style.backgroundImage = iconUrl(block);
    inventoryGrid.querySelectorAll('.inv-slot').forEach((slot) => {
        slot.classList.toggle('active', slot.dataset.block === block);
    });
}

// Build the grid once.
PLACEABLE_BLOCKS.forEach((block) => {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    slot.dataset.block = block;
    slot.title = block;
    slot.style.backgroundImage = iconUrl(block);
    slot.addEventListener('click', () => {
        selectBlock(block);
        closeInventory(); // picking a block returns you to the world
    });
    inventoryGrid.appendChild(slot);
});
selectBlock(selectedBlock);

function openInventory() {
    inventoryOpen = true;
    inventory.classList.add('visible');
    controls.unlock(); // release the cursor so slots are clickable
}

function closeInventory() {
    inventory.classList.remove('visible');
    inventoryOpen = false;
    controls.lock(); // re-enter the world (click was a user gesture)
}

function toggleInventory() {
    if (inventoryOpen) closeInventory();
    else openInventory();
}


// --- Block breaking (left click) and placing (right click) ------------------
const _rayDir = new THREE.Vector3();
const BREAK_REACH = PLAYER_CONFIG.breakReach;

// Would a block at these integer coords overlap the player's collider? Prevents
// placing a block inside yourself (which would trap you in walk mode).
function intersectsPlayer(bx, by, bz) {
    const hw = controls.playerHalfWidth;
    const feetY = camera.position.y - controls.eyeHeight;
    return camera.position.x - hw < bx + 0.5 && camera.position.x + hw > bx - 0.5 &&
           camera.position.z - hw < bz + 0.5 && camera.position.z + hw > bz - 0.5 &&
           feetY < by + 0.5 && feetY + controls.playerHeight > by - 0.5;
}

renderer.domElement.addEventListener('mousedown', (event) => {
    // If the pointer isn't locked (e.g. just closed the inventory/menu), any
    // click re-locks it instead of interacting — otherwise right-click, which
    // doesn't trigger the controls' own re-lock, would silently do nothing.
    if (document.pointerLockElement !== renderer.domElement) {
        if (!inventoryOpen) controls.lock();
        return;
    }

    event.preventDefault();

    camera.getWorldDirection(_rayDir);
    const hit = raycastVoxel(camera.position, _rayDir, BREAK_REACH);
    if (!hit) return;

    if (event.button === 0) {
        breakBlock(scene, hit.x, hit.y, hit.z);
    } else if (event.button === 2 && selectedBlock) {
        // Place into the empty cell in front of the hit face.
        if (!intersectsPlayer(hit.px, hit.py, hit.pz)) {
            placeBlock(scene, hit.px, hit.py, hit.pz, selectedBlock);
        }
    }
});


/*const fireflies = new FireFlies(scene, {
    groupCount: 2,
    firefliesPerGroup: 250,
    groupRadius: 10,
    groupCenters: [new THREE.Vector3(0, 25, 0)]
});*/

const spreadDistance = 512;

// Animation loop
function animate() {
    
    stats.forEach(stat => stat.begin());

    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    controls.update(delta);

    // Stream the infinite world around the player (chunk coords from position).
    if (atlasReady) {
        const centerCX = Math.floor(camera.position.x / WORLD_CONFIG.chunkSize);
        const centerCZ = Math.floor(camera.position.z / WORLD_CONFIG.chunkSize);
        updateChunks(scene, centerCX, centerCZ, renderDistance);
    }

    let currentTime;

    // Update lighting with local time if simulation is not playing
    if (!isSimulationPlaying()) {
        currentTime = new Date();
        updateLighting(scene, currentTime);
        updateUI(currentTime);
    } else {
        currentTime = getSimulatedTime();
        updateLighting(scene); // otherwise just use simulatedTime
        updateUI(currentTime);
    }

    skyMesh.position.copy(camera.position);
    // fireflies.update(0.008); // Update fireflies

    // Move clouds after every minute
    const currentMinute = currentTime.getMinutes();
    if (lastMinute !== currentMinute) {
        cloudGroup.position.x += 0.1;  //move clouds to the right
        lastMinute = currentMinute;
    }

    // Move clouds back to original position after the position exceeds 1/2 the spreadDistance
    if (cloudGroup.position.x > spreadDistance / 2) {
        cloudGroup.position.x -= spreadDistance;
    } else if (cloudGroup.position.x < -spreadDistance / 2) {
        cloudGroup.position.x += spreadDistance;
    }

    updateFireflies();

    updateAurora();

    composer.render();

    stats.forEach(stat => stat.end());
}

animate();
