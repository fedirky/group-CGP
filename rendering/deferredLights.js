import * as THREE from '../three.r168.module.js';
import { Pass, FullScreenQuad } from '../postprocessing/Pass.js';
import { RENDER_CONFIG } from '../config.js';
import { albedoUniforms } from '../voxelAO.js';

/*
 * Deferred point-light volumes — the "universal light source" the glowing berries
 * (and anything else) use.
 *
 * Instead of adding N THREE.PointLights to the forward scene and toggling the
 * nearest few visible each frame (which pops and still costs every chunk fragment),
 * ALL point lights live as instances of one sphere mesh. Each frame we:
 *   1) render the beauty scene into a target that keeps its DepthTexture,
 *   2) render every light sphere additively into a light buffer — the fragment
 *      shader reconstructs the world position behind it from that depth, derives
 *      the surface normal from screen-space derivatives, and adds the light's
 *      contribution, discarding anything outside the light radius,
 *   3) composite  beauty + beauty * light.
 *
 * Cost is proportional to the screen area the light spheres cover, so hundreds of
 * small berry lights are cheap and never pop. Nothing in the forward pipeline
 * (atlas, AO, water, flowers, day-night) is touched.
 */

// One dedicated scene, rendered only in the light pass.
const lightScene = new THREE.Scene();

// Unit sphere (radius 1); the vertex shader scales it by each light's radius.
const _sphere = new THREE.IcosahedronGeometry(1, 1);

let capacity = Math.max(64, RENDER_CONFIG.lightCapacity || 512);
let count = 0;

let geometry, mesh;
let posArr, colArr, intArr, radArr;         // backing typed arrays
let posAttr, colAttr, intAttr, radAttr;     // instanced attributes
const handles = [];                         // handles[slot] -> handle object

const _color = new THREE.Color();

const volumeMaterial = new THREE.ShaderMaterial({
    uniforms: {
        uDepth: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uProjInverse: { value: new THREE.Matrix4() },
        uViewInverse: { value: new THREE.Matrix4() },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.BackSide, // keep coverage even when the camera is inside a volume
    vertexShader: /* glsl */`
        attribute vec3 aLightPos;
        attribute vec3 aLightColor;
        attribute float aLightIntensity;
        attribute float aLightRadius;

        varying vec3 vLightPos;
        varying vec3 vColor;
        varying float vIntensity;
        varying float vRadius;

        void main() {
            vLightPos = aLightPos;
            vColor = aLightColor;
            vIntensity = aLightIntensity;
            vRadius = aLightRadius;

            vec3 world = aLightPos + position * aLightRadius;
            gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D uDepth;
        uniform vec2 uResolution;
        uniform mat4 uProjInverse;
        uniform mat4 uViewInverse;

        varying vec3 vLightPos;
        varying vec3 vColor;
        varying float vIntensity;
        varying float vRadius;

        void main() {
            vec2 uv = gl_FragCoord.xy / uResolution;
            float d = texture2D(uDepth, uv).x;      // non-linear window depth [0,1]
            if (d >= 1.0) discard;                  // sky / cleared depth: no surface

            // Reconstruct the world position of the surface behind this fragment.
            vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
            vec4 view = uProjInverse * ndc;
            view /= view.w;
            vec3 P = (uViewInverse * view).xyz;

            float dist = distance(P, vLightPos);
            if (dist > vRadius) discard;            // outside the light volume

            // Soft radial falloff (no normal needed — avoids derivative issues and
            // self-shadowing of the emitting block's own faces).
            float att = clamp(1.0 - dist / vRadius, 0.0, 1.0);
            att *= att;                             // smooth quadratic falloff

            gl_FragColor = vec4(vColor * (vIntensity * att), 1.0);
        }
    `,
});

function buildInstances(cap) {
    const nPos = new Float32Array(cap * 3);
    const nCol = new Float32Array(cap * 3);
    const nInt = new Float32Array(cap);
    const nRad = new Float32Array(cap);

    if (posArr) {
        nPos.set(posArr.subarray(0, count * 3));
        nCol.set(colArr.subarray(0, count * 3));
        nInt.set(intArr.subarray(0, count));
        nRad.set(radArr.subarray(0, count));
    }

    posArr = nPos; colArr = nCol; intArr = nInt; radArr = nRad;

    posAttr = new THREE.InstancedBufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage);
    colAttr = new THREE.InstancedBufferAttribute(colArr, 3).setUsage(THREE.DynamicDrawUsage);
    intAttr = new THREE.InstancedBufferAttribute(intArr, 1).setUsage(THREE.DynamicDrawUsage);
    radAttr = new THREE.InstancedBufferAttribute(radArr, 1).setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute('aLightPos', posAttr);
    geometry.setAttribute('aLightColor', colAttr);
    geometry.setAttribute('aLightIntensity', intAttr);
    geometry.setAttribute('aLightRadius', radAttr);
}

(function init() {
    geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', _sphere.attributes.position);
    if (_sphere.index) geometry.setIndex(_sphere.index);
    buildInstances(capacity);
    geometry.instanceCount = 0;

    mesh = new THREE.Mesh(geometry, volumeMaterial);
    mesh.frustumCulled = false; // volumes can straddle the camera; never cull
    lightScene.add(mesh);
})();

function grow() {
    capacity *= 2;
    buildInstances(capacity);
}

function markDirty() {
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    intAttr.needsUpdate = true;
    radAttr.needsUpdate = true;
    geometry.instanceCount = count;
}

/*
 * Create a light. `color` may be a THREE.Color, a hex number, or a CSS/#hex string.
 * Returns an opaque handle to pass to removeLight().
 */
export function createLight({ x, y, z, color, intensity = 1, radius = 5 }) {
    if (count >= capacity) grow();

    const slot = count++;
    posArr[slot * 3] = x;
    posArr[slot * 3 + 1] = y;
    posArr[slot * 3 + 2] = z;

    _color.set(color).convertSRGBToLinear(); // beauty buffer is linear; match it
    colArr[slot * 3] = _color.r;
    colArr[slot * 3 + 1] = _color.g;
    colArr[slot * 3 + 2] = _color.b;

    intArr[slot] = intensity;
    radArr[slot] = radius;

    const handle = { slot };
    handles[slot] = handle;
    markDirty();
    return handle;
}

/*
 * Remove a light via swap-remove: the last live instance is moved into the freed
 * slot so the live set stays packed at the front (one draw call, no gaps).
 */
export function removeLight(handle) {
    if (!handle || handle.slot < 0) return;
    const slot = handle.slot;
    const last = count - 1;

    if (slot !== last) {
        posArr.copyWithin(slot * 3, last * 3, last * 3 + 3);
        colArr.copyWithin(slot * 3, last * 3, last * 3 + 3);
        intArr[slot] = intArr[last];
        radArr[slot] = radArr[last];
        const moved = handles[slot] = handles[last];
        moved.slot = slot;
    }

    handles[last] = undefined;
    count = last;
    handle.slot = -1;
    markDirty();
}

export function setDepthTexture(tex) {
    volumeMaterial.uniforms.uDepth.value = tex;
}

// Refresh the reconstruction uniforms from the camera + current buffer size.
export function updateLightUniforms(camera, width, height) {
    const u = volumeMaterial.uniforms;
    u.uResolution.value.set(width, height);
    u.uProjInverse.value.copy(camera.projectionMatrixInverse);
    u.uViewInverse.value.copy(camera.matrixWorld);
}

export { lightScene };


// --- Composer passes --------------------------------------------------------

// Renders the full beauty scene into an external target that keeps its
// DepthTexture (so the light pass can reconstruct positions for free).
export class SceneRenderPass extends Pass {
    constructor(scene, camera, target) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.target = target;
        this.needsSwap = false;
    }

    render(renderer) {
        const oldAutoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.setRenderTarget(this.target);
        renderer.clear();
        renderer.render(this.scene, this.camera);
        renderer.autoClear = oldAutoClear;
    }
}

// Renders all light volumes additively into lightRT.
export class DeferredLightPass extends Pass {
    constructor(camera, lightRT) {
        super();
        this.camera = camera;
        this.lightRT = lightRT;
        this.needsSwap = false;
        this._clearColor = new THREE.Color(0x000000);
        this._size = new THREE.Vector2();
    }

    render(renderer) {
        renderer.getDrawingBufferSize(this._size);
        updateLightUniforms(this.camera, this._size.x, this._size.y);

        const prevClear = new THREE.Color();
        renderer.getClearColor(prevClear);
        const prevAlpha = renderer.getClearAlpha();

        renderer.setRenderTarget(this.lightRT);
        renderer.setClearColor(this._clearColor, 0);
        renderer.clear(true, true, false);
        renderer.render(lightScene, this.camera);

        renderer.setClearColor(prevClear, prevAlpha);
    }
}

// Renders the tagged GROUND meshes (atlas blocks, special blocks, flowers) into
// albedoRT using their OWN materials in "albedo mode" (uAlbedoPass=1), so every
// surface emits its raw texture albedo. Point lights then multiply it, revealing
// the texture. Each material writes its own depth, so transparent billboards
// correctly occlude the terrain behind them.
export class AlbedoPass extends Pass {
    constructor(scene, camera, albedoRT, layer = 2) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.albedoRT = albedoRT;
        this.layer = layer;
        this.needsSwap = false;
        this._clearColor = new THREE.Color(0x000000);
    }

    render(renderer) {
        // No lights => albedo is never used (light is 0), so skip the whole pass.
        if (count === 0) return;

        const prevClear = new THREE.Color();
        renderer.getClearColor(prevClear);
        const prevAlpha = renderer.getClearAlpha();
        const prevMask = this.camera.layers.mask;

        renderer.setClearColor(this._clearColor, 0); // alpha 0 => "no albedo here"
        renderer.setRenderTarget(this.albedoRT);     // autoClear wipes colour+depth

        albedoUniforms.uAlbedoPass.value = 1.0;
        this.camera.layers.set(this.layer);          // only ground meshes
        renderer.render(this.scene, this.camera);
        this.camera.layers.mask = prevMask;
        albedoUniforms.uAlbedoPass.value = 0.0;

        renderer.setClearColor(prevClear, prevAlpha);
    }
}

// Fullscreen composite:  out = beauty + albedo * light  (kept in HDR).
export class CompositePass extends Pass {
    constructor(sceneRT, lightRT, albedoRT) {
        super();
        this.needsSwap = true;
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                tBeauty: { value: sceneRT.texture },     // lit colour
                tAlbedo: { value: albedoRT.texture },    // terrain albedo (atlas only)
                tLight: { value: lightRT.texture },
                uBoost: { value: 6.0 },  // brightness of albedo-modulated light (tunable)
                uDebug: { value: 0 },    // 1 = show raw light buffer (diagnostics)
            },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform sampler2D tBeauty;
                uniform sampler2D tAlbedo;
                uniform sampler2D tLight;
                uniform float uBoost;
                uniform float uDebug;
                varying vec2 vUv;
                void main() {
                    vec4 b = texture2D(tBeauty, vUv);
                    vec4 alb = texture2D(tAlbedo, vUv);
                    vec3 l = texture2D(tLight, vUv).rgb;
                    if (uDebug > 1.5) { gl_FragColor = vec4(alb.rgb, 1.0); return; } // albedo buffer
                    if (uDebug > 0.5) { gl_FragColor = vec4(l, 1.0); return; }       // light buffer
                    // Where albedo was written (atlas blocks, alb.a==1) the light
                    // multiplies the surface texture -> the block genuinely lights up
                    // and its detail shows. Elsewhere fall back to plain additive.
                    vec3 litAtlas = b.rgb + alb.rgb * l * uBoost;
                    vec3 litOther = b.rgb + l;
                    gl_FragColor = vec4(mix(litOther, litAtlas, alb.a), b.a);
                }
            `,
        });
        this.setDebug = (mode) => { this.material.uniforms.uDebug.value = mode; };
        this.fsQuad = new FullScreenQuad(this.material);
    }

    render(renderer, writeBuffer) {
        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
        }
        this.fsQuad.render(renderer);
    }

    dispose() {
        this.fsQuad.dispose();
        this.material.dispose();
    }
}
