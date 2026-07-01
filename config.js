export const WORLD_CONFIG = {
    chunkSize: 16,
    worldHeightChunks: 2,
};

export const WATER_CONFIG = {
    level: 7,
    generationLevel: 8,
    maxDepth: 5,
    floodCap: 4096,
    pathBlurRadius: 2,
    pathBlurFalloff: 0.45,
};

export const RENDER_CONFIG = {
    defaultRenderDistance: 6,
    buildBudget: 2,
    maxActiveLights: 6,
};

export const PLAYER_CONFIG = {
    startPosition: [0, 16, 0],
    movementSpeed: 16,
    lookSpeed: 0.0022,
    breakReach: 6,
    defaultLookSpeed: 0.002,
    defaultMovementSpeed: 10,
    sprintMultiplier: 1.8,
    verticalSpeedMultiplier: 0.85,
    walkSpeed: 4.3,
    walkSprintMultiplier: 1.35,
    gravity: 26,
    jumpHeight: 1.3,
    playerHeight: 1.7,
    eyeHeight: 1.5,
    playerHalfWidth: 0.3,
    maxFallSpeed: 18,
};

export const UI_CONFIG = {
    fogChunkDistance: 8,
};
