import { RepeatWrapping, TextureLoader, Vector2, type Texture } from 'three';
import type { BakeDefinition } from '../bake.ts';
import { UPLOADED_SURFACES_KEPT } from '../../tuning.ts';

/**
 * Uploaded maps of planets' globes (M6-T2), loaded once per URL and kept for the page's life,
 * the oldest disposed past UPLOADED_SURFACES_KEPT. A planet draws its upload by baking a copy
 * into its layer of the planets' array texture, like a generated surface.
 */
const textures = new Map<string, Texture>();
const pending = new Map<string, Promise<Texture>>();

/** The loaded texture for a URL, or undefined while it loads (or if it failed). */
export function uploadedSurface(url: string): Texture | undefined {
  return textures.get(url);
}

export function loadUploadedSurface(url: string): Promise<Texture> {
  const existing = pending.get(url);
  if (existing) return existing;
  const promise = new TextureLoader().loadAsync(url).then((texture) => {
    // Around the globe, the map's left edge meets its right: sampling wraps across it, so
    // both edges of the bake blend the same two columns. The file holds sRGB, and so does the
    // bake, so no color conversion (the default color space) on the way.
    texture.wrapS = RepeatWrapping;
    textures.set(url, texture);
    while (textures.size > UPLOADED_SURFACES_KEPT) {
      const [oldestUrl, oldest] = textures.entries().next().value ?? [];
      if (oldestUrl === undefined || !oldest) break;
      textures.delete(oldestUrl);
      pending.delete(oldestUrl);
      oldest.dispose();
    }
    return texture;
  });
  pending.set(url, promise);
  promise.catch(() => {
    pending.delete(url);
  });
  return promise;
}

/** Copies an uploaded map into a bake target with the generator's texel layout. */
const COPY_SHADER = /* glsl */ `
  precision highp float;
  uniform sampler2D uImage;
  uniform vec2 uSize;
  varying vec2 vUv;
  void main() {
    // Edge-inclusive, as planet-surface-bake.ts: the first and last columns on ±180°.
    vec2 uv = (vUv * uSize - 0.5) / (uSize - 1.0);
    // Alpha is the ocean mask: an upload has none.
    gl_FragColor = vec4(texture2D(uImage, uv).rgb, 0.0);
  }
`;

export function uploadedSurfaceDefinition(
  texture: Texture,
  widthPx: number,
  heightPx: number,
): BakeDefinition {
  return {
    fragmentShader: COPY_SHADER,
    uniforms: { uImage: { value: texture }, uSize: { value: new Vector2(widthPx, heightPx) } },
  };
}
