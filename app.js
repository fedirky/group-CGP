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
// scene.background = new THREE.Color(0x87CEEB);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false}); // Allow transparent background
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadow maps
document.body.appendChild(renderer.domElement);

const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    depthTexture: new THREE.DepthTexture(),
    depthBuffer: true,
});
renderer.setRenderTarget(renderTarget);

// Camera setup
camera.position.set(20, 15, 30);
camera.layers.enable(0); // Основний шар
camera.layers.enable(1); // Шар квітів і хмар

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
// scene.fog = new THREE.FogExp2(0xffffff, 0.01); 

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


//Add fog shaider
const FogShader = {
    uniforms: {
        tDiffuse: { value: null }, // Вхідна текстура сцени
        uFogColor: { value: new THREE.Color(0xFF0000) }, // Колір туману
        uFogDensity: { value: 0.5 }, // Щільність туману
        uCameraDepth: { value: 1.0 } // Глибина сцени (можна налаштувати)
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;  // Input scene texture
        uniform sampler2D tDepth;    // Depth texture
        uniform vec3 uFogColor;      // Fog color
        uniform float uFogDensity;   // Fog density

        varying vec2 vUv;

        float linearizeDepth(float depth) {
            float near = 0.1; // Match the camera's near plane
            float far = 1000.0; // Match the camera's far plane
            return (2.0 * near) / (far + near - depth * (far - near));
        }

        void main() {
            / * vec4 sceneColor = texture2D(tDiffuse, vUv);
            float depth = texture2D(tDepth, vUv).r; // Read depth value
            float linearDepth = linearizeDepth(depth);

            // Calculate fog factor
            float fogFactor = exp(-uFogDensity * linearDepth);
            fogFactor = clamp(fogFactor, 0.0, 1.0);

            // Mix fog and scene color
            vec3 color = mix(uFogColor, sceneColor.rgb, fogFactor);

            gl_FragColor = vec4(color, sceneColor.a); */
            float depth = texture2D(tDepth, vUv).r;
            gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); // Display depth as grayscale
        }
    `
};


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

    const depthTexture = new THREE.DepthTexture();
    depthTexture.type = THREE.UnsignedShortType; // Ensure it's readable in shaders

    // Add fog shader pass after SAO but before final rendering
    const fogPass = new ShaderPass(FogShader);
    fogPass.uniforms.tDepth.value = renderTarget.depthTexture; // Pass the depth texture
    fogPass.uniforms.uFogColor.value = new THREE.Color(0xaaaaaa); // Fog color
    fogPass.uniforms.uFogDensity.value = 1.0; // Fog density
    composer.addPass(fogPass);

    // Add FXAA pass if enabled
    if (app_settings.graphics.fxaa) {
        fxaaPass = new ShaderPass(FXAAShader);
        fxaaPass.material.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
        composer.addPass(fxaaPass);
    }

    // Add OutputPass for final output
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // Ensure the composer size updates dynamically
    window.addEventListener('resize', updateComposerSize);
});

// Function to update composer size
function updateComposerSize() {
    if (app_settings.graphics.fxaa) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        renderer.setSize(width, height); // Set renderer size
        composer.setSize(width, height); // Set composer size

        fxaaPass.material.uniforms['resolution'].value.set(1 / width, 1 / height);
    }
}

// Add event handler for window resize
window.addEventListener('resize', updateComposerSize);

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

    camera.layers.set(0); // Render only layer 0
    renderer.autoClear = true; // Enable clearing for the first pass
    renderer.autoClearDepth = true;
    composer.render();

    // camera.layers.enable(0);
    camera.layers.set(1); // Render only layer 1
    renderer.autoClear = false; // Disable clearing to overlay on the previous render
    renderer.autoClearDepth = false;
    renderer.render(scene, camera);
    
    
    controls.update(0.01);
}

animate();
