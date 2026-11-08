import type { ConfigResource, EntityKind } from '@ge/domain';
import { celestialObjects, events, objectGroups } from './entities.ts';
import { eventCategories, fieldDefinitions, groupTypes, objectSubtypes } from './settings.ts';

/**
 * Which table holds each entity kind's extension fields (architecture.md §3.1: "the binding to
 * the extension table"). Kinds without an extension in the registry map to null. A test checks
 * that this agrees with the registry and that every extension field is a column of its table.
 */
export const EXTENSION_TABLES = {
  celestial_object: celestialObjects,
  group: objectGroups,
  place: null,
  event: events,
  character: null,
} as const satisfies Record<EntityKind, unknown>;

/** Which table holds each config resource (the universe settings tables, data-model §3.5). */
export const CONFIG_TABLES = {
  group_types: groupTypes,
  event_categories: eventCategories,
  object_subtypes: objectSubtypes,
  field_definitions: fieldDefinitions,
} as const satisfies Record<ConfigResource, unknown>;
