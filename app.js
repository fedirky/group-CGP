import * as THREE from '/libs/three.r168.module.js';

import Stats from '/libs/Stats.js';

import { EffectComposer } from '/libs/postprocessing/EffectComposer.js';
import { RenderPass } from '/libs/postprocessing/RenderPass.js';
import { OutputPass } from '/libs/postprocessing/OutputPass.js';
import { ShaderPass } from '/libs/postprocessing/ShaderPass.js';
import { FXAAShader } from '/shaders/FXAAShader.js';

import { renderTerrain, renderClouds } from '/terrain_renderer.js';

import { FlyControls } from '/FlyControls.js';
import { updateLighting, 
         setTestMode } from '/dayNightCycle.js';
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
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
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

renderTerrain(scene);
renderClouds(scene);

const controls = new FlyControls(camera, renderer.domElement);
controls.movementSpeed = 20;
controls.rollSpeed = 0.7;
controls.autoForward = false;
controls.dragToLook = true;

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
        t: 6, // Dawn or Twilight
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
    }
});


/*const fireflies = new FireFlies(scene, {
    groupCount: 2,
    firefliesPerGroup: 250,
    groupRadius: 10,
    groupCenters: [new THREE.Vector3(0, 25, 0)]
});*/

// Animation loop
function animate() {
    
    stats.forEach(stat => stat.begin());

    requestAnimationFrame(animate);

    updateLighting(scene, new Date());
    // fireflies.update(0.008); // Update fireflies

    composer.render();    

    stats.forEach(stat => stat.end());

    controls.update(0.01);
}

animate();
