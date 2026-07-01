export function patchWaterShader(shader) {
    shader.vertexShader = `
        attribute float wpath;
        varying float vWPath;
        varying vec3 vWorldPos;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWPath = wpath;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
    );

    shader.fragmentShader = `
        varying float vWPath;
        varying vec3 vWorldPos;
    ` + shader.fragmentShader;

    // pathLen controls only opacity.
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 viewDir  = normalize(cameraPosition - vWorldPos);
        float cosUp   = max(abs(viewDir.y), 0.12);
        float pathLen = vWPath / cosUp;

        diffuseColor.a = clamp(0.60 + pathLen * 0.10, 0.70, 1.0);`
    );

}
