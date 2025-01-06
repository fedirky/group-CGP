import * as THREE from './three.r168.module.js';
import { MTLLoader } from './postprocessing/MTLLoader.js';
import { OBJLoader } from './postprocessing/OBJLoader.js';
import { getSimulatedTime } from './timeState.js';
import { isSimulationPlaying } from './ui.js';


const allBalloons = [];

// Place 24 balloons randomly in the sky (there are 8 distinct types)
export function loadHotAirBalloons(scene) {
    const balloonCount = 8;
    const copyOfEach = 3

    const manager = new THREE.LoadingManager();
    const mtlLoader = new MTLLoader(manager);
    const objLoader = new OBJLoader(manager);

    for (let i = 1; i <= balloonCount; i++) {
        const mtlPath = `./balloons/hot_air_balloon_${i}.vox.mtl`;
        const objPath = `./balloons/hot_air_balloon_${i}.vox.obj`;

        mtlLoader.load(
            mtlPath,
            (materialsCreator) => {
                materialsCreator.preload();
                objLoader.setMaterials(materialsCreator);

                objLoader.load(
                    objPath,
                    (originalObj) => {
                        // Create copies for each balloon type
                        for (let copy = 0; copy < copyOfEach; copy++) {
                            const balloonClone = originalObj.clone(true);

                            // Place them randomly in the sky
                            const startPosition = new THREE.Vector3(
                                (Math.random() - 0.5) * 200, // random X
                                25 + Math.random() * 20,     // random Y
                                (Math.random() - 0.5) * 200  // random Z
                            );
                            balloonClone.position.copy(startPosition);
                            balloonClone.scale.set(2, 2, 2);
                            balloonClone.rotation.y = Math.random() * Math.PI * 2;

                            setOpacity(balloonClone, 0);

                            // Store reference for later animation
                            allBalloons.push({
                                mesh: balloonClone,
                                basePosition: startPosition.clone(),  
                                lastUpdateTime: performance.now(), 
                                lastSimulatedMinute: getSimulatedTime().getMinutes()      
                            });

                            scene.add(balloonClone);
                        }

                        console.log(`Balloon ${i} loaded and duplicated 4 times`);
                    },
                    undefined,
                    (error) => {
                        console.error(`Error loading balloon ${i} OBJ:`, error);
                    }
                );
            },
            undefined,
            (error) => {
                console.error(`Error loading balloon ${i} MTL:`, error);
            }
        );
    }
}


// move balloons to the right and slightly up or down each minute
export function updateHotAirBalloons() {
    const time = getSimulatedTime();
    const hour = time.getHours();
    const minute = time.getMinutes();
    const hourFloat = hour + minute / 60;
    
    const currentTime = performance.now();
    const playing = isSimulationPlaying();

    let fade = 0;

    if (hour === 9 && minute < 5) {
        fade = minute / 5; //fade in the first 5 minutes after 9
    }
    else if (hourFloat >= 9 && hourFloat < 19 - (5 / 60)) {
        fade = 1;
    }
    else if (hourFloat >= 19 - (5 / 60) && hourFloat < 19) {  
        const remainingMinutes = (19 - hourFloat) * 60;  
        fade = remainingMinutes / 5;  // fade out in the last 5 minutes before 7 PM
    } 
    else {
        fade = 0;
    }

    // reset the positions of the hot air balloons every 9am
    if (hourFloat >= 9 && hourFloat < 9.02) { 
        for (const b of allBalloons) {
            b.mesh.position.copy(b.basePosition);
        }
    }

    // Move the balloons
    for (const b of allBalloons) {
        setOpacity(b.mesh, fade);

        if (playing) { // simulation in progess so change movement speed.
            if (b.lastSimulatedMinute !== minute) {
                b.lastSimulatedMinute = minute;
                b.mesh.position.x += 0.05; //move to the right

                // Randomly move slightly up or down every minute (set threshold less then 0.5 to favour up movement)
                if (Math.random() > 0.3) {
                    b.mesh.position.y += 0.015; 
                } else {
                    b.mesh.position.y -= 0.01;
                }
            }
        } else {
            // Simulation is reset so move balloons continuously very smoothly
            const deltaTime = (currentTime - b.lastUpdateTime) / 1000;
            b.lastUpdateTime = currentTime;

            b.mesh.position.x += 0.3 * deltaTime;
            b.mesh.position.y += (Math.random() > 0.3 ? 0.01 : -0.01) * deltaTime;
        }
    }
}

// Set material opacity on the hot air balloons
function setOpacity(obj, fade) {
    obj.traverse((child) => {
        if (child.isMesh && child.material) {
            child.material.transparent = true;
            child.material.opacity = fade;
            child.visible = (fade > 0.001);
        }
    });
}
