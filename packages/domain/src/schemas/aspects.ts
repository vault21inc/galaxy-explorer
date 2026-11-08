import { z } from 'zod';
import { Uuid } from '../ids.ts';
import { HTTP_URL_PATTERN } from '../patterns.ts';
import { ENTITY_KINDS } from '../registry/entity-kinds.ts';
import { RELATION_TYPES } from '../registry/relation-types.ts';
import { RichText } from '../richtext/schema.ts';
import { FieldValue } from './field-value.ts';

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

// ---------------------------------------------------------------------------------------------
// Aspect read and write shapes, as the API returns and accepts them (architecture.md §5). The
// entity they belong to comes from the URL (`/entities/{id}/links`), so it isn't in the writes.
// ---------------------------------------------------------------------------------------------

const sortKey = z.number();
const isSpoiler = z.boolean();

export const ImageWrite = z.strictObject({
  assetId: Uuid,
  /** Default 'gallery'. Every other role is one image per entity. */
  role: z.enum(IMAGE_ROLES).optional(),
  caption: RichText.nullable().optional(),
  isSpoiler: isSpoiler.optional(),
  sortKey: sortKey.optional(),
});
export const ImageRead = z.object({
  entityId: Uuid,
  assetId: Uuid,
  role: z.enum(IMAGE_ROLES),
  caption: RichText.nullable(),
  isSpoiler,
  sortKey,
});

export const LinkWrite = z.strictObject({
  url: z.string().max(2_000).regex(new RegExp(HTTP_URL_PATTERN), 'Use an http or https URL.'),
  label: z.string().max(200).nullable().optional(),
  isSpoiler: isSpoiler.optional(),
  sortKey: sortKey.optional(),
});
export const LinkRead = z.object({
  id: Uuid,
  entityId: Uuid,
  url: z.string(),
  label: z.string().nullable(),
  isSpoiler,
  sortKey,
});

export const FactWrite = z.strictObject({
  fieldDefinitionId: Uuid,
  value: FieldValue,
  isSpoiler: isSpoiler.optional(),
  /** Overrides the field definition's order for this entity. */
  sortKey: sortKey.nullable().optional(),
});
export const FactRead = z.object({
  entityId: Uuid,
  fieldDefinitionId: Uuid,
  value: FieldValue,
  isSpoiler,
  sortKey: sortKey.nullable(),
});

export const RelationWrite = z.strictObject({
  relationType: z.enum(RELATION_TYPES),
  /** The other end; this entity is the `from` end. */
  toEntityId: Uuid,
  role: RichText.nullable().optional(),
  isSpoiler: isSpoiler.optional(),
  sortKey: sortKey.optional(),
});
/**
 * The entity at a relation's other end, from the reading entity's side: enough to name and link
 * it without another request. `isSpoiler` and `nameSpoiler` say whether its name is hidden
 * while spoilers are (its record key is its id, `spoilerKeys.record`).
 */
export const RelationEnd = z.object({
  id: Uuid,
  kind: z.enum(ENTITY_KINDS),
  namePlain: z.string(),
  isSpoiler: z.boolean(),
  nameSpoiler: z.boolean(),
});
export const RelationRead = z.object({
  id: Uuid,
  relationType: z.enum(RELATION_TYPES),
  fromEntityId: Uuid,
  toEntityId: Uuid,
  role: RichText.nullable(),
  isSpoiler,
  sortKey,
  other: RelationEnd,
});

/** Where a place or event is: one shape per mode, so each mode's required fields are clear. */
export const LocationWrite = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('surface'),
    /** A planet or moon. */
    objectId: Uuid,
    latDeg: z.number().min(-90).max(90),
    lonDeg: z.number().min(-180).lt(180),
    isSpoiler: isSpoiler.optional(),
  }),
  z.strictObject({ mode: z.literal('object'), objectId: Uuid, isSpoiler: isSpoiler.optional() }),
  z.strictObject({
    mode: z.literal('space'),
    /** The system whose frame x, y, z are in; null for the galaxy frame. */
    objectId: Uuid.nullable().optional(),
    x: z.number(),
    y: z.number(),
    z: z.number(),
    isSpoiler: isSpoiler.optional(),
  }),
  z.strictObject({ mode: z.literal('place'), placeId: Uuid, isSpoiler: isSpoiler.optional() }),
]);
export const LocationRead = z.object({
  entityId: Uuid,
  mode: z.enum(LOCATION_MODES),
  objectId: Uuid.nullable(),
  placeId: Uuid.nullable(),
  latDeg: z.number().nullable(),
  lonDeg: z.number().nullable(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  z: z.number().nullable(),
  isSpoiler,
});

export const MemberWrite = z.strictObject({ objectId: Uuid, isSpoiler: isSpoiler.optional() });
export const MemberRead = z.object({ objectId: Uuid, isSpoiler });

/** Aspects an entity read can include on request (`include=facts,images,…`). */
export const ENTITY_INCLUDES = [
  'facts',
  'images',
  'links',
  'relations',
  'location',
  'members',
] as const;
export type EntityInclude = (typeof ENTITY_INCLUDES)[number];
