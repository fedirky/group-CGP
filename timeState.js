let simulatedTime = new Date(); // default to current local time of the user

export function getSimulatedTime() {
    return simulatedTime;
}

export function setSimulatedTime(time) {
    simulatedTime = time;
}