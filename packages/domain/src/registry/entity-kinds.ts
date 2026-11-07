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
}

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
  },
  group: {
    scope: 'map',
    plural: 'groups',
    label: { one: 'Group', many: 'Groups' },
    extension: groupExtension,
    aspects: { ...allAspects, location: 'none' },
    contentFields: [],
  },
  // `route` arrives in M4.
  place: {
    scope: 'map',
    plural: 'places',
    label: { one: 'Place', many: 'Places' },
    extension: null,
    aspects: { ...allAspects, location: 'required' },
    contentFields: [],
  },
  event: {
    scope: 'map',
    plural: 'events',
    label: { one: 'Event', many: 'Events' },
    extension: eventExtension,
    aspects: { ...allAspects, location: 'optional' },
    contentFields: ['dateText', 'dateSort'],
  },
  character: {
    scope: 'universe',
    plural: 'characters',
    label: { one: 'Character', many: 'Characters' },
    extension: null,
    aspects: { ...allAspects, location: 'none' },
    contentFields: [],
  },
});

export type EntityKind = keyof typeof entityKinds;

/** The kind names in registry order, as a tuple Zod can use. */
export const ENTITY_KINDS = Object.keys(entityKinds) as [EntityKind, ...EntityKind[]];
