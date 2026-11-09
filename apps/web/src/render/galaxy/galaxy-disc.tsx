import type { ResolvedGalaxySettings } from '@ge/domain';
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  DoubleSide,
  type ShaderMaterial,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import { bake, bakeInto, bakeTarget } from '../bake/bake.ts';
import { bakeCache } from '../bake/bake-cache.ts';
import {
  GALAXY_DISC_EXTENT_RADII,
  GALAXY_DISC_INTENSITY,
  GALAXY_DISC_PREVIEW_PX,
  GALAXY_DISC_TEXTURE_PX,
  GALAXY_PREVIEW_DEBOUNCE_MS,
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
 * The one texture the live preview re-bakes into while a slider is dragged (M3-T8). Reusing it
 * keeps a drag from creating textures; it's disposed when the preview ends.
 */
let previewTarget: WebGLRenderTarget | null = null;

/** What the disc shows, for the test hooks: its bake key, and whether it's the preview. */
let shown: { key: string; preview: boolean } | null = null;
export function galaxyDiscState() {
  return shown;
}

/**
 * The galaxy disc (rendering.md §6): one flat square in the galactic plane, textured with the
 * baked top-down image. Drawn additively (its light adds to what's behind) and without
 * writing depth, so it never hides stars or objects behind it.
 *
 * `settings` are the saved ones, baked at full size through the bake cache. While the Map
 * settings panel previews a change (`preview`), the disc re-bakes those at 512² into one reused
 * target, 150 ms after the last change (rendering.md §9), and shows that instead.
 */
export function GalaxyDisc({
  settings,
  preview,
}: {
  settings: ResolvedGalaxySettings;
  preview: ResolvedGalaxySettings | null;
}) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const sizePx = Math.min(GALAXY_DISC_TEXTURE_PX, gl.capabilities.maxTextureSize);
  const key = discBakeKey(settings, sizePx);
  const previewKey = preview ? discBakeKey(preview, GALAXY_DISC_PREVIEW_PX) : null;

  // One uniforms object for the material's life: three.js reads it once when it compiles the
  // shader, and afterwards follows changes to each uniform's `.value`, set through the
  // material below.
  const uniforms = useMemo(
    () => ({
      uMap: { value: null as Texture | null },
      uIntensity: { value: GALAXY_DISC_INTENSITY },
    }),
    [],
  );
  const material = useRef<ShaderMaterial>(null);
  const showTexture = (texture: Texture) => {
    const map = material.current?.uniforms.uMap;
    if (map) map.value = texture;
    invalidate();
  };

  // The saved settings' full bake. The cache owns the texture and disposes of it on eviction,
  // not on unmount, so returning to a map reuses its disc.
  const full = useMemo(() => {
    const target = bakeCache.get(key, () => bake(gl, discBakeDefinition(settings), sizePx, sizePx));
    target.texture.anisotropy = Math.min(MAX_ANISOTROPY, gl.capabilities.getMaxAnisotropy());
    return target;
    // `key` describes `settings` and `sizePx` completely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, key]);

  // Without a preview, the full bake. A layout effect, so the texture is in place before the
  // canvas draws its next frame.
  useLayoutEffect(() => {
    if (previewKey !== null) return;
    showTexture(full.texture);
    shown = { key, preview: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showTexture reads only refs
  }, [previewKey, full, key]);

  // With one, a quick bake once the slider has rested for a moment.
  useEffect(() => {
    if (!preview || previewKey === null) return;
    const timer = window.setTimeout(() => {
      previewTarget ??= bakeTarget(GALAXY_DISC_PREVIEW_PX, GALAXY_DISC_PREVIEW_PX);
      bakeInto(gl, discBakeDefinition(preview), previewTarget);
      showTexture(previewTarget.texture);
      shown = { key: previewKey, preview: true };
    }, GALAXY_PREVIEW_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
    // `previewKey` describes `preview` completely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, previewKey]);

  // The preview's texture goes once there's no preview (or the disc goes).
  const previewing = previewKey !== null;
  useEffect(() => {
    if (previewing) return;
    previewTarget?.dispose();
    previewTarget = null;
  }, [previewing]);
  useEffect(
    () => () => {
      previewTarget?.dispose();
      previewTarget = null;
      shown = null;
    },
    [],
  );

  const radiusLy = (preview ?? settings).radiusLy;
  const sizeLy = 2 * GALAXY_DISC_EXTENT_RADII * radiusLy;
  return (
    // A plane is made in the X/Y plane; rotating it -90° about X lays it in the galactic plane.
    <mesh rotation-x={-Math.PI / 2} renderOrder={1}>
      <planeGeometry args={[sizeLy, sizeLy]} />
      <shaderMaterial
        ref={material}
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
