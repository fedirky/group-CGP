import { getSimulatedTime, setSimulatedTime } from './timeState.js';
import { updateLighting } from'./dayNightCycle.js';
import { scene } from'./app.js';

let isPlaying = false;
let simulationSpeed = 100;
let intervalId = null;
let isSimulationInitialized = false;

let originalSimulatedMinutes = null;
let initialDialAngleAtDragStart = null;

// Exporting to use in app.js
export function isSimulationPlaying() {
    return isSimulationInitialized;
}

// DOM Elements
const playPauseButton = document.getElementById('play-pause-button');
const resetButton = document.getElementById('reset-button');
const speedSlider = document.getElementById('speed-slider');
const timeStringEl = document.getElementById('time-string');
const timeLabelEl = document.getElementById('time-label');
const dialHandle = document.getElementById('dial-handle');

// For dial dragging
let isDraggingDial = false;
let dialCenter = { x: 0, y: 0 };
let dialAngle = 0; // angle is in degrees
let prevAngle = null; 

// Initialize UI after DOM load to the current time
document.addEventListener('DOMContentLoaded', () => {
    const rect = dialHandle.parentNode.getBoundingClientRect();
    dialCenter.x = rect.left + rect.width / 2;
    dialCenter.y = rect.top + rect.height / 2;

    const simulatedTime = getSimulatedTime();
    const totalMinutes = simulatedTime .getHours() * 60 + simulatedTime .getMinutes();
    dialAngle = (totalMinutes / 1440) * 720;

    updateUI(simulatedTime);
    updateLighting(scene);
});

// Event Listeners
playPauseButton.addEventListener('click', togglePlayPause);
resetButton.addEventListener('click', resetSimulation);
speedSlider.addEventListener('input', changeSpeed);

dialHandle.addEventListener('mousedown', startDialDrag);
document.addEventListener('mousemove', dragDial);
document.addEventListener('mouseup', endDialDrag);

// Functions
function togglePlayPause() {
    if (!isPlaying) {
        startSimulation();
        console.log("Play")
    } else {
        pauseSimulation();
        console.log("Pause")
    }
}

function startSimulation() {
    if (!isSimulationInitialized) {
        const localTime = new Date();
        setSimulatedTime(localTime);
        isSimulationInitialized = true;
    }

    isPlaying = true;
    playPauseButton.classList.remove('play');
    playPauseButton.classList.add('pause');
    if (!intervalId) {
        intervalId = setInterval(updateSimulatedTime, 1000 / simulationSpeed);
    }
}

function pauseSimulation() {
    isPlaying = false;
    playPauseButton.classList.remove('pause');
    playPauseButton.classList.add('play');
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

function resetSimulation() {
    // Reset to actual local time
    pauseSimulation();
    setSimulatedTime(new Date());
    isSimulationInitialized = false;

    const simulatedTime = getSimulatedTime();
    const totalMinutes = simulatedTime .getHours() * 60 + simulatedTime .getMinutes();
    dialAngle = (totalMinutes / 1440) * 720;

    // updateDialPositionFromAngle();
    updateUI(simulatedTime);
    updateLighting(scene, simulatedTime);

    playPauseButton.classList.remove('pause');
    playPauseButton.classList.add('play');
}


function changeSpeed() {
    simulationSpeed = parseFloat(speedSlider.value);
    if (isPlaying) {
        // Recreate interval with new speed
        clearInterval(intervalId);
        intervalId = setInterval(updateSimulatedTime, 1000 / simulationSpeed);
    }
}

function updateSimulatedTime() {
    const simulatedTime = getSimulatedTime();
    simulatedTime.setMinutes(simulatedTime.getMinutes() + 1); // Increase time by 1 minute per tick
    setSimulatedTime(simulatedTime);
    updateLighting(scene);
    updateUI(simulatedTime);
}

// Updates the displayed time and label
export function updateUI(time) {
    const hours = String(time.getHours()).padStart(2, '0');
    const mins = String(time.getMinutes()).padStart(2, '0');
    timeStringEl.textContent = `${hours}:${mins}`;

    const label = getTimeLabel(time.getHours());
    timeLabelEl.textContent = label;

     // Only recalc dialAngle if not dragging
    if (!isDraggingDial) {
        const totalMinutes = time.getHours() * 60 + time.getMinutes();
        dialAngle = (totalMinutes / 1440) * 720;
    }

    updateDialPositionFromAngle();
}


// Return the label for a given hour
function getTimeLabel(hour) {
    if (hour >= 5 && hour < 7) return "Dawn";
    if (hour >= 7 && hour < 12) return "Morning";
    if (hour >= 12 && hour < 16) return "Afternoon";
    if (hour >= 16 && hour < 19) return "Dusk";
    if (hour >= 19 && hour < 22) return "Evening";
    return "Night";
}

function updateDialPositionFromAngle() {
    const normalizedAngle = dialAngle % 360;
    dialHandle.style.transform = `translate(-50%, -100%) rotate(${normalizedAngle}deg)`;
}

function startDialDrag(e) {
    isDraggingDial = true;
    e.preventDefault();
    prevAngle = dialAngle;

    const simulatedTime = getSimulatedTime();
    originalSimulatedMinutes = simulatedTime.getHours() * 60 + simulatedTime.getMinutes();
    initialDialAngleAtDragStart = dialAngle;
}

function dragDial(e) {
    if (!isDraggingDial) return;
    isSimulationInitialized = true;

    const dx = e.clientX - dialCenter.x;
    const dy = e.clientY - dialCenter.y;
    const angleRad = Math.atan2(dx, -dy);
    let currentAngleDeg = angleRad * (180 / Math.PI);
    if (currentAngleDeg < 0) currentAngleDeg += 360;

    if (prevAngle !== null) {
        const prevMod = prevAngle % 360;
        const diff = currentAngleDeg - prevMod;
        if (diff > 180) {
            dialAngle -= (360 - diff);
        } else if (diff < -180) {
            dialAngle += (360 + diff);
        } else {
            dialAngle += diff;
        }
    } else {
        dialAngle = currentAngleDeg;
    }

    prevAngle = dialAngle;
    updateDialPositionFromAngle();
    updateTimeFromAngle();
}

function endDialDrag(e) {
    isDraggingDial = false;
}

function updateTimeFromAngle() {
    let newTotalMinutes = (dialAngle / 720) * 1440;

    if (newTotalMinutes < 0) {
        newTotalMinutes = 1440 + (newTotalMinutes % 1440);
    } else {
        newTotalMinutes = newTotalMinutes % 1440;
    }

    let initialTotalMinutesAtDragStart = (initialDialAngleAtDragStart / 720) * 1440;
    if (initialTotalMinutesAtDragStart < 0) {
        initialTotalMinutesAtDragStart = 1440 + (initialTotalMinutesAtDragStart % 1440);
    } else {
        initialTotalMinutesAtDragStart = initialTotalMinutesAtDragStart % 1440;
    }

    const minuteDiff = newTotalMinutes - initialTotalMinutesAtDragStart;

    let finalMinutes = originalSimulatedMinutes + minuteDiff;

    if (finalMinutes < 0) {
        finalMinutes = 1440 + (finalMinutes % 1440);
    } else {
        finalMinutes = finalMinutes % 1440;
    }

    const h = Math.floor(finalMinutes / 60);
    const m = Math.floor(finalMinutes % 60);

    const simulatedTime = getSimulatedTime();
    simulatedTime.setHours(h);
    simulatedTime.setMinutes(m);

    updateLighting(scene);
    updateUI(simulatedTime);
}