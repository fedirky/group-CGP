import * as THREE from './three.r168.module.js';
import { getSimulatedTime } from './timeState.js';

const fireflies = [];
const fireflyCount = 250;
const smoothFireflyCount = Math.floor(fireflyCount * 0.90);  // make some percentage of the fireflies move more smoothly
let fireflyMaterial = null;

/**
 * Uses shader-based glowing effect to create fireflies 
 */
export function createFireflies(scene) {
    fireflyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0xffcc88).multiplyScalar(2) },
            opacity: { value: 0.0 },
            time: { value: 0 }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: `
            uniform float time;
            varying vec3 vWorldPosition;
            void main() {
                vWorldPosition = position;
                gl_PointSize = 2.0 + sin(time * 2.0) * 1.5; // Using a funciton of time to adjust size of fireflies
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float opacity;
            void main() {
                float distanceToCenter = length(gl_PointCoord - vec2(0.5));
                float alpha = 1.0 - smoothstep(0.3, 0.5, distanceToCenter);
                gl_FragColor = vec4(color * opacity * 2.0, opacity * alpha);
            }
        `
    });

    const fireflyGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(fireflyCount * 3);

    for (let i = 0; i < fireflyCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 1] = Math.random() * 50 + 8;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }

    fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const fireflyMesh = new THREE.Points(fireflyGeometry, fireflyMaterial);

    scene.add(fireflyMesh);
    fireflies.push({ mesh: fireflyMesh, positions });
}

/**
 * Update fireflies visibility, motion, and glow.
 */
export function updateFireflies() {
    const time = getSimulatedTime();
    const hour = time.getHours();
    const minute = time.getMinutes();
    const hourFloat = hour + minute / 60;

    let fade = 0;

    // Fade the flies into the scene between 7pm - 8pm and fade out between 4pm t0 5pm
    if (hourFloat >= 19 && hourFloat < 20) {
        fade = (hourFloat - 19);
    } else if (hourFloat >= 20 || hourFloat < 4) {
        fade = 1;
    } else if (hourFloat >= 4 && hourFloat < 5) {
        fade = 1 - (hourFloat - 4);
    }

    const timeFactor = Date.now() * 0.001;

    // Move the fireflies around and apply fade and pulse effect.
    for (let i = 0; i < fireflies.length; i++) {
        const firefly = fireflies[i];
        firefly.mesh.material.uniforms.opacity.value = fade;
        firefly.mesh.material.uniforms.time.value = timeFactor;

        const positions = firefly.positions;
        for (let j = 0; j < positions.length; j += 3) {
            if (j / 3 < smoothFireflyCount) {
                // Smooth firefly movement with sine/cos functions
                positions[j] += Math.sin(timeFactor + j * 0.1) * 0.1;
                positions[j + 1] += Math.cos(timeFactor + j * 0.1) * 0.1;
                positions[j + 2] += Math.sin(timeFactor + j * 0.2) * 0.1;
            } else {
                // Remaining ones move randomly in the scene
                positions[j] += (Math.random() - 0.5) * 0.5;
                positions[j + 1] += (Math.random() - 0.5) * 0.5;
                positions[j + 2] += (Math.random() - 0.5) * 0.5;
            }
        }

        // Adjust shader brightness for glow effect, use sine of time to make it look like it's pulsating
        firefly.mesh.material.uniforms.color.value.setHex(0xffcc88).multiplyScalar(4 + Math.sin(timeFactor * 3) * 1.5); 
        
        firefly.mesh.geometry.attributes.position.needsUpdate = true;
    }
}
