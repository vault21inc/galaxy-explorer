import { z } from 'zod';
import { HexColor } from '../colors.ts';
import { Uuid } from '../ids.ts';
import { RichText } from '../richtext/schema.ts';
import { Appearance } from '../schemas/appearance.ts';
import { FIELD_VALUE_TYPES } from '../schemas/field-value.ts';
import { ENTITY_KINDS } from './entity-kinds.ts';
import { BASE_TYPES } from './object-types.ts';

/**
 * Universe-level settings tables with plain CRUD (architecture.md §3.4, data-model §3.5):
 * generated routes, settings-page tables and MCP tools. Each `schema` lists the writable
 * fields; `.optional()` fields may be left out on create.
 */
export interface ConfigResourceDef {
  plural: string;
  label: { one: string; many: string };
  schema: z.ZodObject;
}

export function defineConfigResources<const T extends Record<string, ConfigResourceDef>>(
  resources: T,
): T {
  return resources;
}

const name = z.string().trim().min(1).max(100);
const sortKey = z.number().optional();

export const groupTypeSchema = z.object({
  /** Segmentum, Sector, Sub-sector… (T5). */
  name,
  /** The layer the type belongs to, such as 'Administrative' or 'Political'. */
  layer: name,
  /** The type groups of this type nest inside, if any. */
  parentGroupTypeId: Uuid.nullable().optional(),
  defaultColor: HexColor,
  sortKey,
});

export const eventCategorySchema = z.object({
  name,
  /** Key in the bundled icon set. */
  icon: z.string().min(1).max(100),
  color: HexColor,
  sortKey,
});

export const objectSubtypeSchema = z.object({
  /** The base type this subtype refines: Hive World is a planet (U2). */
  baseType: z.enum(BASE_TYPES),
  name,
  icon: z.string().min(1).max(100).nullable().optional(),
  description: RichText.nullable().optional(),
  /** Partial appearance between the base type's defaults and each object's overrides. */
  defaultAppearance: Appearance.optional(),
  sortKey,
});

export const fieldDefinitionSchema = z.object({
  /** Stable key, such as 'population'. */
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lower-case letters, digits and underscores.')
    .max(64),
  label: name,
  valueType: z.enum(FIELD_VALUE_TYPES),
  /** Such as 'billion' or 'km'. */
  unit: z.string().max(50).nullable().optional(),
  appliesToKind: z.enum(ENTITY_KINDS),
  /** Narrows a celestial-object field to one base type. */
  appliesToBaseType: z.enum(BASE_TYPES).nullable().optional(),
  appliesToSubtypeId: Uuid.nullable().optional(),
  /** Wiki infobox parameter names that fill this field (M7). */
  wikiAliases: z.array(z.string().min(1).max(100)).max(20).optional(),
  sortKey,
});

export const configResources = defineConfigResources({
  group_types: {
    plural: 'group-types',
    label: { one: 'Group type', many: 'Group types' },
    schema: groupTypeSchema,
  },
  event_categories: {
    plural: 'event-categories',
    label: { one: 'Event category', many: 'Event categories' },
    schema: eventCategorySchema,
  },
  object_subtypes: {
    plural: 'object-subtypes',
    label: { one: 'Object subtype', many: 'Object subtypes' },
    schema: objectSubtypeSchema,
  },
  field_definitions: {
    plural: 'field-definitions',
    label: { one: 'Field definition', many: 'Field definitions' },
    schema: fieldDefinitionSchema,
  },
});

export type ConfigResource = keyof typeof configResources;
export const CONFIG_RESOURCES = Object.keys(configResources) as [
  ConfigResource,
  ...ConfigResource[],
];
