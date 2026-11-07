import {
  ENTITY_STATUSES,
  type GalaxySettings,
  type RichText,
  SLUG_PATTERN,
  type Underlay,
  type UniverseSettings,
} from '@ge/domain';
import { boolean, check, jsonb, numeric, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { idColumn, matches, oneOf, stamps } from './helpers.ts';

/** A fictional setting, such as Warhammer 40,000 (data-model §3.1). */
export const universes = pgTable(
  'universes',
  {
    id: idColumn(),
    slug: text().notNull().unique(),
    name: jsonb().$type<RichText>().notNull(),
    /** Derived from `name` on write: labels, sorting, breadcrumbs. */
    namePlain: text().notNull(),
    description: jsonb().$type<RichText>(),
    /** How dates are written in this universe (E2). */
    dateFormatNotes: jsonb().$type<RichText>(),
    settings: jsonb().$type<UniverseSettings>().notNull().default({}),
    ...stamps(),
  },
  (t) => [check('universes_slug_format', matches(t.slug, SLUG_PATTERN))],
);

/** One galaxy at one point in time (U7). */
export const maps = pgTable(
  'maps',
  {
    id: idColumn(),
    universeId: uuid().notNull(),
    slug: text().notNull(),
    name: jsonb().$type<RichText>().notNull(),
    namePlain: text().notNull(),
    description: jsonb().$type<RichText>(),
    /** Order in the map switcher, for example by era. */
    sortKey: numeric({ mode: 'number' }).notNull().default(0),
    /** The procedural galaxy background. */
    galaxySettings: jsonb().$type<GalaxySettings>().notNull().default({}),
    underlayAssetId: uuid(),
    /** Placement of the reference image, shown in edit mode only. */
    underlay: jsonb().$type<Underlay>(),
    clonedFromMapId: uuid(),
    isSpoiler: boolean().notNull().default(false),
    status: text().notNull().default('published'),
    ...stamps(),
  },
  (t) => [
    unique('maps_universe_slug_uq').on(t.universeId, t.slug),
    check('maps_slug_format', matches(t.slug, SLUG_PATTERN)),
    check('maps_status_check', oneOf(t.status, ENTITY_STATUSES)),
  ],
);
