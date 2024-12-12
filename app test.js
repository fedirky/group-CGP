import {
    Scene,
    WebGLRenderer,
    PerspectiveCamera,
    Vector3,
    Color,
    PointLight,
    DirectionalLight,
    AmbientLight,
    Mesh,
    SphereGeometry,
    MeshStandardMaterial,
    MeshPhongMaterial,
    PlaneGeometry,
} from 'three';
import { FireFlies } from './utils/fire_fly/FireFly.ts';
import Stats from 'three/addons/libs/stats.module.js';

// Initialize scene, camera, and renderer
const scene = new Scene();
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);
camera.lookAt(new Vector3(0, 0, 0));

const renderer = new WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(new Color(0x111111)); // Background color
document.body.appendChild(renderer.domElement);

// Add floor to see the effects of lighting
const floorGeometry = new PlaneGeometry(20, 20);
const floorMaterial = new MeshStandardMaterial({ color: 0x555555 });
const floor = new Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2; // Make it horizontal
scene.add(floor);

// Add colorful spheres
const spheres = [];
const sphereColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
for (let i = 0; i < 50; i++) {
    const color = sphereColors[Math.floor(Math.random() * sphereColors.length)];
    const sphereMaterial = new MeshPhongMaterial({ color });
    const sphereGeometry = new SphereGeometry(0.5, 32, 32);
    const sphere = new Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(
        Math.random() * 18 - 9, // Random X position within platform
        Math.random() * 0.5 + 0.5, // Random Y position close to floor
        Math.random() * 18 - 9 // Random Z position within platform
    );
    scene.add(sphere);
    spheres.push(sphere);
}

// Create fireflies
const fireflies = new FireFlies(scene, {
    groupCount: 1,
    firefliesPerGroup: 500,
    groupRadius: 5,
});

// Add basic lights to the scene
const ambientLight = new AmbientLight(0xffffff, 0.1); // Ambient light for general illumination
scene.add(ambientLight);

const directionalLight = new DirectionalLight(0xffffff, 0.1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// Add multiple point lights
const pointLights = [];
const lightColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
for (let i = 0; i < 100; i++) {
    const color = lightColors[Math.floor(Math.random() * lightColors.length)];
    const pointLight = new PointLight(color, 2, 3); // Dim, small-range colorful light
    pointLight.position.set(
        Math.random() * 18 - 9, // Random X position within platform
        Math.random() * 0.5 + 0.5, // Random Y position close to floor
        Math.random() * 18 - 9 // Random Z position within platform
    );
    scene.add(pointLight);
    pointLights.push(pointLight);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Setup stats for FPS monitoring
const stats = new Stats();
stats.showPanel(0); // Show FPS
const statsContainer = document.createElement('div');
statsContainer.style.position = 'absolute';
statsContainer.style.top = '0px';
statsContainer.style.left = '0px';
document.body.appendChild(stats.dom);

// Animation loop
function animate() {
    stats.begin(); // Start measuring

    const deltaTime = 0.016; // Approximate delta time for 60 FPS
    fireflies.update(deltaTime); // Update fireflies

    // Animate spheres
    spheres.forEach((sphere, index) => {
        sphere.position.x += Math.sin(Date.now() * 0.001 + index) * 0.01;
        sphere.position.z += Math.cos(Date.now() * 0.001 + index) * 0.01;
    });

    // Animate point lights
    pointLights.forEach((light, index) => {
        light.position.x += Math.sin(Date.now() * 0.001 + index) * 0.05;
        light.position.y += Math.cos(Date.now() * 0.001 + index) * 0.02;
        light.position.z += Math.sin(Date.now() * 0.001 + index) * 0.05;
        // Constrain lights to platform boundaries
        light.position.x = Math.max(-9, Math.min(9, light.position.x));
        light.position.z = Math.max(-9, Math.min(9, light.position.z));
    });

    renderer.render(scene, camera);

    stats.end(); // End measuring

    requestAnimationFrame(animate);
}

animate();
