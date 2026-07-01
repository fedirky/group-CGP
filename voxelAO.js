import * as THREE from './three.r168.module.js';

/*
 * Per-vertex ambient occlusion for our voxel world.
 *
 * This is the classic "Ambient Occlusion for Minecraft-like worlds" technique
 * described by Mikola Lysenko (0fps.net, 2013-07-03) and reproduced in many
 * voxel engines (Arlorean/Voxels.Core, mikolalysenko/vertex-ao, the Spacefarer
 * tutorial, etc.).
 *
 * For every corner of a face we look at the three voxels that touch that corner
 * on the OUTSIDE of the face:
 *
 *      corner +----+ side2
 *             |    |
 *      side1  +----+ (the face vertex sits here)
 *
 * and reduce the brightness based on how many of them are solid:
 *
 *      vertexAO(side1, side2, corner):
 *          if (side1 && side2) return 0;          // wedged into an inner edge
 *          return 3 - (side1 + side2 + corner);   // 3 = open, 0 = fully buried
 *
 * The renderer bakes faces into a merged per-chunk BufferGeometry, so each face
 * vertex carries its corner value in a per-vertex `aoShade` float that the GPU
 * interpolates across the face. The article's "anisotropy" problem (shading
 * depending on which diagonal a quad is split along) is handled at bake time by
 * flipping the triangulation toward the brighter diagonal.
 */

// Brightness multiplier for each AO level (0 = darkest, 3 = unoccluded).
// Tweak these to taste; the gap between 3 and 0 controls how strong the
// contact shadows look.
export const AO_BRIGHTNESS = [0.28, 0.48, 0.72, 1.0];

// Reused scratch buffer so computeFaceAO doesn't allocate per face.
const AO_SCRATCH = new Float32Array(4);

// Shared uniform across every patched material, so toggling it once affects
// the whole world. 1.0 = AO on, 0.0 = AO off.
export const aoUniforms = { uAOEnabled: { value: 1.0 } };

/** Enable or disable ambient occlusion at runtime. */
export function setAOEnabled(enabled) {
    aoUniforms.uAOEnabled.value = enabled ? 1.0 : 0.0;
}

/** Flip AO on/off and return the new state. */
export function toggleAO() {
    const next = aoUniforms.uAOEnabled.value > 0.5 ? 0.0 : 1.0;
    aoUniforms.uAOEnabled.value = next;
    return next > 0.5;
}

// PlaneGeometry(1,1) vertex order (three.js): top-left, top-right,
// bottom-left, bottom-right -- in local XY space these are the (lx, ly) signs.
const CORNERS = [
    [-1, 1],  // v0 top-left      -> uv (0,1)
    [1, 1],   // v1 top-right     -> uv (1,1)
    [-1, -1], // v2 bottom-left   -> uv (0,0)
    [1, -1],  // v3 bottom-right  -> uv (1,0)
];

// Face definitions must match the `neighbors` array used by the renderer so the
// rotation we bake the offsets from is the same rotation applied to the instance.
const FACES = {
    left:  { offset: [-1, 0, 0], rotation: [0, -Math.PI / 2, 0] },
    right: { offset: [1, 0, 0],  rotation: [0, Math.PI / 2, 0] },
    down:  { offset: [0, -1, 0], rotation: [Math.PI / 2, 0, 0] },
    up:    { offset: [0, 1, 0],  rotation: [-Math.PI / 2, 0, 0] },
    back:  { offset: [0, 0, -1], rotation: [0, Math.PI, 0] },
    front: { offset: [0, 0, 1],  rotation: [0, 0, 0] },
};

// Precompute, for every face direction and every corner, the integer offsets
// (relative to the owning block) of the side1, side2 and corner voxels.
const AO_OFFSETS = {};

(function buildOffsets() {
    const mat = new THREE.Matrix4();
    const vec = new THREE.Vector3();

    const rotated = (m, x, y, z) => {
        vec.set(x, y, z).applyMatrix4(m);
        return [Math.round(vec.x), Math.round(vec.y), Math.round(vec.z)];
    };

    for (const dir in FACES) {
        const { offset: n, rotation } = FACES[dir];
        mat.makeRotationFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2]));

        AO_OFFSETS[dir] = CORNERS.map(([sx, sy]) => {
            // The two tangent directions at this corner, in world space.
            const u = rotated(mat, sx, 0, 0);
            const v = rotated(mat, 0, sy, 0);
            return {
                s1: [n[0] + u[0], n[1] + u[1], n[2] + u[2]],
                s2: [n[0] + v[0], n[1] + v[1], n[2] + v[2]],
                c:  [n[0] + u[0] + v[0], n[1] + u[1] + v[1], n[2] + u[2] + v[2]],
            };
        });
    }
})();

/**
 * Compute the four corner brightness values for one face.
 *
 * `isOcc(x, y, z)` must return 1 if the voxel at those coordinates occludes
 * ambient light (a solid cube) and 0 otherwise. The caller supplies it so AO
 * can be sampled straight from a chunk's local array (no per-sample getChunk).
 *
 * Returns a Float32Array(4) (reused!) in PlaneGeometry vertex order.
 */
export function computeFaceAO(direction, x, y, z, isOcc) {
    const table = AO_OFFSETS[direction];

    for (let i = 0; i < 4; i++) {
        const o = table[i];
        const s1 = isOcc(x + o.s1[0], y + o.s1[1], z + o.s1[2]);
        const s2 = isOcc(x + o.s2[0], y + o.s2[1], z + o.s2[2]);
        const c  = isOcc(x + o.c[0],  y + o.c[1],  z + o.c[2]);

        const level = (s1 && s2) ? 0 : 3 - (s1 + s2 + c);
        AO_SCRATCH[i] = AO_BRIGHTNESS[level];
    }

    return AO_SCRATCH;
}

/**
 * Inject AO into a standard three.js material. Reads a per-vertex `aoShade`
 * float (baked into the merged chunk geometry), lets the GPU interpolate it
 * across the face, and multiplies the albedo before lighting. The quad
 * triangulation is flipped at bake time to avoid the diagonal interpolation
 * artifact, so plain per-vertex interpolation is enough here.
 */
export function patchMaterialWithAO(material) {
    material.onBeforeCompile = (shader) => {
        // Share the global toggle uniform so V can switch every material at once.
        shader.uniforms.uAOEnabled = aoUniforms.uAOEnabled;

        shader.vertexShader = `
            attribute float aoShade;
            varying float vAoShade;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vAoShade = aoShade;`
        );

        shader.fragmentShader = `
            uniform float uAOEnabled;
            varying float vAoShade;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            diffuseColor.rgb *= mix(1.0, vAoShade, uAOEnabled);`
        );
    };

    return material;
}
