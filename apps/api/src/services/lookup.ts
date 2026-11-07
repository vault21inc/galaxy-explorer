import { schema, type Executor } from '@ge/db';
import { eq } from 'drizzle-orm';
import { NotFound, RuleViolation } from './errors.ts';

/**
 * Small loaders the services and rules share. Each takes the ids a client sent and checks they
 * belong where the client says: never trust ids from the client (AGENTS.md, security).
 */

const { entities, celestialObjects, maps, universes } = schema;

export async function requireUniverse(ex: Executor, universeId: string) {
  const [row] = await ex.select().from(universes).where(eq(universes.id, universeId));
  if (!row) throw new NotFound('universe', universeId);
  return row;
}

export async function requireMap(ex: Executor, mapId: string) {
  const [row] = await ex.select().from(maps).where(eq(maps.id, mapId));
  if (!row) throw new NotFound('map', mapId);
  return row;
}

/** The scope a referenced row must share with the record that points at it. */
export interface Scope {
  universeId: string;
  mapId: string | null;
}

/**
 * Loads an entity a field refers to, checking it exists in the same universe (and map, for
 * map-scoped references). The message names the field, so the client knows what to fix.
 */
export async function requireReferencedEntity(
  ex: Executor,
  id: string,
  scope: Scope,
  path: string,
  options: { sameMap: boolean } = { sameMap: true },
) {
  const [row] = await ex.select().from(entities).where(eq(entities.id, id));
  if (row?.universeId !== scope.universeId) {
    throw new RuleViolation(`${path} doesn't name an entity in this universe.`, path);
  }
  if (options.sameMap && row.mapId !== scope.mapId) {
    throw new RuleViolation(`${path} names an entity on another map.`, path);
  }
  return row;
}

/** Loads a celestial object a field refers to, in the same map. */
export async function requireReferencedObject(
  ex: Executor,
  id: string,
  scope: Scope,
  path: string,
) {
  const entity = await requireReferencedEntity(ex, id, scope, path);
  const [object] = await ex
    .select()
    .from(celestialObjects)
    .where(eq(celestialObjects.entityId, id));
  if (!object) throw new RuleViolation(`${path} doesn't name a celestial object.`, path);
  return { ...object, namePlain: entity.namePlain };
}

/** Loads a universe-level settings row (a group type, subtype, …) in the same universe. */
export function requireInUniverse<Row extends { universeId: string }>(
  rows: Row[],
  scope: Scope,
  path: string,
  what: string,
): Row {
  const [row] = rows;
  if (row?.universeId !== scope.universeId) {
    throw new RuleViolation(`${path} doesn't name a ${what} in this universe.`, path);
  }
  return row;
}
