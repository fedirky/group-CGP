import * as THREE from './three.r168.module.js';
import { getSimulatedTime } from './timeState.js';
import { skyMaterial } from './app.js';

const fogDensity = Math.sqrt(-Math.log(0.0001) / Math.pow(8 * 16, 2));
console.log(fogDensity);
let testMode = false; // Flag to enable manual testing
let testTime = 10;    // Default test in 24 hrs

const speedSlider = document.getElementById('speed-slider'); // Slider controlling speed on UI

const blendWindow = 1; // A fraction of an hour for blending segments of the day

// Cycle segment properties: startHour and environment settings
const segments = [
    {
        name: 'dawn',
        startHour: 5,
        background: 0xffd1dc,
        fogColor: 0xffd1dc,
        fogDensity: fogDensity,
        ambientColor: 0xffcba4,
        ambientIntensity: 0.5,
        dirColor: 0xffa500,
        dirIntensity: 0.75,
        topColor: 0xb3cde0,
        bottomColor: 0xffd1dc
    },
    {
        name: 'morning',
        startHour: 7,
        background: 0x87ceeb,
        fogColor: 0x87ceeb,
        fogDensity: fogDensity * 0.8,
        ambientColor: 0xffffcc,
        ambientIntensity: 1.0,
        dirColor: 0xffe4b5,
        dirIntensity: 1.5,
        topColor: 0x87ceeb,
        bottomColor: 0xfff8dc
        
    },
    {
        name: 'afternoon',
        startHour: 12,
        background: 0x87cefa,
        fogColor: 0x87cefa,
        fogDensity: fogDensity * 0.1,
        ambientColor: 0xffffff,
        ambientIntensity: 1.5,
        dirColor: 0xffffcc,
        dirIntensity: 2.0,
        topColor: 0x87cefa,
        bottomColor: 0xfdf5e6
        
    },
    {
        name: 'dusk',
        startHour: 17,
        background: 0xffa07a,
        fogColor: 0xffa07a,
        fogDensity: fogDensity * 0.6,
        ambientColor: 0xffd700,
        ambientIntensity: 0.8,
        dirColor: 0xff4500,
        dirIntensity: 0.5,
        topColor: 0xb39eb5 ,
        bottomColor: 0xffa07a
        
    },
    {
        name: 'evening',
        startHour: 19,
        background: 0x2f4f4f,
        fogColor: 0x2f4f4f,
        fogDensity: fogDensity * 0.4,
        ambientColor: 0x394552, //0x708090
        ambientIntensity: 0.4,
        dirColor: 0x191970,
        dirIntensity: 0.3,
        topColor: 0x142e2e, //0x2f4f4f
        bottomColor: 0x4a3e32 //0xfed8b1
         
    },
    {
        name: 'night',
        startHour: 22,
        background: 0x000033,
        fogColor: 0x000033,
        fogDensity: fogDensity * 0.3,
        ambientColor: 0x1e1e24, //454545
        ambientIntensity: 0.2,
        dirColor: 0x0B0B0B,
        dirIntensity: 0.1,
        topColor: 0x000033,
        bottomColor: 0x070736 //191970
          
    }
];

// Helper functions for interpolation
function lerpColor(currentColor, nextColor, t) {
    return new THREE.Color(currentColor).lerp(new THREE.Color(nextColor), t);
}

function lerpValue(currentValue, nextValue, t) {
    return currentValue + (nextValue - currentValue)*t;
}

/** 
 * Find the current segment and next segment is the one after it
 */
function findCurrentAndNextSegment(hourFloat) {
    const h = ((hourFloat % 24) + 24) % 24;

    let currentIndex = segments.length - 1;
    for (let i = 0; i < segments.length; i++) {
        if (h >= segments[i].startHour) {
            currentIndex = i;
        }
    }

    const nextIndex = (currentIndex + 1) % segments.length;
    return { current: segments[currentIndex], next: segments[nextIndex] };
}


/**
 * This updates the lighting in the scene based on the current local time or test mode.
 * Smoothly blends between the current and upcoming time segments over the blend window
 */
export function updateLighting(scene, currentTime = null) {
     let simulatedTime;
     if (currentTime) {
        simulatedTime = currentTime; // local time passed from app.js
     } else {
         simulatedTime = getSimulatedTime();
     }
    
    const hour = testMode ? testTime : simulatedTime.getHours();
    const minute = simulatedTime.getMinutes();
    let hourFloat = hour + minute / 60;

    const h = ((hourFloat % 24) + 24) % 24;
    const { current, next } = findCurrentAndNextSegment(h);

    let nextStartHour = next.startHour;
    
    if (nextStartHour <= current.startHour) {
        nextStartHour += 24;
        if (h < current.startHour) {
            hourFloat += 24;
        }
    }

    // console.log("Current start hour " + current.startHour)
    // console.log("Next start hour " + nextStartHour)


    // console.log("Current " + current.name)
    // console.log("Next " + next.name)
  
    // Check if we are within blendWindow of the next segment
    let t = 0;
    if (hourFloat >= (nextStartHour  - blendWindow) && hourFloat < nextStartHour ) {
        t = (hourFloat - (nextStartHour - blendWindow)) / blendWindow;
    } else if (hourFloat >= nextStartHour ) {
        t = 1;
    } else {
        t = 0;
    }

    // Lerp between current and next segment
    const bgColor = lerpColor(current.background, next.background, t);
    const fogColor = lerpColor(current.fogColor, next.fogColor, t);
    const fogDens = lerpValue(current.fogDensity, next.fogDensity, t);
    const ambColor = lerpColor(current.ambientColor, next.ambientColor, t);
    const ambInt = lerpValue(current.ambientIntensity, next.ambientIntensity, t);
    const dirColor = lerpColor(current.dirColor, next.dirColor, t);
    const dirInt = lerpValue(current.dirIntensity, next.dirIntensity, t);
    const top = lerpColor(current.topColor, next.topColor, t);
    const bottom = lerpColor(current.bottomColor, next.bottomColor, t);
    
    // Change scene lights ad others to match the day
    // scene.background = bgColor;
    skyMaterial.uniforms.topColor.value.copy(top);
    skyMaterial.uniforms.bottomColor.value.copy(bottom);

    scene.fog.color = fogColor;
    scene.fog.density = fogDens;

    const ambientLight = scene.children.find(obj => obj.isAmbientLight);
    if (ambientLight) {
        ambientLight.color.copy(ambColor);
        ambientLight.intensity = ambInt;
    }

    const directionalLight = scene.children.find(obj => obj.isDirectionalLight);
    if (directionalLight) {
        directionalLight.color.copy(dirColor);
        directionalLight.intensity = dirInt;
    }
    /* const simulatedTime = getSimulatedTime();
    const hour = testMode ? testTime : simulatedTime.getHours();
    const transitionDuration = 4000; // 2000; // Duration of transition in milliseconds

    console.log(hour)

    if (hour >= 5 && hour < 7) {
        transitionToDawn(scene, transitionDuration);
    } else if (hour >= 7 && hour < 11) {
        transitionToMorning(scene, transitionDuration);
    } else if (hour >= 11 && hour < 16) {
        transitionToAfternoon(scene, transitionDuration);
    } else if (hour >= 16 && hour < 19) {
        transitionToDusk(scene, transitionDuration);
    } else if (hour >= 19 && hour < 22) {
        transitionToEvening(scene, transitionDuration);
    } else {
        transitionToNight(scene, transitionDuration);
    }*/
}

/**
 * Transition functions for different times of the day.
 */
function transitionToDawn(scene, duration) {
    setBackground(scene, 0xffd1dc, duration)
    setFog(scene, 0xffd1dc, fogDensity, duration);
    setAmbientLight(scene, 0xffcba4, 0.5, duration);
    setDirectionalLight(scene, 0xffa500, 0.75, duration);
    // console.log("Transitioned to Dawn")
}

function transitionToMorning(scene, duration) {
    setBackground(scene, 0x87ceeb, duration)
    setFog(scene, 0x87ceeb, fogDensity * 0.5, duration);
    setAmbientLight(scene, 0xffffcc, 1.0, duration);
    setDirectionalLight(scene, 0xffe4b5, 1.5, duration);
    // console.log("Transitioned to Morning")
}

function transitionToAfternoon(scene, duration) {
    setBackground(scene, 0x87cefa, duration)
    setFog(scene, 0x87cefa, fogDensity  * 0.1, duration);
    setAmbientLight(scene, 0xffffff, 1.5, duration);
    setDirectionalLight(scene, 0xffffcc, 2.0, duration);
    // console.log("Transitioned to Afternoon")
}

function transitionToDusk(scene, duration) {
    setBackground(scene, 0xffa07a, duration)
    setFog(scene, 0xffa07a, fogDensity * 0.1, duration);
    setAmbientLight(scene, 0xffd700, 0.8, duration);
    setDirectionalLight(scene, 0xff4500, 0.5, duration);
    // console.log("Transitioned to Dusk")
}

function transitionToEvening(scene, duration) {
    setBackground(scene, 0x2f4f4f, duration)
    setFog(scene, 0x2f4f4f, fogDensity  * 0.2, duration);
    setAmbientLight(scene, 0x708090, 0.4, duration);
    setDirectionalLight(scene, 0x191970, 0.3, duration);
    // console.log("Transitioned to Evening")
}

function transitionToNight(scene, duration) {
    setBackground(scene, 0x000033, duration)
    setFog(scene, 0x000033, fogDensity * 0.25, duration);
    setAmbientLight(scene, 0x454545, 0.2, duration);
    setDirectionalLight(scene, 0x0B0B0B, 0.1, duration);
    // console.log("Transitioned to Night")
}

/**
 * Smoothly transition background colors.
 */
function setBackground(scene, color, duration) {
    // Store the start color and end color
    const startColor = scene.background instanceof THREE.Color ? scene.background.clone() : new THREE.Color(0x000000);
    const endColor = new THREE.Color(color);

    const startTime = performance.now();

    const simulationSpeed = parseFloat(speedSlider.value);
    duration = duration / simulationSpeed;

    function animateBackground() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);

        // Create a temporary lerped color
        const currentColor = startColor.clone().lerp(endColor, t);
        scene.background = currentColor;

        if (t < 1) {
            requestAnimationFrame(animateBackground);
        }
    }

    animateBackground();
}


/**
 * This function helps smoothly transition the fog settings.
 */
function setFog(scene, color, density, duration) {
    const startDensity = scene.fog.density;

    const simulationSpeed = parseFloat(speedSlider.value);
    duration = duration / simulationSpeed;

    const startTime = performance.now();
    function animateFog() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);

        scene.fog.color.lerp(new THREE.Color(color), t);
        scene.fog.density = THREE.MathUtils.lerp(startDensity, density, t);

        if (t < 1) requestAnimationFrame(animateFog);
    }
    animateFog();
}

/**
 * This function helps smoothly transition ambient light intensity and color.
 */
function setAmbientLight(scene, color, intensity, duration) {
    const ambientLight = scene.children.find(obj => obj.isAmbientLight);
    const startIntensity = ambientLight.intensity;

    const startTime = performance.now();
    function animateLight() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);

        ambientLight.color.lerp(new THREE.Color(color), t);
        ambientLight.intensity = THREE.MathUtils.lerp(startIntensity, intensity, t);

        if (t < 1) requestAnimationFrame(animateLight);
    }
    animateLight();
}

/**
 * This function helps smoothly transition directional light intensity and color.
 */
function setDirectionalLight(scene, color, intensity, duration) {
    const directionalLight = scene.children.find(obj => obj.isDirectionalLight);
    const startIntensity = directionalLight.intensity;

    const startTime = performance.now();
    function animateLight() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);

        directionalLight.color.lerp(new THREE.Color(color), t);
        directionalLight.intensity = THREE.MathUtils.lerp(startIntensity, intensity, t);

        if (t < 1) requestAnimationFrame(animateLight);
    }
    animateLight();
}

/**
 * This function enables or disables test mode for the day-night cycle.
 */
export function setTestMode(enabled, time = null) {
    testMode = enabled;
    if (time !== null) {
        testTime = time;
    }
}