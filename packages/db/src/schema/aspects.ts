import {
  HTTP_URL_PATTERN,
  IMAGE_ROLES,
  RELATION_TYPES,
  type FieldValue,
  type RichText,
} from '@ge/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { idColumn, isSpoilerColumn, matches, oneOf } from './helpers.ts';

/**
 * Aspects: images, links, facts and relations, shared by every entity kind (data-model §3.4).
 * `citations` arrives in M7.
 */

/** Two entities related to each other, such as a character involved in an event. */
export const entityRelations = pgTable(
  'relations',
  {
    id: idColumn(),
    universeId: uuid().notNull(),
    fromEntityId: uuid().notNull(),
    toEntityId: uuid().notNull(),
    relationType: text().notNull(),
    /** For example "Inquisitor leading the hunt". */
    role: jsonb().$type<RichText>(),
    isSpoiler: isSpoilerColumn(),
    sortKey: numeric({ mode: 'number' }).notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('relations_pair_type_uq').on(t.fromEntityId, t.toEntityId, t.relationType),
    check('relations_type_check', oneOf(t.relationType, RELATION_TYPES)),
    check('relations_not_self', sql`${t.fromEntityId} <> ${t.toEntityId}`),
    index('relations_to_idx').on(t.toEntityId),
  ],
);

export const entityLinks = pgTable(
  'entity_links',
  {
    id: idColumn(),
    entityId: uuid().notNull(),
    url: text().notNull(),
    label: text(),
    isSpoiler: isSpoilerColumn(),
    sortKey: numeric({ mode: 'number' }).notNull().default(0),
  },
  (t) => [
    check('entity_links_url_format', matches(t.url, HTTP_URL_PATTERN)),
    index('entity_links_entity_idx').on(t.entityId),
  ],
);

export const entityImages = pgTable(
  'entity_images',
  {
    entityId: uuid().notNull(),
    assetId: uuid().notNull(),
    role: text().notNull().default('gallery'),
    caption: jsonb().$type<RichText>(),
    isSpoiler: isSpoilerColumn(),
    sortKey: numeric({ mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'entity_images_pk', columns: [t.entityId, t.assetId, t.role] }),
    check('entity_images_role_check', oneOf(t.role, IMAGE_ROLES)),
    // Every role except `gallery` is one image per entity.
    uniqueIndex('entity_images_single_role_uq')
      .on(t.entityId, t.role)
      .where(sql`role <> 'gallery'`),
    index('entity_images_asset_idx').on(t.assetId),
  ],
);

/** Facts: values of the universe's custom fields, such as "Population: 5 billion". */
export const fieldValues = pgTable(
  'field_values',
  {
    entityId: uuid().notNull(),
    fieldDefinitionId: uuid().notNull(),
    value: jsonb().$type<FieldValue>().notNull(),
    /** Authoritative for facts; `RichText.spoiler` isn't used here. */
    isSpoiler: isSpoilerColumn(),
    /** Overrides the definition's order for this entity. */
    sortKey: numeric({ mode: 'number' }),
  },
  (t) => [primaryKey({ name: 'field_values_pk', columns: [t.entityId, t.fieldDefinitionId] })],
);
