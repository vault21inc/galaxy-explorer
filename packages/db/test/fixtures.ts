import { rt, type BaseType, type EntityKind } from '@ge/domain';
import { expect } from 'vitest';
import type { Database } from '../src/client.ts';
import {
  celestialObjects,
  entities,
  groupTypes,
  maps,
  objectGroups,
  universes,
} from '../src/schema/index.ts';

/**
 * Small builders for integration tests: each inserts the fewest rows that make a valid
 * record and returns its id. Constraint tests then change one thing and expect a failure.
 */

export async function insertUniverse(db: Database, slug = 'test-universe'): Promise<string> {
  const [row] = await db
    .insert(universes)
    .values({ slug, name: rt.plain(slug), namePlain: slug })
    .returning({ id: universes.id });
  return requireRow(row).id;
}

export async function insertMap(db: Database, universeId: string, slug = 'main'): Promise<string> {
  const [row] = await db
    .insert(maps)
    .values({ universeId, slug, name: rt.plain(slug), namePlain: slug })
    .returning({ id: maps.id });
  return requireRow(row).id;
}

export async function insertEntity(
  db: Database,
  values: { universeId: string; mapId: string | null; kind: EntityKind; externalKey?: string },
): Promise<string> {
  const [row] = await db
    .insert(entities)
    .values({ ...values, name: rt.plain(values.kind), namePlain: values.kind })
    .returning({ id: entities.id });
  return requireRow(row).id;
}

export async function insertObject(
  db: Database,
  values: { universeId: string; mapId: string; baseType?: BaseType; parentId?: string | null },
): Promise<string> {
  const entityId = await insertEntity(db, { ...values, kind: 'celestial_object' });
  await db.insert(celestialObjects).values({
    entityId,
    mapId: values.mapId,
    baseType: values.baseType ?? 'system',
    parentId: values.parentId ?? null,
  });
  return entityId;
}

export async function insertGroupType(
  db: Database,
  universeId: string,
  name = 'Sector',
): Promise<string> {
  const [row] = await db
    .insert(groupTypes)
    .values({ universeId, name, layer: 'Administrative', defaultColor: '#c8a24a' })
    .returning({ id: groupTypes.id });
  return requireRow(row).id;
}

export async function insertGroup(
  db: Database,
  values: { universeId: string; mapId: string; groupTypeId: string },
): Promise<string> {
  const entityId = await insertEntity(db, { ...values, kind: 'group' });
  await db.insert(objectGroups).values({
    entityId,
    mapId: values.mapId,
    groupTypeId: values.groupTypeId,
    outlineColor: '#c8a24a',
  });
  return entityId;
}

/** A universe with one map: the starting point of most tests. */
export async function insertUniverseWithMap(db: Database) {
  const universeId = await insertUniverse(db);
  const mapId = await insertMap(db, universeId);
  return { universeId, mapId };
}

/** Postgres error codes the constraint tests expect. */
export const PG = {
  foreignKey: '23503',
  unique: '23505',
  check: '23514',
} as const;

/**
 * Expects a write to fail with a Postgres error code and, when given, a named constraint.
 * Drizzle wraps driver errors, with the Postgres error as `cause`.
 */
export async function expectPgError(
  write: Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  const error: unknown = await write.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error, 'expected the write to fail').toBeDefined();
  const pgError = pgErrorOf(error);
  expect({ code: pgError.code, constraint: constraint && pgError.constraint }).toEqual({
    code,
    constraint,
  });
}

function pgErrorOf(error: unknown): { code?: string; constraint?: string } {
  const withCause = error as { cause?: unknown; code?: string };
  return withCause.code ? withCause : (withCause.cause ?? {});
}

function requireRow<T>(row: T | undefined): T {
  if (!row) throw new Error('Insert returned no row.');
  return row;
}
