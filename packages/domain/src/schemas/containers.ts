import { z } from 'zod';
import { Slug, Uuid } from '../ids.ts';
import { RichText } from '../richtext/schema.ts';
import { GalaxySettings, Underlay } from './map-settings.ts';
import { UniverseSettings } from './universe-settings.ts';

/**
 * Universes and maps (data-model §3.1), as the API accepts and returns them. They have their
 * own hand-written routes; the entity kinds' schemas come from `schemasFor`.
 */

const version = z.int().positive();
const timestamp = z.iso.datetime({ offset: true });
const STATUSES = ['draft', 'published'] as const;

export const UniverseCreate = z.strictObject({
  slug: Slug,
  name: RichText,
  description: RichText.nullable().optional(),
  /** How dates are written in this universe, such as "240.M41" (E2). */
  dateFormatNotes: RichText.nullable().optional(),
  settings: UniverseSettings.optional(),
});
/**
 * Who may read a universe (D-34, data-model §8): its owner and members only, anyone with its
 * share link, or everyone. New universes start private; only the owner changes this.
 */
export const VISIBILITIES = ['private', 'link', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const Visibility = z.enum(VISIBILITIES);

/**
 * What a requester may do in a universe (data-model §8), from least to most: nothing (it's a
 * 404), read published content, edit everything in it, or also change who has access.
 */
export const UNIVERSE_ACCESS = ['none', 'read', 'edit', 'own'] as const;
export type UniverseAccess = (typeof UNIVERSE_ACCESS)[number];

/** How a universe is shared with another account (M8-T12): changing it, or only reading it. */
export const MEMBER_ROLES = ['editor', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export const MemberRole = z.enum(MEMBER_ROLES);

export const UniverseUpdate = UniverseCreate.partial().extend({
  /** The owner's alone to change, like the slug (M8-T11). */
  visibility: Visibility.optional(),
  version,
});
export const UniverseRead = z
  .object(UniverseCreate.shape)
  .required()
  .extend({
    id: Uuid,
    namePlain: z.string(),
    visibility: Visibility,
    /** The owner's username; null for the installation's own universes (D-34). */
    owner: z.string().nullable(),
    /** What the requester may do here; a universe they can't read is never returned. */
    access: z.enum(['read', 'edit', 'own']),
    /** The requester's role if it's shared with them (M8-T12); null for its owner and others. */
    role: MemberRole.nullable(),
    /**
     * The share link's key, `/u/{slug}?k={key}`, for the owner of a link-only universe; null
     * for everyone else, and while it's private or public (M8-T12).
     */
    shareKey: z.string().nullable(),
    version,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

/**
 * `/u/:universeSlug/settings` is the universe's settings page (M4-T1), and the router ranks it
 * above `/u/:universeSlug/:mapSlug`, so a map with this slug could never be opened.
 */
export const RESERVED_MAP_SLUGS: readonly string[] = ['settings'];
const MapSlug = Slug.refine((slug) => !RESERVED_MAP_SLUGS.includes(slug), {
  message: 'This slug is taken by the universe’s settings page. Choose another.',
});

export const MapCreate = z.strictObject({
  slug: MapSlug,
  name: RichText,
  description: RichText.nullable().optional(),
  /** Order in the map switcher, for example by era. */
  sortKey: z.number().optional(),
  galaxySettings: GalaxySettings.optional(),
  underlayAssetId: Uuid.nullable().optional(),
  underlay: Underlay.nullable().optional(),
  /** The whole map is a potential spoiler. */
  isSpoiler: z.boolean().optional(),
  status: z.enum(STATUSES).optional(),
});
export const MapUpdate = MapCreate.partial().extend({ version });
/**
 * `POST /maps/{id}/clone` (M7-T5): the copy's slug and name, and where it sorts (after the
 * original when left out). Everything else is copied.
 */
export const MapClone = MapCreate.pick({ slug: true, name: true, sortKey: true });
export const MapRead = z.object(MapCreate.shape).required().extend({
  id: Uuid,
  universeId: Uuid,
  namePlain: z.string(),
  clonedFromMapId: Uuid.nullable(),
  version,
  createdAt: timestamp,
  updatedAt: timestamp,
});
