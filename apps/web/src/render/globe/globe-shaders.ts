/**
 * The orbit view's globe shaders (rendering.md §8, M6-T3). Positions are in body radii with
 * the globe at the origin, and the sun is a direction (`uSunDir`, unit length, toward the
 * star): the star is so far away that its light arrives parallel.
 *
 * Lighting is Lambert's: the light a surface receives is proportional to the cosine of the
 * angle between its normal and the sun, `dot(normal, sun)`, full facing the sun and none from
 * the line between day and night (the terminator) onward. Every part ends with the same
 * exposure curve as the system view's planets, 1 − e^(−exposure × light), which lifts dark
 * surfaces and eases bright ones toward white instead of clipping them.
 */

/** Shared by every part: the texture coordinate, the world normal and position. */
export const GLOBE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    // The model is only turned and uniformly scaled, so its 3 × 3 part turns normals too.
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EXPOSURE_GLSL = /* glsl */ `
  uniform float uExposure;
  uniform float uWrap;
  vec3 expose(vec3 light) {
    return 1.0 - exp(-uExposure * light);
  }
  // Lambert's cosine, but faded in with an S-curve that starts a little past the terminator
  // (GLOBE_TERMINATOR_WRAP). Plain Lambert light rises from 0 in a straight line, and the
  // display's sRGB curve makes the first bit of any light look bright, so the terminator read
  // as a hard edge; an S-curve starts flat, and the edge looks soft.
  float sunlit(float sunCos) {
    return smoothstep(-uWrap, 1.0, sunCos);
  }
`;

/**
 * Where a baked texture is sampled. The bake's first and last columns lie exactly on the
 * ±180° meridian and its first and last rows on the poles (planet-surface-bake.ts), so a
 * texture coordinate maps to texel centers; an upload uses ordinary coordinates.
 */
const BAKED_UV_GLSL = /* glsl */ `
  uniform vec2 uBakeSize;
  vec2 bakedUv(vec2 uv) {
    return (uv * (uBakeSize - 1.0) + 0.5) / uBakeSize;
  }
`;

export const GLOBE_FRAGMENT = /* glsl */ `
  ${EXPOSURE_GLSL}
  ${BAKED_UV_GLSL}
  uniform sampler2D uAlbedo;
  uniform sampler2D uLayers;
  uniform float uUploaded;      // 1: the albedo is an upload
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;       // linear
  uniform float uAmbient;
  uniform float uSpecularPower;
  uniform float uSpecularStrength;
  uniform vec3 uLightsColor;    // linear, already times intensity; 0 for none
  uniform vec2 uNightRange;     // full, none: where night lights fade in
  uniform vec3 uHazeColor;      // linear; 0 without an atmosphere
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec2 baked = bakedUv(vUv);
    vec4 surface = texture2D(uAlbedo, uUploaded > 0.5 ? vUv : baked);
    vec3 albedo = sRGBTransferEOTF(surface).rgb;
    // The bake's alpha marks water; an upload has none.
    float ocean = uUploaded > 0.5 ? 0.0 : surface.a;
    vec4 layers = texture2D(uLayers, baked);

    vec3 n = normalize(vNormal);
    vec3 toCamera = normalize(cameraPosition - vWorldPosition);
    float sunCos = dot(n, uSunDir);
    vec3 light = albedo * (uAmbient + uSunColor * sunlit(sunCos));

    // Sunlight glinting off water (Blinn-Phong): bright where the surface normal points halfway
    // between the sun and the camera, as on a mirror.
    vec3 halfway = normalize(uSunDir + toCamera);
    float glint = pow(max(dot(n, halfway), 0.0), uSpecularPower);
    light += uSunColor * glint * uSpecularStrength * ocean * step(0.0, sunCos);

    // City lights (or lava's glow) on the night side, fading in past the terminator.
    float night = 1.0 - smoothstep(uNightRange.x, uNightRange.y, sunCos);
    light += uLightsColor * layers.r * night;

    // A thin haze of atmosphere toward the edge of the lit side, where we look through more air.
    float edge = pow(1.0 - max(dot(n, toCamera), 0.0), 4.0);
    light += uHazeColor * edge * smoothstep(-0.1, 0.5, sunCos);

    gl_FragColor = vec4(expose(light), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Clouds: the bake's cloud cover as opacity, lit like the surface. */
export const CLOUD_FRAGMENT = /* glsl */ `
  ${EXPOSURE_GLSL}
  ${BAKED_UV_GLSL}
  uniform sampler2D uLayers;
  uniform vec3 uCloudColor;     // linear
  uniform float uOpacity;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uAmbient;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    float cover = texture2D(uLayers, bakedUv(vUv)).g;
    float day = sunlit(dot(normalize(vNormal), uSunDir));
    vec3 light = uCloudColor * (uAmbient + uSunColor * day);
    gl_FragColor = vec4(expose(light), cover * uOpacity);
    #include <colorspace_fragment>
  }
`;

/**
 * The atmosphere: a slightly larger sphere drawn from the inside (its back faces), added onto
 * what's behind it. Looking through the shell near the globe's edge crosses the most air, so
 * the glow is strongest just outside the globe and fades to nothing at the shell's own edge,
 * where the view only grazes it; the night side barely glows.
 */
export const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;          // linear
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 toCamera = normalize(cameraPosition - vWorldPosition);
    // A back face's normal points away from the camera: −dot is 0 at the rim, 1 face-on.
    float through = clamp(-dot(normalize(vNormal), toCamera), 0.0, 1.0);
    float glow = pow(through, 3.0);
    float lit = smoothstep(-0.35, 0.5, dot(normalize(vWorldPosition), uSunDir));
    gl_FragColor = vec4(uColor * glow * lit, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Rings: concentric bands across the ring's width, lit by the sun from either side, and dark
 * where the globe shades them. A point is in the globe's shadow when it lies behind the globe
 * (away from the sun) and within one radius of the line through the globe's center toward the
 * sun.
 */
export const RING_VERTEX = /* glsl */ `
  uniform vec2 uSpan;           // inner, outer radius
  varying float vAcross;
  varying vec3 vWorldPosition;
  void main() {
    vAcross = (length(position.xy) - uSpan.x) / (uSpan.y - uSpan.x);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const RING_FRAGMENT = /* glsl */ `
  ${EXPOSURE_GLSL}
  uniform vec3 uColor;          // linear
  uniform float uOpacity;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uAmbient;
  varying float vAcross;
  varying vec3 vWorldPosition;
  void main() {
    // The same banding as the system view's rings (planet-rings.tsx).
    float bands = 0.75 + 0.25 * sin(vAcross * 60.0) * sin(vAcross * 17.0 + 1.3);
    float edges = smoothstep(0.0, 0.08, vAcross) * (1.0 - smoothstep(0.85, 1.0, vAcross));
    float along = dot(vWorldPosition, uSunDir);
    float fromAxis = length(vWorldPosition - along * uSunDir);
    float shadow = along < 0.0 ? smoothstep(0.97, 1.03, fromAxis) : 1.0;
    vec3 light = uColor * (uAmbient + uSunColor * 0.9 * shadow);
    gl_FragColor = vec4(expose(light), uOpacity * bands * edges);
    #include <colorspace_fragment>
  }
`;
