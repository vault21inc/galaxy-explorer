import type { EntityKind } from '@ge/domain';
import { celestialObjects, events, objectGroups } from './entities.ts';

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
