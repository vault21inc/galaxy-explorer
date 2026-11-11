import {
  isHidden,
  resolvePlanetSurface,
  seedFromId,
  spoilerKeys,
  type SpoilerPolicy,
  type ViewObject,
} from '@ge/domain';
import type { Texture } from 'three';
import { withPreview, type PreviewValues } from '@/state/appearance-preview.ts';
import type { PlanetLayer } from '../bake/planet/planet-texture-array.ts';
import { planetBakeDefinition, planetBakeKey } from '../bake/planet/planet-surface-bake.ts';
import { uploadedSurfaceDefinition } from '../bake/planet/uploaded-surfaces.ts';
import type { BodyBuffers } from '../bodies/body-buffers.ts';
import { BODY_STATES } from '../bodies/body-buffers.ts';

/**
 * What each planet of a system view paints on its sphere (M6-T2): one layer of the planets'
 * array texture per instance, in the order of the body buffers, plus its axial tilt.
 *
 * A hidden spoiler gets a neutral surface, never its own: it's drawn in the redaction color
 * anyway, and its real look shouldn't sit on the GPU for anyone to read back.
 */
export interface PlanetSurfaces {
  layers: PlanetLayer[];
  /** Axial tilt per instance, in radians. */
  tiltsRad: Float32Array;
}

const NEUTRAL = resolvePlanetSurface(undefined, 0);
const DEG = Math.PI / 180;

/**
 * The uploaded map a planet draws, if it has one, uses it, and may show it: a spoiler image
 * shows only when spoilers are shown, until then the generated surface does.
 */
export function surfaceUploadUrl(
  object: ViewObject,
  texture: 'preset' | 'upload' | undefined,
  policy: SpoilerPolicy,
): string | null {
  const upload = object.surfaceTexture;
  if (texture !== 'upload' || !upload) return null;
  const key = spoilerKeys.image(object.id, upload.assetId, 'surface_texture');
  return isHidden(upload.isSpoiler, key, policy) ? null : upload.url;
}

export function planetSurfaces(
  objects: readonly ViewObject[],
  buffers: BodyBuffers,
  size: { width: number; height: number },
  policy: SpoilerPolicy,
  /** Loaded uploads by URL (uploaded-surfaces.ts). */
  uploaded: (url: string) => Texture | undefined,
  /** Unsaved appearance being edited, by object id (the live preview, M6-T2). */
  previews: ReadonlyMap<string, PreviewValues> = new Map(),
): PlanetSurfaces {
  const byId = new Map<string, ViewObject>(objects.map((object) => [object.id, object]));
  const tiltsRad = new Float32Array(buffers.ids.length);
  const layers = buffers.ids.map((id, index): PlanetLayer => {
    const object = byId.get(id);
    const redacted = buffers.states[index] === BODY_STATES.redacted;
    const appearance = object && withPreview(object.appearance, previews.get(id)).planet;
    const surface =
      redacted || !object ? NEUTRAL : resolvePlanetSurface(appearance, seedFromId(id));
    tiltsRad[index] = redacted ? 0 : (appearance?.axialTiltDeg ?? 0) * DEG;
    const url = redacted || !object ? null : surfaceUploadUrl(object, appearance?.texture, policy);
    const texture = url === null ? undefined : uploaded(url);
    if (url !== null && texture) {
      return {
        key: `upload:${size.width.toString()}:${url}`,
        definition: () => uploadedSurfaceDefinition(texture, size.width, size.height),
      };
    }
    return {
      key: planetBakeKey(surface, 'surface', size.width),
      definition: () => planetBakeDefinition(surface, 'surface', size.width, size.height),
    };
  });
  return { layers, tiltsRad };
}
