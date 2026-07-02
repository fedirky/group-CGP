import * as THREE from '../three.r168.module.js';

import { aoUniforms, injectBlockLight } from '../voxelAO.js';
import { ATLAS_BLOCKS } from '../data/blocks.js';

/*
 * Texture-array atlas for the common opaque Lambert blocks.
 *
 * Instead of one material (and therefore one draw call) per block type per
 * chunk, every atlased block shares ONE material whose colour/bump come from a
 * sampler2DArray indexed by a per-vertex `layer`. A whole chunk's opaque blocks
 * then collapse into a single mesh / draw call.
 *
 * A 2D texture array (not a packed atlas) is used so mipmaps don't bleed between
 * neighbouring tiles. Special blocks (ice/gold/berry = Phong, water = video) are
 * NOT atlased and keep their own materials in the renderer.
 */

const TILE = 16; // all default-pack block textures are 16x16

const LAYER_OF = new Map(ATLAS_BLOCKS.map((b, i) => [b.key, i]));

let atlasMaterial = null;
const whiteTextureDebugUniform = { value: 0.0 };

/** Layer index for a material key, or -1 if the block isn't atlased. */
export function getLayer(materialKey) {
    const l = LAYER_OF.get(materialKey);
    return l === undefined ? -1 : l;
}

/** The shared atlas material (null until buildBlockAtlas() resolves). */
export function getAtlasMaterial() {
    return atlasMaterial;
}


export function setAtlasWhiteTextureDebug(enabled) {
    whiteTextureDebugUniform.value = enabled ? 1.0 : 0.0;
}


// Load an image's RGBA pixels into a TILExTILE buffer (top-row first), or null.
function loadTile(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = TILE;
            c.height = TILE;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, TILE, TILE);
            resolve(ctx.getImageData(0, 0, TILE, TILE).data);
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

// Copy a tile into a layer of the array buffer, flipping vertically so it
// matches three's default flipY=true orientation. Fills with `fallback` if null.
function copyLayer(src, dst, layer, fallback) {
    const base = layer * TILE * TILE * 4;
    for (let y = 0; y < TILE; y++) {
        const srcRow = (TILE - 1 - y) * TILE * 4;
        for (let x = 0; x < TILE; x++) {
            const di = base + (y * TILE + x) * 4;
            if (src) {
                const si = srcRow + x * 4;
                dst[di] = src[si]; dst[di + 1] = src[si + 1];
                dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
            } else {
                dst[di] = fallback[0]; dst[di + 1] = fallback[1];
                dst[di + 2] = fallback[2]; dst[di + 3] = fallback[3];
            }
        }
    }
}

function makeArrayTexture(data, mip) {
    const tex = new THREE.DataArrayTexture(data, TILE, TILE, ATLAS_BLOCKS.length);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = mip ? THREE.LinearMipmapNearestFilter : THREE.NearestFilter;
    tex.generateMipmaps = mip;
    tex.anisotropy = 8;
    tex.colorSpace = THREE.NoColorSpace; // we decode sRGB manually in the shader
    tex.needsUpdate = true;
    return tex;
}


// Build the Lambert-based atlas material: array colour + array bump + AO,
// keeping three's lighting / fog intact via onBeforeCompile.
function makeAtlasMaterial(colorArray, bumpArray) {
    const dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    dummy.needsUpdate = true;

    const material = new THREE.MeshLambertMaterial({
        map: dummy,        // enables USE_MAP -> vMapUv plumbing (sampling is overridden)
        bumpMap: dummy,    // enables USE_BUMPMAP -> vBumpMapUv plumbing
        bumpScale: 0.8,
        side: THREE.FrontSide,
    });

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uAtlas = { value: colorArray };
        shader.uniforms.uBumpAtlas = { value: bumpArray };
        shader.uniforms.uAOEnabled = aoUniforms.uAOEnabled;
        shader.uniforms.uWhiteTextureDebug = whiteTextureDebugUniform;

        shader.vertexShader = `
            attribute float layer;
            attribute float aoShade;
            varying float vLayer;
            varying float vAoShade;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vLayer = layer;
            vAoShade = aoShade;`
        );

        shader.fragmentShader = `
            precision highp sampler2DArray;
            uniform sampler2DArray uAtlas;
            uniform sampler2DArray uBumpAtlas;
            uniform float uAOEnabled;
            uniform float uWhiteTextureDebug;
            varying float vLayer;
            varying float vAoShade;
        ` + shader.fragmentShader;

        // Colour from the array (manual sRGB -> linear since this isn't the `map` slot).
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `vec4 sampledDiffuseColor = texture( uAtlas, vec3( vMapUv, vLayer ) );
            sampledDiffuseColor.rgb = pow( sampledDiffuseColor.rgb, vec3( 2.2 ) );
            sampledDiffuseColor = mix(sampledDiffuseColor, vec4(1.0), uWhiteTextureDebug);
            diffuseColor *= sampledDiffuseColor;`
        );

        // Bump from the array: reuse three's own chunk, swapping the sampler.
        const bumpPars = THREE.ShaderChunk.bumpmap_pars_fragment.replace(
            /texture2D\( bumpMap, ([^)]*) \)/g,
            'texture( uBumpAtlas, vec3( $1, vLayer ) )'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <bumpmap_pars_fragment>',
            bumpPars
        );

        // Ambient occlusion (toggle via shared uniform).
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            diffuseColor.rgb *= mix(1.0, vAoShade, uAOEnabled);`
        );

        injectBlockLight(shader); // baked berry light
    };

    return material;
}


// Load every atlas texture, build the arrays and the shared material.
export async function buildBlockAtlas() {
    const n = ATLAS_BLOCKS.length;
    const colorData = new Uint8Array(TILE * TILE * 4 * n);
    const bumpData = new Uint8Array(TILE * TILE * 4 * n);

    const colorTiles = await Promise.all(ATLAS_BLOCKS.map((b) => loadTile(b.color)));
    const bumpTiles = await Promise.all(ATLAS_BLOCKS.map((b) => loadTile(b.bump)));

    for (let l = 0; l < n; l++) {
        copyLayer(colorTiles[l], colorData, l, [255, 0, 255, 255]); // magenta = missing
        copyLayer(bumpTiles[l], bumpData, l, [128, 128, 128, 255]); // neutral (flat) bump
    }

    const colorArray = makeArrayTexture(colorData, true);
    const bumpArray = makeArrayTexture(bumpData, false);

    atlasMaterial = makeAtlasMaterial(colorArray, bumpArray);
    return atlasMaterial;
}
