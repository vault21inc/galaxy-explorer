import { Vector3 } from 'three';
import { SYSTEM_AMBIENT, SYSTEM_MAX_LIGHTS } from '../tuning.ts';

/**
 * The stars that light a system's bodies (rendering.md §7, D-29): up to SYSTEM_MAX_LIGHTS, the
 * largest first, published by the star renderer and read by the planet and belt shaders.
 *
 * They're shader uniforms rather than three.js `PointLight`s: only these two renderers are lit,
 * both are custom shaders that keep a minimum on-screen size, and the lighting is schematic
 * (no falloff with distance, no shadows), so three's light machinery would add nothing.
 */
export interface SystemLight {
  position: readonly [number, number, number];
  /** Linear RGB, already scaled by the light's intensity. */
  color: readonly [number, number, number];
}

/** A system without stars is lit from its center in white, so its planets aren't black. */
const UNLIT: readonly SystemLight[] = [{ position: [0, 0, 0], color: [1, 1, 1] }];

let lights: readonly SystemLight[] = UNLIT;
const listeners = new Set<() => void>();

export function publishLights(next: readonly SystemLight[] | null): void {
  lights = next && next.length > 0 ? next.slice(0, SYSTEM_MAX_LIGHTS) : UNLIT;
  for (const listener of listeners) listener();
}

/** The lights now, for the test hooks: none means the system is lit by the default. */
export function currentLights(): readonly SystemLight[] {
  return lights === UNLIT ? [] : lights;
}

/** Calls `listener` whenever the lights change; returns the unsubscribe function. */
export function onLightsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The uniforms a lit shader declares with LIGHTING_GLSL; `writeLights` fills them. */
export function lightUniforms() {
  return {
    uLightPosition: { value: Array.from({ length: SYSTEM_MAX_LIGHTS }, () => new Vector3()) },
    uLightColor: { value: Array.from({ length: SYSTEM_MAX_LIGHTS }, () => new Vector3()) },
    uLightCount: { value: 0 },
    uAmbient: { value: SYSTEM_AMBIENT },
  };
}

export function writeLights(uniforms: ReturnType<typeof lightUniforms>): void {
  lights.forEach((light, index) => {
    uniforms.uLightPosition.value[index]?.set(...light.position);
    uniforms.uLightColor.value[index]?.set(...light.color);
  });
  uniforms.uLightCount.value = lights.length;
}

/**
 * Diffuse ("Lambert") lighting from the system's stars, for fragment shaders. Light reaching a
 * surface is proportional to the cosine of the angle between its normal and the direction to
 * the light: full facing the star, none edge-on or behind. Each star adds its share; there's
 * no falloff with distance, since the system view isn't to scale.
 */
export const LIGHTING_GLSL = /* glsl */ `
  uniform vec3 uLightPosition[${SYSTEM_MAX_LIGHTS.toString()}];
  uniform vec3 uLightColor[${SYSTEM_MAX_LIGHTS.toString()}];
  uniform int uLightCount;
  uniform float uAmbient;

  // 'worldNormal' must be unit length; 'worldPosition' is the surface point.
  vec3 starlight(vec3 worldPosition, vec3 worldNormal) {
    vec3 light = vec3(uAmbient);
    for (int i = 0; i < ${SYSTEM_MAX_LIGHTS.toString()}; i++) {
      if (i >= uLightCount) break;
      vec3 toLight = normalize(uLightPosition[i] - worldPosition);
      light += uLightColor[i] * max(dot(worldNormal, toLight), 0.0);
    }
    return light;
  }
`;
