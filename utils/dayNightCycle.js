import * as THREE from '../three.r168.module.js';

let testMode = false; // Flag to enable manual testing
let testTime = 12;    // Default test time 12PM (afternoon)

/**
 * This updates the lighting in the scene based on the current local time or test mode.
 */
export function updateLighting(scene, currentTime) {
    const hour = testMode ? testTime : currentTime.getHours();
    const transitionDuration = 2000; // Duration of transition in milliseconds

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
        dawn: { color: new THREE.Color(0xffc8a2), density: 0.015 },
        morning: { color: new THREE.Color(0x87ceeb), density: 0.01 },
        afternoon: { color: new THREE.Color(0x4682b4), density: 0.008 },
        dusk: { color: new THREE.Color(0xffa07a), density: 0.02 },
        evening: { color: new THREE.Color(0x6a5acd), density: 0.03 },
        night: { color: new THREE.Color(0x191970), density: 0.04 },
    };
}

/**
 * Transition functions for different times of the day.
 */
function transitionToDawn(scene, duration) {
    setFog(scene, 0xffd1dc, 0.015, duration);
    setAmbientLight(scene, 0xffcba4, 0.5, duration);
    setDirectionalLight(scene, 0xffa500, 0.75, duration);
}

function transitionToMorning(scene, duration) {
    setFog(scene, 0x87ceeb, 0.01, duration);
    setAmbientLight(scene, 0xffffcc, 1.0, duration);
    setDirectionalLight(scene, 0xffe4b5, 1.5, duration);
}

function transitionToAfternoon(scene, duration) {
    setFog(scene, 0x87cefa, 0.008, duration);
    setAmbientLight(scene, 0xffffff, 1.5, duration);
    setDirectionalLight(scene, 0xffffcc, 2.0, duration);
}

function transitionToDusk(scene, duration) {
    setFog(scene, 0xffa07a, 0.012, duration);
    setAmbientLight(scene, 0xffd700, 0.8, duration);
    setDirectionalLight(scene, 0xff4500, 0.5, duration);
}

function transitionToEvening(scene, duration) {
    setFog(scene, 0x2f4f4f, 0.02, duration);
    setAmbientLight(scene, 0x708090, 0.4, duration);
    setDirectionalLight(scene, 0x191970, 0.3, duration);
}

function transitionToNight(scene, duration) {
    setFog(scene, 0x000033, 0.025, duration);
    setAmbientLight(scene, 0x000033, 0.2, duration);
    setDirectionalLight(scene, 0x000000, 0.1, duration);
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
            const transitionDuration = 5000;
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