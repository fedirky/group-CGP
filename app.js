import * as THREE from './three.r168.module.js';

import Stats from './Stats.js';

import { EffectComposer } from './postprocessing/EffectComposer.js';
import { RenderPass } from './postprocessing/RenderPass.js';
import { OutputPass } from './postprocessing/OutputPass.js';
import { ShaderPass } from './postprocessing/ShaderPass.js';
import { FXAAShader } from './shaders/FXAAShader.js';

import { renderClouds, breakBlock, updateChunks, updateLights } from './terrain_renderer.js';
import { raycastVoxel } from './collision.js';
import { buildBlockAtlas } from './blockAtlas.js';

import { MinecraftControls } from './MinecraftControls.js';
import { updateLighting, 
         setTestMode } from './dayNightCycle.js';
import { createGradientSky } from './GradientSky.js';
import { isSimulationPlaying, updateUI } from './ui.js'; 
import { getSimulatedTime } from './timeState.js';
import { createFireflies, updateFireflies } from './fireFlies.js';
import { createAurora, updateAurora } from './aurora.js';
import { toggleAO } from './voxelAO.js';


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
camera.position.set(0, 16, 0);

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
const fogDensity = Math.sqrt(-Math.log(0.0001) / Math.pow(8 * 16, 2));
scene.fog = new THREE.FogExp2(0x87CEEB, fogDensity); 

const cloudGroup = renderClouds(scene);
cloudGroup.position.set(0,0,0);

// Render distance (in chunks) for the infinite world; editable in the menu.
let renderDistance = 6;

// The block texture-array atlas must finish loading before chunks can be built.
let atlasReady = false;
buildBlockAtlas().then(() => { atlasReady = true; });

let lastMinute = null; // track minute changes

const clock = new THREE.Clock();
const controls = new MinecraftControls(camera, renderer.domElement);
controls.movementSpeed = 16;
controls.lookSpeed = 0.0022;

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
                if (material.color) material.color.set(0xffffff);
                if (material.emissive) material.emissive.set(0x000000);
            } else {
                if ('map' in material) material.map = original.map;
                if ('bumpMap' in material) material.bumpMap = original.bumpMap;
                if ('normalMap' in material) material.normalMap = original.normalMap;
                if ('roughnessMap' in material) material.roughnessMap = original.roughnessMap;
                if ('metalnessMap' in material) material.metalnessMap = original.metalnessMap;
                if ('emissiveMap' in material) material.emissiveMap = original.emissiveMap;
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

// Initialize post-processing
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

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
    } else if (hasPlayed) {
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


// --- Block breaking: left click while playing removes the targeted block ---
const _rayDir = new THREE.Vector3();
const BREAK_REACH = 6;

renderer.domElement.addEventListener('mousedown', (event) => {
    // Only when actually in the world (pointer locked) and on left click.
    if (document.pointerLockElement !== renderer.domElement) return;
    if (event.button !== 0) return;

    camera.getWorldDirection(_rayDir);
    const hit = raycastVoxel(camera.position, _rayDir, BREAK_REACH);
    if (hit) {
        breakBlock(scene, hit.x, hit.y, hit.z);
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
        const centerCX = Math.floor(camera.position.x / 16);
        const centerCZ = Math.floor(camera.position.z / 16);
        updateChunks(scene, centerCX, centerCZ, renderDistance);
        updateLights(camera.position.x, camera.position.y, camera.position.z);
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
