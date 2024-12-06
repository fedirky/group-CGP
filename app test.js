import { Scene, WebGLRenderer, PerspectiveCamera, Vector3, Color } from 'three';
import { FireFlyMaterial } from './fire_fly/FireFlyMaterial.ts';
import { FireFlies } from './fire_fly/FireFly.ts';

// Initialize scene, camera, and renderer
const scene = new Scene();
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 5); // Set camera position to see the fireflies
camera.lookAt(new Vector3(0, 0, 0)); // Make the camera look at the center of the scene

const renderer = new WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(new Color(0x333333)); // Set the background color to dark gray
document.body.appendChild(renderer.domElement);

// Create fireflies
const fireflies = new FireFlies(scene, {
    groupCount: 1,
    firefliesPerGroup: 500,
    groupRadius: 5,
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; // Update camera aspect ratio
    camera.updateProjectionMatrix(); // Update projection matrix
    renderer.setSize(window.innerWidth, window.innerHeight); // Update renderer size
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = 0.016; // Approximate delta time for 60 FPS
    fireflies.update(deltaTime); // Update fireflies
    renderer.render(scene, camera); // Render the scene from the camera's perspective
}
animate();
