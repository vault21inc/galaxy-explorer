import type { z } from 'zod';
import { REGION_SHAPES } from '../schemas/appearance.ts';
import type { EntityFormDef, FormFieldDef } from './entity-forms.ts';
import {
  celestialObjectExtension,
  eventExtension,
  groupExtension,
  routeExtension,
} from './extensions.ts';
import { PLANET_FIELDS } from './planet-form.ts';
import type { References } from './references.ts';

/**
 * Entity kinds (architecture.md §3.1): everything the author writes about. Routes, query
 * hooks, MCP tools, forms, import/export, clone rules and the contract tests are all derived
 * from this one definition. A new kind is one entry here plus a migration.
 */
export interface EntityKindDef {
  /** 'map': belongs to one map. 'universe': shared by every map of the universe. */
  scope: 'map' | 'universe';
  /** URL segment, MCP tool prefix and query-key prefix. */
  plural: string;
  label: { one: string; many: string };
  /** The extension table's fields, or null if the kind has none. */
  extension: z.ZodObject | null;
  /**
   * The extension's id fields and what each points at (references.ts). Import and export
   * write them as references instead of ids (M7-T4); a test checks every id field is listed.
   */
  references?: References;
  /** Which shared aspects the kind supports (data-model §3.4). */
  aspects: {
    images: boolean;
    links: boolean;
    facts: boolean;
    relations: boolean;
    location: 'none' | 'optional' | 'required';
    /** Has member objects, under /groups/{id}/members (data-model §3.3). */
    members: boolean;
    /** Has ordered waypoints, under /routes/{id}/waypoints (data-model §3.3, M4-T7). */
    waypoints: boolean;
  };
  /**
   * Extension fields that are content, blacked out (set to null) while the whole entity is a
   * hidden spoiler (`redactEntity`'s `contentFields`).
   */
  contentFields: readonly string[];
  /**
   * The editor form's kind-specific fields and their widgets (entity-forms.ts). Data, not
   * React: the web app renders it, and a test checks every path against the update schema.
   */
  form: EntityFormDef;
  /**
   * For the API documentation, which LLM agents read: what the kind is, its units and its
   * rules, in a few sentences.
   */
  description: string;
  /** A valid create body for the docs. A test checks it against the create schema. */
  example: Record<string, unknown>;
}

/** Stands in for a real id in examples. */
export const EXAMPLE_ID = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b';

export function defineEntityKinds<const T extends Record<string, EntityKindDef>>(kinds: T): T {
  return kinds;
}

const allAspects = {
  images: true,
  links: true,
  facts: true,
  relations: true,
  members: false,
  waypoints: false,
} as const;

/** Kinds whose form has only the shared fields. */
const SHARED_FORM: EntityFormDef = { details: [], appearance: [] };

/** The region shapes in the form's words (D-25). */
const REGION_SHAPE_LABELS = {
  sphere: 'Round cloud',
  disc: 'Flat cloud',
  storm: 'Storm, seen from above',
  rift: 'Rift, along a curve',
} satisfies Record<(typeof REGION_SHAPES)[number], string>;

const STORM = { path: 'appearance.region.shape', in: ['storm'] } as const;

/**
 * A nebula's or anomaly's region fields (M4-T6): the shape and its look, then each shape's own
 * fields, shown only for that shape.
 */
const REGION_FIELDS: readonly FormFieldDef[] = [
  {
    path: 'appearance.region.shape',
    widget: 'select',
    label: 'Shape',
    options: { from: 'values', values: REGION_SHAPES, labels: REGION_SHAPE_LABELS },
    showWhen: 'regionType',
  },
  {
    path: 'appearance.region.color',
    widget: 'color',
    label: 'Region color',
    showWhen: 'regionType',
  },
  {
    path: 'appearance.region.radius',
    widget: 'number',
    label: 'Radius (ly)',
    hint: 'A rift’s half-width. In edit mode, drag the ring on the map.',
    showWhen: 'regionType',
  },
  {
    path: 'appearance.region.density',
    widget: 'number',
    label: 'Density',
    hint: '0 to 1: how many clouds it’s made of.',
    showWhen: ['regionType', { path: 'appearance.region.shape', in: ['sphere', 'disc', 'rift'] }],
  },
  {
    path: 'appearance.region.innerRadius',
    widget: 'number',
    label: 'Core',
    hint: 'The darker core, as a share of the radius (0 to 0.9).',
    showWhen: ['regionType', STORM],
  },
  {
    path: 'appearance.region.rimColor',
    widget: 'color',
    label: 'Rim color',
    showWhen: ['regionType', STORM],
  },
  {
    path: 'appearance.region.filaments',
    widget: 'number',
    label: 'Filaments',
    hint: '0 to 1: how strongly streaks cross the disc.',
    showWhen: ['regionType', STORM],
  },
  {
    path: 'appearance.region.gaps',
    widget: 'rimGaps',
    label: 'Gaps in the rim',
    showWhen: ['regionType', STORM],
  },
  {
    path: 'appearance.region.rotationDeg',
    widget: 'number',
    label: 'Rotation (°)',
    showWhen: ['regionType', STORM],
  },
  {
    path: 'appearance.region.texture',
    widget: 'select',
    label: 'Picture',
    options: {
      from: 'values',
      values: ['procedural', 'upload'],
      labels: { procedural: 'Generated from these fields', upload: 'An uploaded image' },
    },
    showWhen: ['regionType', STORM],
  },
  {
    widget: 'imageRole',
    role: 'region_texture',
    path: 'appearance.region.texture',
    value: 'upload',
    label: 'Storm image',
    hint: 'A top-down picture, placed by the radius and rotation.',
    showWhen: ['regionType', STORM, { path: 'appearance.region.texture', in: ['upload'] }],
  },
  {
    path: 'appearance.region.path',
    widget: 'riftPath',
    label: 'Points',
    showWhen: ['regionType', { path: 'appearance.region.shape', in: ['rift'] }],
  },
];

export const entityKinds = defineEntityKinds({
  celestial_object: {
    scope: 'map',
    plural: 'objects',
    label: { one: 'Object', many: 'Objects' },
    extension: celestialObjectExtension,
    references: { parentId: 'entity', orbitCenterId: 'entity', subtypeId: 'object_subtypes' },
    aspects: { ...allAspects, location: 'none' },
    contentFields: [],
    form: {
      details: [
        {
          path: 'subtypeId',
          widget: 'select',
          label: 'Subtype',
          options: { from: 'config', resource: 'object_subtypes', matchField: 'baseType' },
        },
        {
          path: 'explorable',
          widget: 'switch',
          label: 'Explorable',
          hint: 'Opens a view of its own.',
          showWhen: 'explorableType',
        },
        {
          path: 'orbitCenterId',
          widget: 'select',
          label: 'Orbits',
          hint: 'One of its system’s stars, or the center (D-29).',
          options: { from: 'siblings', baseType: 'star', noneLabel: 'The system’s center' },
          showWhen: ['systemChild', { path: 'baseType', notIn: ['star'] }],
        },
        { widget: 'position', label: 'Position' },
      ],
      appearance: [
        { path: 'appearance.color', widget: 'color', label: 'Color' },
        { path: 'appearance.scale', widget: 'perViewScale', label: 'Size' },
        {
          path: 'appearance.labelPriority',
          widget: 'number',
          label: 'Label priority',
          hint: 'Higher labels stay visible when labels collide.',
        },
        {
          path: 'appearance.showOrbit',
          widget: 'switch',
          label: 'Orbit ring',
          hint: 'Its orbit, drawn in the system view.',
          showWhen: 'systemChild',
        },
        ...REGION_FIELDS,
        ...PLANET_FIELDS,
      ],
    },
    description:
      'A celestial object: a system, star, planet, moon, asteroid belt, station, nebula, anomaly, black hole or marker (`baseType`). ' +
      'Objects nest: `parentId` is the object it sits inside, or null for the top level of the galaxy. Which parents a base type allows is fixed (a planet goes in a system or the galaxy; a moon in a planet). ' +
      "x, y, z are a position in the parent's frame: light-years in the galaxy (+Y is galactic north), system units (roughly AU) inside a system, and body radii around a planet. " +
      '`explorable` makes systems open a system view and planets or moons an orbit view. `appearance` holds only overrides of the type and subtype defaults.',
    example: {
      name: { format: 'plain', source: 'Gudrun System' },
      summary: { format: 'markdown', source: 'Capital of the **Helican** sub-sector.' },
      baseType: 'system',
      explorable: true,
      x: 12345.6,
      y: -40,
      z: 8820.1,
    },
  },
  group: {
    scope: 'map',
    plural: 'groups',
    label: { one: 'Group', many: 'Groups' },
    extension: groupExtension,
    references: { groupTypeId: 'group_types', parentGroupId: 'entity' },
    aspects: { ...allAspects, location: 'none', members: true },
    contentFields: [],
    form: {
      details: [
        {
          path: 'groupTypeId',
          widget: 'select',
          label: 'Group type',
          options: { from: 'config', resource: 'group_types' },
        },
        {
          path: 'parentGroupId',
          widget: 'select',
          label: 'Parent group',
          options: { from: 'parentGroups' },
          hint: 'A group of the parent type, such as the sector a sub-sector is in.',
        },
      ],
      appearance: [{ path: 'outlineColor', widget: 'color', label: 'Outline color' }],
    },
    description:
      'A named set of top-level objects drawn as a colored outline: a sector, territory or faction. ' +
      "Its `groupTypeId` (a universe setting) decides which layer it belongs to and how groups nest: a Sub-sector's `parentGroupId` must be a Sector. " +
      "An object is in at most one group of each type. Members are managed under /groups/{id}/members. `outlineColor` defaults to the group type's color.",
    example: {
      name: { format: 'plain', source: 'Helican Sub-sector' },
      groupTypeId: EXAMPLE_ID,
      parentGroupId: null,
      outlineColor: '#c8a24a',
    },
  },
  route: {
    scope: 'map',
    plural: 'routes',
    label: { one: 'Route', many: 'Routes' },
    extension: routeExtension,
    aspects: { ...allAspects, location: 'none', waypoints: true },
    contentFields: [],
    form: {
      details: [],
      appearance: [
        { path: 'style.color', widget: 'color', label: 'Line color' },
        {
          path: 'style.widthPx',
          widget: 'number',
          label: 'Width (px)',
          hint: '1 to 6 pixels on screen.',
        },
        { path: 'style.dashed', widget: 'switch', label: 'Dashed' },
      ],
    },
    description:
      'A line through objects in order: a trade lane, warp route or campaign path (U6). Its waypoints, the objects it passes through, are set as an ordered list of object ids with PUT /routes/{id}/waypoints (or the batch op setWaypoints); ' +
      "they are top-level objects on the route's map, and one may come again later (a round trip) but not twice in a row. `style` holds the line color, width in pixels and dashing.",
    example: {
      name: { format: 'plain', source: 'Hydraphur Run' },
      style: { color: '#c8a24a', widthPx: 2, dashed: true },
    },
  },
  place: {
    scope: 'map',
    plural: 'places',
    label: { one: 'Place', many: 'Places' },
    extension: null,
    aspects: { ...allAspects, location: 'required' },
    contentFields: [],
    form: SHARED_FORM,
    description:
      'A lasting place, such as a city, fortress or ruin. Where it is lives in its location (PUT /entities/{id}/location): ' +
      'on a planet or moon at a latitude and longitude, at an object, at a position in space, or at another place.',
    example: {
      name: { format: 'plain', source: 'Hive Primus' },
      summary: { format: 'plain', source: 'The largest hive city on Gudrun.' },
    },
  },
  event: {
    scope: 'map',
    plural: 'events',
    label: { one: 'Event', many: 'Events' },
    extension: eventExtension,
    references: { categoryId: 'event_categories' },
    aspects: { ...allAspects, location: 'optional' },
    contentFields: ['dateText', 'dateSort'],
    form: {
      details: [
        {
          path: 'dateText',
          widget: 'text',
          label: 'Date',
          hint: "In the universe's own format.",
          hintFrom: 'dateFormatNotes',
        },
        { path: 'dateSort', widget: 'number', label: 'Sort key', hint: 'Orders events by date.' },
        {
          path: 'categoryId',
          widget: 'select',
          label: 'Category',
          options: { from: 'config', resource: 'event_categories' },
        },
      ],
      appearance: [],
    },
    description:
      'Something that happened. `dateText` is free text in the universe\'s own date format (such as "240.M41"); `dateSort` is an optional number to order events by. ' +
      'It may have a location like a place, and characters relate to it with the `participant` relation.',
    example: {
      name: { format: 'plain', source: 'Fall of Gudrun' },
      dateText: '240.M41',
      dateSort: 240.41,
      categoryId: null,
    },
  },
  character: {
    scope: 'universe',
    plural: 'characters',
    label: { one: 'Character', many: 'Characters' },
    extension: null,
    aspects: { ...allAspects, location: 'none' },
    contentFields: [],
    form: SHARED_FORM,
    description:
      'A person or being, shared by every map of the universe (characters belong to the universe, not to one map). ' +
      'Link a character to the events they took part in with the `participant` relation.',
    example: {
      name: { format: 'plain', source: 'Gregor Eisenhorn' },
      summary: { format: 'markdown', source: 'Inquisitor of the *Ordo Xenos*.' },
    },
  },
});

export type EntityKind = keyof typeof entityKinds;

/** A kind's id fields and what they point at (M7-T4); none for kinds without any. */
export function referencesOf(kind: EntityKind): References {
  const def: EntityKindDef = entityKinds[kind];
  return def.references ?? {};
}

/** The kind names in registry order, as a tuple Zod can use. */
export const ENTITY_KINDS = Object.keys(entityKinds) as [EntityKind, ...EntityKind[]];
