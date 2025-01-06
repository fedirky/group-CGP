import * as THREE from './three.r168.module.js';

import Stats from './Stats.js';

import { EffectComposer } from './postprocessing/EffectComposer.js';
import { RenderPass } from './postprocessing/RenderPass.js';
import { OutputPass } from './postprocessing/OutputPass.js';
import { ShaderPass } from './postprocessing/ShaderPass.js';
import { FXAAShader } from './shaders/FXAAShader.js';

import { renderTerrain, renderClouds } from './terrain_renderer.js';

import { FlyControls } from './FlyControls.js';
import { updateLighting, 
         setTestMode } from './dayNightCycle.js';
import { createGradientSky } from './GradientSky.js';
import { isSimulationPlaying, updateUI } from './ui.js'; 
import { getSimulatedTime } from './timeState.js';
import { loadHotAirBalloons, updateHotAirBalloons } from './hotAirBalloons.js';
import { createFireflies, updateFireflies } from './fireFlies.js';
import { createAurora, updateAurora } from './aurora.js';


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

renderTerrain(scene);
const cloudGroup = renderClouds(scene);
cloudGroup.position.set(0,0,0);

let lastMinute = null; // track minute changes

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

export const { skyMesh, skyMaterial } = createGradientSky(scene);
loadHotAirBalloons(scene);
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
    }
});

export function updateLightingWithTime(time) {
    updateLighting(scene, time);
}


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

    // Fade balloons in and out based on time
    updateHotAirBalloons(currentTime);

    updateFireflies();

    updateAurora();

    composer.render();    

    stats.forEach(stat => stat.end());

    controls.update(0.01);
}

animate();
