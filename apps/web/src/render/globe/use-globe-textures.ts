import {
  resolvePlanetSurface,
  seedFromId,
  type PlanetAppearance,
  type PlanetSurface,
  type ViewObject,
} from '@ge/domain';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { Texture } from 'three';
import { useQualityPreset } from '@/state/quality.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { bake } from '../bake/bake.ts';
import { bakeCache } from '../bake/bake-cache.ts';
import { planetBakeDefinition, planetBakeKey } from '../bake/planet/planet-surface-bake.ts';
import { loadUploadedSurface, uploadedSurface } from '../bake/planet/uploaded-surfaces.ts';
import { surfaceUploadUrl } from '../planets/planet-surfaces.ts';

export interface GlobeTextures {
  surface: PlanetSurface;
  /** The albedo: baked (sRGB, ocean mask in alpha), or the uploaded map once loaded. */
  albedo: Texture;
  /** Night lights (R) and cloud cover (G), baked. */
  layers: Texture;
  /** The bakes' size in texels, width and height: the shaders' texel mapping needs it. */
  bakeSize: [number, number];
  /** The albedo is an upload: ordinary texture coordinates, and no ocean mask. */
  uploaded: boolean;
  /** The bake keys, for the test hooks. */
  albedoKey: string;
  layersKey: string;
}

/**
 * The orbit view's globe textures (M6-T2, M6-T3): the subject's surface and its night-light
 * and cloud layers, baked at the quality level's size (`orbitTexturePx`, 2,048 × 1,024 at
 * Medium) through the bake cache, so the same planet isn't baked twice. An uploaded map, if
 * the planet uses one and the reader may see it, replaces the baked albedo once it's loaded.
 *
 * `planet` is the appearance to draw: the saved one with any unsaved edits applied.
 */
export function useGlobeTextures(subject: ViewObject, planet: PlanetAppearance | undefined) {
  const gl = useThree((state) => state.gl);
  const [widthPx, heightPx] = useQualityPreset().orbitTexturePx;
  const policy = useSpoilerPolicy();
  const surface = useMemo(
    () => resolvePlanetSurface(planet, seedFromId(subject.id)),
    [planet, subject.id],
  );

  const baked = useMemo(() => {
    const textureOf = (output: 'surface' | 'layers') => {
      const key = planetBakeKey(surface, output, widthPx);
      const target = bakeCache.get(key, () =>
        bake(gl, planetBakeDefinition(surface, output, widthPx, heightPx), widthPx, heightPx),
      );
      return { key, texture: target.texture };
    };
    return { surface: textureOf('surface'), layers: textureOf('layers') };
  }, [gl, surface, widthPx, heightPx]);

  // An upload loads in the background; the generated surface shows until it arrives.
  const url = surfaceUploadUrl(subject, planet?.texture, policy);
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    if (url === null || uploadedSurface(url)) return;
    let active = true;
    loadUploadedSurface(url).then(
      () => {
        if (active) setLoaded((value) => value + 1);
      },
      (error: unknown) => {
        console.warn(error);
      },
    );
    return () => {
      active = false;
    };
  }, [url]);

  return useMemo((): GlobeTextures => {
    const upload = url === null ? undefined : uploadedSurface(url);
    return {
      surface,
      albedo: upload ?? baked.surface.texture,
      layers: baked.layers.texture,
      bakeSize: [widthPx, heightPx],
      uploaded: upload !== undefined,
      albedoKey: upload && url !== null ? `upload:${url}` : baked.surface.key,
      layersKey: baked.layers.key,
    };
    // `loaded` stands for what uploadedSurface returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, baked, url, loaded, widthPx, heightPx]);
}
