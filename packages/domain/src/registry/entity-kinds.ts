import type { z } from 'zod';
import { celestialObjectExtension, eventExtension, groupExtension } from './extensions.ts';

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
  /** Which shared aspects the kind supports (data-model §3.4). */
  aspects: {
    images: boolean;
    links: boolean;
    facts: boolean;
    relations: boolean;
    location: 'none' | 'optional' | 'required';
  };
  /**
   * Extension fields that are content, blacked out (set to null) while the whole entity is a
   * hidden spoiler (`redactEntity`'s `contentFields`).
   */
  contentFields: readonly string[];
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

const allAspects = { images: true, links: true, facts: true, relations: true } as const;

export const entityKinds = defineEntityKinds({
  celestial_object: {
    scope: 'map',
    plural: 'objects',
    label: { one: 'Object', many: 'Objects' },
    extension: celestialObjectExtension,
    aspects: { ...allAspects, location: 'none' },
    contentFields: [],
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
    aspects: { ...allAspects, location: 'none' },
    contentFields: [],
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
  // `route` arrives in M4.
  place: {
    scope: 'map',
    plural: 'places',
    label: { one: 'Place', many: 'Places' },
    extension: null,
    aspects: { ...allAspects, location: 'required' },
    contentFields: [],
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
    aspects: { ...allAspects, location: 'optional' },
    contentFields: ['dateText', 'dateSort'],
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

/** The kind names in registry order, as a tuple Zod can use. */
export const ENTITY_KINDS = Object.keys(entityKinds) as [EntityKind, ...EntityKind[]];
