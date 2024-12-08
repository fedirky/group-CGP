import * as THREE from 'three';

import app_settings from "../settings.json" with { type: "json" };


const fogDensity = Math.sqrt(-Math.log(0.0001) / Math.pow(app_settings.generation.world_size * 16, 2));
console.log(fogDensity);
let testMode = true; // Flag to enable manual testing
let testTime = 19;    // Default test time 12PM (afternoon)


/**
 * This updates the lighting in the scene based on the current local time or test mode.
 */
export function updateLighting(scene, currentTime) {
    const hour = testMode ? testTime : currentTime.getHours();
    const transitionDuration = 1; // 2000; // Duration of transition in milliseconds

    if (hour >= 5 && hour < 7) {
        transitionToDawn(scene, transitionDuration);
    } else if (hour >= 8 && hour < 12) {
        transitionToMorning(scene, transitionDuration);
    } else if (hour >= 12 && hour < 16) {
        transitionToAfternoon(scene, transitionDuration);
    } else if (hour >= 16 && hour < 19) {
        transitionToDusk(scene, transitionDuration);
    } else if (hour >= 19 && hour < 22) {
        transitionToEvening(scene, transitionDuration);
    } else {
        transitionToNight(scene, transitionDuration);
    }

    const fogSettings = {
        dawn:      { color: new THREE.Color(0xffc8a2), density: fogDensity },
        morning:   { color: new THREE.Color(0x87ceeb), density: fogDensity },
        afternoon: { color: new THREE.Color(0x4682b4), density: fogDensity },
        dusk:      { color: new THREE.Color(0xffa07a), density: fogDensity },
        evening:   { color: new THREE.Color(0x6a5acd), density: fogDensity },
        night:     { color: new THREE.Color(0x191970), density: fogDensity },
    };
}

/**
 * Transition functions for different times of the day.
 */
function transitionToDawn(scene, duration) {
    setBackground(scene, 0xffd1dc)
    setFog(scene, 0xffd1dc, fogDensity, duration);
    setAmbientLight(scene, 0xffcba4, 0.5, duration);
    setDirectionalLight(scene, 0xffa500, 0.75, duration);
}

function transitionToMorning(scene, duration) {
    setBackground(scene, 0x87ceeb)
    setFog(scene, 0x87ceeb, fogDensity, duration);
    setAmbientLight(scene, 0xffffcc, 1.0, duration);
    setDirectionalLight(scene, 0xffe4b5, 1.5, duration);
}

function transitionToAfternoon(scene, duration) {
    setBackground(scene, 0x87cefa)
    setFog(scene, 0x87cefa, fogDensity, duration);
    setAmbientLight(scene, 0xffffff, 1.5, duration);
    setDirectionalLight(scene, 0xffffcc, 2.0, duration);
}

function transitionToDusk(scene, duration) {
    setBackground(scene, 0xffa07a)
    setFog(scene, 0xffa07a, fogDensity, duration);
    setAmbientLight(scene, 0xffd700, 0.8, duration);
    setDirectionalLight(scene, 0xff4500, 0.5, duration);
}

function transitionToEvening(scene, duration) {
    setBackground(scene, 0x2f4f4f)
    setFog(scene, 0x2f4f4f, fogDensity, duration);
    setAmbientLight(scene, 0x708090, 0.4, duration);
    setDirectionalLight(scene, 0x191970, 0.3, duration);
}

function transitionToNight(scene, duration) {
    setBackground(scene, 0x000033)
    setFog(scene, 0x000033, fogDensity, duration);
    setAmbientLight(scene, 0x000033, 0.2, duration);
    setDirectionalLight(scene, 0x000000, 0.1, duration);
}

function setBackground(scene, color) {
    scene.background = new THREE.Color(color);
}

/**
 * This function helps smoothly transition the fog settings.
 */
function setFog(scene, color, density, duration) {
    const startDensity = scene.fog.density;

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

        //Ensure smooth transitioning as well.
        const scene = globalScene;
        if (scene) {
            const transitionDuration = 1; // 5000;
            if (testTime >= 5 && testTime < 7) {
                transitionToDawn(scene, transitionDuration);
            } else if (testTime >= 7 && testTime < 12) {
                transitionToMorning(scene, transitionDuration);
            } else if (testTime >= 12 && testTime < 16) {
                transitionToAfternoon(scene, transitionDuration);
            } else if (testTime >= 16 && testTime < 19) {
                transitionToDusk(scene, transitionDuration);
            } else if (testTime >= 19 && testTime < 22) {
                transitionToEvening(scene, transitionDuration);
            } else {
                transitionToNight(scene, transitionDuration);
            }
        }
    }
}