import { IconKey } from '../icons.ts';
import { z } from 'zod';
import { HexColor } from '../colors.ts';
import { Uuid } from '../ids.ts';
import { FIELD_KEY_MAX_LENGTH, FIELD_KEY_PATTERN, fieldKeyFrom } from '../patterns.ts';
import { RichText } from '../richtext/schema.ts';
import { Appearance } from '../schemas/appearance.ts';
import { FIELD_VALUE_TYPES } from '../schemas/field-value.ts';
import type { FormFieldDef } from './entity-forms.ts';
import { ENTITY_KINDS, entityKinds } from './entity-kinds.ts';
import { BASE_TYPES, objectTypes } from './object-types.ts';
import type { References } from './references.ts';

/**
 * Universe-level settings tables with plain CRUD (architecture.md §3.4, data-model §3.5):
 * generated routes, settings-page tables (M4-T1) and MCP tools. Each `schema` lists the
 * writable fields; `.optional()` fields may be left out on create.
 */
export interface ConfigResourceDef {
  plural: string;
  label: { one: string; many: string };
  schema: z.ZodObject;
  /**
   * The fields that identify a row within its universe, as its unique constraint does. Imports
   * match rows by them (M7-T4), and the last one is what references to the row are written as:
   * a group type is referred to by its name, a field definition by its key.
   */
  naturalKey: readonly string[];
  /** Id fields pointing at other settings rows (references.ts). */
  references?: References;
  /** For the API documentation, which LLM agents read. */
  description: string;
  /** A valid create body for the docs. A test checks it against the schema. */
  example: Record<string, unknown>;
  /**
   * The settings page's table columns, drawn by the form widgets (entity-forms.ts) and edited
   * in place. They cover every required field, so a new row can be filled in; a test checks
   * that. Order is `sortKey`, set by dragging rows, so it isn't a column.
   */
  columns: readonly FormFieldDef[];
  /** What a new row starts with, for required fields that have a sensible default. */
  defaults?: Record<string, unknown>;
  /**
   * Fields a new row fills in from another as it's typed, until the field is typed in itself:
   * a field definition's key from its label. Only new rows: an existing row's key is how
   * imports and facts refer to it, so it never changes on its own.
   */
  derived?: readonly { path: string; from: string; derive: (text: string) => string }[];
}

export function defineConfigResources<const T extends Record<string, ConfigResourceDef>>(
  resources: T,
): T {
  return resources;
}

const name = z.string().trim().min(1).max(100);

/** Select labels for the registries' own values. */
const BASE_TYPE_LABELS = Object.fromEntries(
  BASE_TYPES.map((type) => [type, objectTypes[type].label]),
);
const KIND_LABELS = Object.fromEntries(
  ENTITY_KINDS.map((kind) => [kind, entityKinds[kind].label.one]),
);
const VALUE_TYPE_LABELS = { text: 'Text', number: 'Number', date_text: 'Date', url: 'Link' };
/** New colors start as the default accent (ux.md §11). */
const NEW_COLOR = '#4fd1ff';
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
  /** Its pins' icon: `set:name` from the bundled sets (icons.ts, M6-T4). */
  icon: IconKey,
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
    .regex(
      new RegExp(FIELD_KEY_PATTERN),
      'Use lower-case letters, digits and underscores, starting with a letter.',
    )
    .max(FIELD_KEY_MAX_LENGTH),
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
    naturalKey: ['name'],
    references: { parentGroupTypeId: 'group_types' },
    label: { one: 'Group type', many: 'Group types' },
    schema: groupTypeSchema,
    description:
      'A kind of group in this universe, such as Segmentum, Sector or Sub-sector (T5). `layer` gathers types shown together (Administrative, Political). ' +
      '`parentGroupTypeId` makes types nest: groups of this type sit inside groups of the parent type.',
    example: { name: 'Sub-sector', layer: 'Administrative', defaultColor: '#c8a24a' },
    columns: [
      { path: 'name', widget: 'text', label: 'Name' },
      { path: 'layer', widget: 'text', label: 'Layer' },
      {
        path: 'parentGroupTypeId',
        widget: 'select',
        label: 'Parent type',
        options: { from: 'config', resource: 'group_types' },
      },
      { path: 'defaultColor', widget: 'color', label: 'Default color' },
    ],
    defaults: { defaultColor: NEW_COLOR },
  },
  event_categories: {
    plural: 'event-categories',
    naturalKey: ['name'],
    label: { one: 'Event category', many: 'Event categories' },
    schema: eventCategorySchema,
    description:
      'A category for events, with the icon and color of their pins, such as Battle or Discovery.',
    example: { name: 'Battle', icon: 'game-icons:crossed-swords', color: '#d9534f' },
    columns: [
      { path: 'name', widget: 'text', label: 'Name' },
      { path: 'icon', widget: 'icon', label: 'Icon' },
      { path: 'color', widget: 'color', label: 'Color' },
    ],
    defaults: { color: NEW_COLOR, icon: 'lucide:circle' },
  },
  object_subtypes: {
    plural: 'object-subtypes',
    naturalKey: ['baseType', 'name'],
    label: { one: 'Object subtype', many: 'Object subtypes' },
    schema: objectSubtypeSchema,
    description:
      'A universe-specific refinement of an object base type, such as Hive World (a planet) or Webway Gate (an anomaly) (U2). ' +
      "`defaultAppearance` sits between the base type's defaults and each object's overrides.",
    example: { baseType: 'planet', name: 'Hive World', icon: 'building-2' },
    columns: [
      { path: 'name', widget: 'text', label: 'Name' },
      {
        path: 'baseType',
        widget: 'select',
        label: 'Base type',
        options: { from: 'values', values: BASE_TYPES, labels: BASE_TYPE_LABELS },
      },
      { path: 'icon', widget: 'icon', label: 'Icon' },
      // The description and default look, in a dialog (M7-T2).
      { path: 'defaultAppearance', widget: 'defaultLook', label: 'Look' },
    ],
    defaults: { baseType: 'planet' },
  },
  field_definitions: {
    plural: 'field-definitions',
    naturalKey: ['key'],
    references: { appliesToSubtypeId: 'object_subtypes' },
    label: { one: 'Field definition', many: 'Field definitions' },
    schema: fieldDefinitionSchema,
    description:
      'A custom fact this universe records, such as Population or Tithe Grade (U2). Entities get values for it under /entities/{id}/facts. ' +
      '`valueType` is text, number, date_text or url. `appliesToKind` (and optionally a base type or subtype) says which entities it is for.',
    example: {
      key: 'population',
      label: 'Population',
      valueType: 'number',
      unit: 'billion',
      appliesToKind: 'celestial_object',
    },
    columns: [
      { path: 'label', widget: 'text', label: 'Label' },
      { path: 'key', widget: 'text', label: 'Key' },
      {
        path: 'valueType',
        widget: 'select',
        label: 'Value type',
        options: { from: 'values', values: FIELD_VALUE_TYPES, labels: VALUE_TYPE_LABELS },
      },
      { path: 'unit', widget: 'text', label: 'Unit' },
      {
        path: 'appliesToKind',
        widget: 'select',
        label: 'For',
        options: { from: 'values', values: ENTITY_KINDS, labels: KIND_LABELS },
      },
      {
        path: 'appliesToBaseType',
        widget: 'select',
        label: 'Base type',
        options: { from: 'values', values: BASE_TYPES, labels: BASE_TYPE_LABELS },
      },
      {
        path: 'appliesToSubtypeId',
        widget: 'select',
        label: 'Subtype',
        options: {
          from: 'config',
          resource: 'object_subtypes',
          matchField: 'baseType',
          matchOn: 'appliesToBaseType',
        },
      },
      // The infobox parameters "Fill from wiki" (M7-T3) reads into this field.
      { path: 'wikiAliases', widget: 'list', label: 'Wiki aliases' },
    ],
    defaults: { valueType: 'text', appliesToKind: 'celestial_object' },
    // "Tithe grade" fills in `tithe_grade`, so the key needn't be typed (from the M7 demo).
    derived: [{ path: 'key', from: 'label', derive: fieldKeyFrom }],
  },
});

export type ConfigResource = keyof typeof configResources;

/** A settings resource's id fields and what they point at (M7-T4). */
export function configReferencesOf(resource: ConfigResource): References {
  const def: ConfigResourceDef = configResources[resource];
  return def.references ?? {};
}
export const CONFIG_RESOURCES = Object.keys(configResources) as [
  ConfigResource,
  ...ConfigResource[],
];
