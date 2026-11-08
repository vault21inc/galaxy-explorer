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
export const UniverseUpdate = UniverseCreate.partial().extend({ version });
export const UniverseRead = z
  .object(UniverseCreate.shape)
  .required()
  .extend({ id: Uuid, namePlain: z.string(), version, createdAt: timestamp, updatedAt: timestamp });

export const MapCreate = z.strictObject({
  slug: Slug,
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
export const MapRead = z.object(MapCreate.shape).required().extend({
  id: Uuid,
  universeId: Uuid,
  namePlain: z.string(),
  clonedFromMapId: Uuid.nullable(),
  version,
  createdAt: timestamp,
  updatedAt: timestamp,
});
