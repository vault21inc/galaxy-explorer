import {
  BASE_TYPES,
  ENTITY_KINDS,
  FIELD_KEY_PATTERN,
  FIELD_VALUE_TYPES,
  HEX_COLOR_PATTERN,
  type Appearance,
  type RichText,
} from '@ge/domain';
import { sql } from 'drizzle-orm';
import { check, jsonb, numeric, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { idColumn, matches, oneOf } from './helpers.ts';

/** Universe-level settings tables (data-model §3.5), edited on the settings page. */

/** Segmentum, Sector, Sub-sector… (T5). */
export const groupTypes = pgTable(
  'group_types',
  {
    id: idColumn(),
    universeId: uuid().notNull(),
    name: text().notNull(),
    /** For example 'Administrative' or 'Political'. */
    layer: text().notNull(),
    parentGroupTypeId: uuid(),
    defaultColor: text().notNull(),
    sortKey: numeric({ mode: 'number' }).notNull().default(0),
  },
  (t) => [
    unique('group_types_universe_name_uq').on(t.universeId, t.name),
    check('group_types_default_color_format', matches(t.defaultColor, HEX_COLOR_PATTERN)),
  ],
);

export const eventCategories = pgTable(
  'event_categories',
  {
    id: idColumn(),
    universeId: uuid().notNull(),
    name: text().notNull(),
    /** Key in the bundled icon set. */
    icon: text().notNull(),
    color: text().notNull(),
    sortKey: numeric({ mode: 'number' }).notNull().default(0),
  },
  (t) => [
    unique('event_categories_universe_name_uq').on(t.universeId, t.name),
    check('event_categories_color_format', matches(t.color, HEX_COLOR_PATTERN)),
  ],
);

/** Hive World, Forge World, Webway Gate… (U2). */
export const objectSubtypes = pgTable(
  'object_subtypes',
  {
    id: idColumn(),
    universeId: uuid().notNull(),
    baseType: text().notNull(),
    name: text().notNull(),
    icon: text(),
    description: jsonb().$type<RichText>(),
    defaultAppearance: jsonb().$type<Appearance>().notNull().default({}),
    sortKey: numeric({ mode: 'number' }).notNull().default(0),
  },
  (t) => [
    unique('object_subtypes_universe_type_name_uq').on(t.universeId, t.baseType, t.name),
    check('object_subtypes_base_type_check', oneOf(t.baseType, BASE_TYPES)),
  ],
);

/** Custom facts per universe (U2, U4). */
export const fieldDefinitions = pgTable(
  'field_definitions',
  {
    id: idColumn(),
    universeId: uuid().notNull(),
    key: text().notNull(),
    label: text().notNull(),
    valueType: text().notNull(),
    /** For example 'billion' or 'km'. */
    unit: text(),
    appliesToKind: text().notNull(),
    /** Narrows a celestial-object field to one base type. */
    appliesToBaseType: text(),
    appliesToSubtypeId: uuid(),
    /** Wiki infobox parameter names, such as {'population', 'pop'} (M7). */
    wikiAliases: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    sortKey: numeric({ mode: 'number' }).notNull().default(0),
  },
  (t) => [
    unique('field_definitions_universe_key_uq').on(t.universeId, t.key),
    check('field_definitions_key_format', matches(t.key, FIELD_KEY_PATTERN)),
    check('field_definitions_value_type_check', oneOf(t.valueType, FIELD_VALUE_TYPES)),
    check('field_definitions_applies_to_kind_check', oneOf(t.appliesToKind, ENTITY_KINDS)),
    check('field_definitions_applies_to_base_type_check', oneOf(t.appliesToBaseType, BASE_TYPES)),
  ],
);
