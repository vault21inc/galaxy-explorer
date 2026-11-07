import { z } from 'zod';

/**
 * Value lists for the aspect tables (data-model §3.4). The database checks are generated from
 * these, like the registries.
 */

/** What an entity image is for. Only `gallery` may appear more than once per entity. */
export const IMAGE_ROLES = ['gallery', 'cover', 'surface_texture', 'cloud_texture'] as const;
export type ImageRole = (typeof IMAGE_ROLES)[number];

/**
 * How a place or event is located (E3, E4):
 * - `surface`: on a body, at a latitude and longitude;
 * - `object`: at a body, with no position on it;
 * - `space`: at x, y, z in a system's frame (or the galaxy's, without an object);
 * - `place`: at another place.
 */
export const LOCATION_MODES = ['surface', 'object', 'space', 'place'] as const;
export type LocationMode = (typeof LOCATION_MODES)[number];

/** Who made a change batch (data-model §3.7). */
export const ACTOR_TYPES = ['local', 'user', 'api_token', 'system'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

const variant = z.object({
  /** Storage key of the file under the media directory. */
  key: z.string().min(1),
  width: z.int().positive(),
  height: z.int().positive(),
});

/** The resized copies the server stores for each upload (M3). */
export const AssetVariants = z.object({
  thumb: variant,
  display: variant,
  /** Planet and cloud textures only: power-of-two sized. */
  texture: variant.optional(),
});
export type AssetVariants = z.infer<typeof AssetVariants>;
