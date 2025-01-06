import * as THREE from './three.r168.module.js';
import { getSimulatedTime } from './timeState.js';

let auroraMesh = null;
let auroraMaterial = null;
let auroraAmbientLight = null;

/**
 * Create an aurora using light streaks from shaders
 */
export function createAurora(scene) {
    const auroraGeometry = new THREE.PlaneGeometry(2000, 2000, 40, 40);

    auroraMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            opacity: { value: 0.0 },
            color1: { value: new THREE.Color(0x00ff88) },  // green
            color2: { value: new THREE.Color(0x0088ff) },  // blue
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        vertexShader: `
            uniform float time;
            varying vec2 vUv;
            varying float vWave;
            void main() {
                vUv = uv;
                vWave = sin(position.x * 0.1 + time) * 0.3;
                vec3 pos = position + normal * vWave * 10.0;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color1;
            uniform vec3 color2;
            uniform float opacity;
            varying vec2 vUv;
            varying float vWave;

            void main() {
                float strength = smoothstep(0.0, 0.5, vUv.y + vWave) * smoothstep(0.5, 0.0, vUv.x + vWave);
                vec3 finalColor = mix(color1, color2, vUv.y);
                gl_FragColor = vec4(finalColor * strength, opacity * strength);
            }
        `
    });

    auroraMesh = new THREE.Mesh(auroraGeometry, auroraMaterial);
    auroraMesh.rotation.x = Math.PI / 2;  
    auroraMesh.position.set(300, 120, -10);  
    scene.add(auroraMesh);

    // Add an ambient light so the aurora lights up the scene ever so slightly
    auroraAmbientLight = new THREE.AmbientLight(new THREE.Color(0x00ff88), 0); 
    scene.add(auroraAmbientLight);
}

/**
 * Update the aurora visibility, shader animation, and ambient light color.
 */
export function updateAurora() {
    const time = getSimulatedTime();
    const hour = time.getHours();
    const minute = time.getMinutes();
    const hourFloat = hour + minute / 60;

    let fade = 0;

    // Activate the aurora from midnight to 2am
    if (hourFloat >= 0 && hourFloat < 1) {
        fade = hourFloat;
    } else if (hourFloat >= 1 && hourFloat < 2) {
        fade = 1;
    } else if (hourFloat >= 2 && hourFloat < 3) {
        fade = 1 - (hourFloat - 2);
    }

    // Apply the fade value and update shader animation.
    if (auroraMaterial) {
        auroraMaterial.uniforms.time.value += 0.02;  
        auroraMaterial.uniforms.opacity.value = fade;
    }

    // Dynamically adjust the ambient lighting intensity and color
    if (auroraAmbientLight) {
        auroraAmbientLight.intensity = fade * 0.03;
        auroraAmbientLight.color = auroraMaterial.uniforms.color1.value.clone().lerp(
            auroraMaterial.uniforms.color2.value, 0.05
        );
    }
}
