export const TEXTURE_PACK_ROOT = '../resources/texturepacks/default';
export const UI_TEXTURE_PACK_ROOT = './resources/texturepacks/default';

const BLOCKS_ROOT = 'blocks';
const LIQUIDS_ROOT = 'liquids';

export const BLOCKS = {
    stone: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        atlas: true,
        placeable: true,
        textures: { color: 'stone.png', bump: 'stone_bump.png' },
    },
    dirt: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        atlas: true,
        placeable: true,
        textures: { color: 'dirt.png', bump: 'dirt_bump.png' },
    },
    grass: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        atlas: true,
        placeable: true,
        textures: { color: 'grass_side.png', topColor: 'grass.png', bump: 'dirt_bump.png' },
    },
    sand: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        atlas: true,
        placeable: true,
        textures: { color: 'sand.png', bump: 'sand_bump.png' },
    },
    oak_log: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        atlas: true,
        placeable: true,
        textures: { color: 'oak_log.png', bump: 'oak_log_bump.png' },
    },
    oak_leaves: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        atlas: true,
        placeable: true,
        textures: { color: 'oak_leaves.png', bump: 'oak_leaves_bump.png' },
    },
    skyroot_log: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        atlas: true,
        placeable: true,
        textures: { color: 'skyroot_log.png', bump: 'skyroot_log_bump.png' },
    },
    skyroot_leaves: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        atlas: true,
        placeable: true,
        textures: { color: 'skyroot_leaves.png', bump: 'skyroot_leaves_bump.png' },
    },
    oak_gold_log: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        placeable: true,
        material: {
            type: 'phong',
            emissive: 0xA48601,
            emissiveIntensity: 0.45,
        },
        textures: {
            color: 'oak_gold_log.png',
            bump: 'oak_gold_log_bump.png',
            emissive: 'oak_gold_log_emissive.png',
        },
    },
    oak_gold_leaves: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        placeable: true,
        material: {
            type: 'phong',
            emissive: 0xA48601,
            emissiveIntensity: 0.45,
        },
        textures: {
            color: 'oak_gold_leaves.png',
            bump: 'oak_gold_leaves_bump.png',
            emissive: 'oak_gold_leaves_emissive.png',
        },
    },
    skyroot_leaves_berry_glowing_2D3D59_3: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        placeable: true,
        material: {
            type: 'phong',
            emissive: 0x2D3D59,
            emissiveIntensity: 0.35,
        },
        light: {
            color: '#506ea2',
            radius: 5,
        },
        textures: {
            color: 'skyroot_leaves_berry_glowing_2D3D59_3.png',
            bump: 'skyroot_leaves_berry_glowing_2D3D59_3_bump.png',
            emissive: 'skyroot_leaves_berry_glowing_2D3D59_3_emissive.png',
        },
    },
    ice: {
        solid: true,
        renderType: 'cube',
        collidable: true,
        breakable: true,
        occludesAO: true,
        blockLightTransparent: false,
        placeable: true,
        material: {
            type: 'phong',
            shininess: 10,
            specular: 0x99ccff,
        },
        textures: { color: 'ice.png', bump: 'ice_bump.png', emissive: 'ice_emissive.png' },
    },
    water: {
        solid: true,
        renderType: 'water',
        collidable: true,
        breakable: false,
        occludesAO: false,
        blockLightTransparent: true,
        transparent: true,
        liquid: true,
        textures: { color: `${LIQUIDS_ROOT}/water.png`, bump: 'no_bump.png', emissive: 'no_bump.png' },
    },
    // Plant selection-box heights are derived from each texture's alpha at load
    // (initPlantSelectionHeights) so the raycast hitbox matches the real art.
    flower_1: smallPlantBlock('flower_1'),
    flower_2: smallPlantBlock('flower_2'),
    flower_3: smallPlantBlock('flower_3'),
    flower_4: smallPlantBlock('flower_4'),
    flower_5: smallPlantBlock('flower_5'),
    flower_6: smallPlantBlock('flower_6'),
    flower_7: smallPlantBlock('flower_7'),
    flower_grass: smallPlantBlock('flower_grass'),
    flower_lily: smallPlantBlock('flower_lily', { renderType: 'flat' }),
    flower_sugar_cane: smallPlantBlock('flower_sugar_cane'),
    flower_glowberries: smallPlantBlock('flower_glowberries', {
        material: {
            type: 'standard',
            emissive: 0xEA8931,
            emissiveIntensity: 0.75,
        },
        textures: {
            color: 'flowers/flower_glowberries.png',
            emissive: 'flowers/flower_glowberries_emissive.png',
        },
    }),
};

export const PLACEABLE_BLOCKS = [
    'grass', 'dirt', 'stone', 'sand',
    'oak_log', 'oak_leaves', 'oak_gold_log', 'oak_gold_leaves',
    'skyroot_log', 'skyroot_leaves', 'skyroot_leaves_berry_glowing_2D3D59_3', 'ice',
];

export const ATLAS_BLOCKS = Object.entries(BLOCKS)
    .filter(([, block]) => block.atlas)
    .flatMap(([key, block]) => {
        const entries = [{
            key,
            color: blockTexturePath(key, 'color'),
            bump: blockTexturePath(key, 'bump'),
        }];

        if (block.textures.topColor) {
            entries.push({
                key: `${key}_top`,
                color: blockTexturePath(key, 'topColor'),
                bump: blockTexturePath(key, 'bump'),
            });
        }

        return entries;
    });

export function getBlockDefinition(block) {
    return BLOCKS[block] || null;
}

export function getBlockLight(block) {
    return BLOCKS[block]?.light || null;
}

function smallPlantBlock(key, overrides = {}) {
    return {
        solid: false,
        renderType: 'cross',
        collidable: false,
        breakable: true,
        replaceable: true,
        occludesAO: false,
        blockLightTransparent: true,
        transparent: true,
        textures: { color: `flowers/${key}.png` },
        ...overrides,
    };
}

// Selection-box heights derived from texture alpha at load (0..1 of a cell).
const _selectionHeight = {};

/** Store a measured plant height (called by initPlantSelectionHeights). */
export function setSelectionHeight(block, height) {
    _selectionHeight[block] = height;
}

/**
 * Sub-cell ray-selection box for a block, or null for a full 1x1x1 cube.
 * Plants (cross/flat) get a short box matching their texture so you can't
 * target/break/place through the empty space above them.
 */
export function getSelectionBox(block) {
    const def = BLOCKS[block];
    if (!def) return null;
    if (def.renderType === 'flat') return { height: 0.12, halfWidth: 0.5 }; // lily lies on the ground
    if (def.renderType === 'cross') {
        return { height: _selectionHeight[block] ?? 0.8, halfWidth: 0.5 };
    }
    return null;
}

/**
 * Measure each cross-plant texture's opaque height from its alpha channel and
 * store it, so the raycast hitbox matches the art automatically (no magic
 * numbers, self-updating if textures change). Runs once at startup.
 */
export function initPlantSelectionHeights() {
    for (const [key, def] of Object.entries(BLOCKS)) {
        if (def.renderType !== 'cross') continue;
        const img = new Image();
        img.onload = () => {
            try {
                const w = img.width, h = img.height;
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, w, h).data;
                // Topmost opaque row (row 0 = top of image = top of the quad).
                let top = h;
                for (let y = 0; y < h && top === h; y++) {
                    for (let x = 0; x < w; x++) {
                        if (data[(y * w + x) * 4 + 3] > 16) { top = y; break; }
                    }
                }
                setSelectionHeight(key, Math.max(0.1, 1 - top / h));
            } catch (e) {
                /* tainted canvas / decode error -> keep the 0.8 default */
            }
        };
        img.src = blockTexturePath(key, 'color');
    }
}

export function isAirBlock(block) {
    return !block || block === 'air';
}

export function getRenderType(block) {
    if (isAirBlock(block)) return 'air';
    return BLOCKS[block]?.renderType || 'cube';
}

export function isCollidableBlock(block) {
    if (isAirBlock(block)) return false;
    const def = BLOCKS[block];
    return def ? !!def.collidable : true;
}

export function isBreakableBlock(block) {
    if (isAirBlock(block)) return false;
    const def = BLOCKS[block];
    return def ? !!def.breakable : true;
}

export function isReplaceableBlock(block) {
    if (isAirBlock(block)) return true;
    const def = BLOCKS[block];
    return def ? !!def.replaceable : false;
}

export function occludesAO(block) {
    if (isAirBlock(block)) return false;
    const def = BLOCKS[block];
    return def ? !!def.occludesAO : true;
}

export function isTransparentForBlockLight(block) {
    if (isAirBlock(block)) return true;
    const def = BLOCKS[block];
    return def ? !!def.blockLightTransparent : false;
}

export function exposesNeighborFace(block) {
    const renderType = getRenderType(block);
    return renderType === 'air' || renderType === 'cross' || renderType === 'flat';
}

export function isLiquidBlock(block) {
    return !!BLOCKS[block]?.liquid;
}

export function blockTexturePath(block, texture = 'color', root = TEXTURE_PACK_ROOT) {
    const def = BLOCKS[block];
    const file = def?.textures?.[texture] || `${block}${texture === 'bump' ? '_bump' : texture === 'emissive' ? '_emissive' : ''}.png`;
    if (file.includes('/')) return `${root}/${file}`;
    return `${root}/${BLOCKS_ROOT}/${file}`;
}

export function blockIconPath(block) {
    return blockTexturePath(block, 'color', UI_TEXTURE_PACK_ROOT);
}
