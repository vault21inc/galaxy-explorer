import type { ResolvedGalaxySettings } from '@ge/domain';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { AdditiveBlending, DoubleSide } from 'three';
import { bake } from '../bake/bake.ts';
import { bakeCache } from '../bake/bake-cache.ts';
import {
  GALAXY_DISC_EXTENT_RADII,
  GALAXY_DISC_INTENSITY,
  GALAXY_DISC_TEXTURE_PX,
} from '../tuning.ts';
import { discBakeDefinition, discBakeKey } from './disc-bake.ts';

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    // The bake stored the square root of linear light (disc-bake.ts); square it back.
    vec3 encoded = texture2D(uMap, vUv).rgb;
    gl_FragColor = vec4(encoded * encoded * uIntensity, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Anisotropic filtering keeps the disc sharp when seen at a grazing angle; 8 is plenty. */
const MAX_ANISOTROPY = 8;

/**
 * The galaxy disc (rendering.md §6): one flat square in the galactic plane, textured with the
 * baked top-down image. Drawn additively (its light adds to what's behind) and without
 * writing depth, so it never hides stars or objects behind it.
 */
export function GalaxyDisc({ settings }: { settings: ResolvedGalaxySettings }) {
  const gl = useThree((state) => state.gl);
  const sizePx = Math.min(GALAXY_DISC_TEXTURE_PX, gl.capabilities.maxTextureSize);
  const key = discBakeKey(settings, sizePx);

  const uniforms = useMemo(() => {
    // The cache owns the texture and disposes of it on eviction, not on unmount, so returning
    // to a map reuses its disc.
    const target = bakeCache.get(key, () => bake(gl, discBakeDefinition(settings), sizePx, sizePx));
    target.texture.anisotropy = Math.min(MAX_ANISOTROPY, gl.capabilities.getMaxAnisotropy());
    return { uMap: { value: target.texture }, uIntensity: { value: GALAXY_DISC_INTENSITY } };
    // `key` describes `settings` and `sizePx` completely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, key]);

  const sizeLy = 2 * GALAXY_DISC_EXTENT_RADII * settings.radiusLy;
  return (
    // A plane is made in the X/Y plane; rotating it -90° about X lays it in the galactic plane.
    // Keyed by the bake, so new settings build a new material: three.js reads a material's
    // uniforms object once, when it compiles the shader.
    <mesh key={key} rotation-x={-Math.PI / 2} renderOrder={1}>
      <planeGeometry args={[sizeLy, sizeLy]} />
      <shaderMaterial
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}
