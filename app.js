import * as THREE from './three.r168.module.js';
import { FlyControls } from './FlyControls.js';

import { EffectComposer } from './postprocessing/EffectComposer.js';
import { RenderPass } from './postprocessing/RenderPass.js';
import { SAOPass } from './postprocessing/SAOPass.js';
import { OutputPass } from './postprocessing/OutputPass.js';
import { ShaderPass } from './postprocessing/ShaderPass.js';
import { FXAAShader } from './shaders/FXAAShader.js';

import { renderSingleChunk, createClouds } from './render.js';

// Define a global or module-scoped variable to store settings
let app_settings = {};

// Function to load settings
// Function to load settings
function loadSettings() {
    return fetch('./settings.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Settings file not found');
            }
            return response.json();
        })
        .then(settings => {
            app_settings = settings;  // Save settings to the global variable
            console.log("Settings loaded:", app_settings);
        })
        .catch(error => {
            console.warn('Settings file not found, using default settings.');
            // Завантажуємо дефолтні налаштування з settings_example.json
            return fetch('./settings_example.json')
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Default settings file not found');
                    }
                    return response.json();
                })
                .then(defaultSettings => {
                    app_settings = defaultSettings;
                    console.log("Default settings loaded:", app_settings);
                })
                .catch(defaultError => {
                    console.error('Error loading default settings:', defaultError);
                });
        });
}

loadSettings();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false}); // Allow transparent background
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadow maps
document.body.appendChild(renderer.domElement);

// Camera setup
camera.position.set(20, 15, 30);

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


let frameCount = 0;
let lastTime = performance.now();

// Generate 4 chunks in a X on Z grid
loadSettings().then(() => {
    const chunkSize = 16; // Size of each chunk (optional, if you have a specific size)
    const numChunksX = app_settings.generation.world_size; // Number of chunks in the X direction
    const numChunksZ = app_settings.generation.world_size; // Number of chunks in the Z direction

    for (let i = 0; i < numChunksX; i++) {
        for (let j = 0; j < numChunksZ; j++) {
            renderSingleChunk(scene, i * chunkSize, j * chunkSize);
        }
    }
});

createClouds(scene);

const controls = new FlyControls(camera, renderer.domElement);
controls.movementSpeed = 20;
controls.rollSpeed = 0.7;
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
loadSettings().then(() => {
    if (app_settings.graphics.ssao) {
        const saoPass = new SAOPass(scene, camera);
        composer.addPass(saoPass);

        saoPass.params.saoBias = 10;
        saoPass.params.saoIntensity = 0.015;
        saoPass.params.saoScale = 7.5;
        saoPass.params.saoKernelRadius = 50;
        saoPass.params.saoMinResolution = 0;
        saoPass.params.saoBlur = true;
        saoPass.params.saoBlurRadius = 8;
        saoPass.params.saoBlurStdDev = 12;
        saoPass.params.saoBlurDepthCutoff = 0.0005;
        saoPass.normalMaterial.side = THREE.DoubleSide;
        saoPass.enabled = true;
    }

    if (app_settings.graphics.fxaa) {
        const fxaaPass = new ShaderPass(FXAAShader);
        fxaaPass.material.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
        composer.addPass(fxaaPass);
    }
});

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
        fpsCounter.textContent = `FPS: ${Math.round(fps)}, Vertices: ${vertices}`; // Output FPS and vertex count
        frameCount = 0;
        lastTime = currentTime;
    }

    requestAnimationFrame(animate);
    controls.update(0.01);
    //adjustSAOScale(); // Adjust SAO scale based on distance
    composer.render(); // Use composer for rendering with SAO
}

animate();
