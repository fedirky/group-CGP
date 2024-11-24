uniform float uTime;
uniform vec3 uBaseColor;
uniform vec3 uDeepColor;
uniform sampler2D uDepthTexture;
uniform float uCameraNear;
uniform float uCameraFar;

varying vec3 vWorldPosition;

// Convert depth to linear
float getLinearDepth(float depth) {
    return uCameraNear * uCameraFar / (uCameraFar - depth * (uCameraNear - uCameraFar));
}

void main() {
    // Wave effect
    float wave = sin(vWorldPosition.x * 0.5 + uTime * 0.5) * 0.05 +
                 cos(vWorldPosition.z * 0.3 + uTime * 0.3) * 0.05;

    // Depth-based color blending
    float linearDepth = gl_FragCoord.z; // Use gl_FragCoord depth for simplicity
    vec3 color = mix(uBaseColor, uDeepColor, linearDepth);

    // Apply transparency based on wave and depth
    float alpha = clamp(1.0 - linearDepth * 5.0 + wave, 0.3, 1.0);

    gl_FragColor = vec4(color, alpha);
}
