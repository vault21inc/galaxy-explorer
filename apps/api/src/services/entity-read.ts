import { EXTENSION_TABLES, schema, type Executor } from '@ge/db';
import {
  entityKinds,
  schemasFor,
  type EntityInclude,
  type EntityKind,
  type EntitySchemas,
} from '@ge/domain';
import { and, asc, eq, gt, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import { NotFound } from './errors.ts';
import { entityVisible, type Viewer } from './visibility.ts';

const {
  entities,
  entityImages,
  entityLinks,
  entityLocations,
  entityRelations,
  fieldValues,
  groupMembers,
} = schema;

/** An entity as the API returns it, plus any aspects asked for with `include`. */
export type EntityRead<K extends EntityKind> = z.infer<EntitySchemas<K>['read']> &
  Partial<Record<EntityInclude, unknown>>;

type Row = Record<string, unknown>;

/** The fields every kind's read shape has, for code that handles any kind. */
export interface EntityCore {
  id: string;
  kind: EntityKind;
  universeId: string;
  mapId: string | null;
  version: number;
}

/** Views any kind's read as its common fields. */
export function coreOf(read: object): EntityCore {
  return read as EntityCore;
}

/** The extension table of a kind, typed loosely: services handle every kind the same way. */
export function extensionTableOf(
  kind: EntityKind,
): (PgTable & { entityId: PgColumn; mapId: PgColumn }) | null {
  return EXTENSION_TABLES[kind];
}

/** Loads one entity of a kind, joined with its extension row; null if absent or invisible. */
async function loadRows(ex: Executor, kind: EntityKind, condition: SQL, viewer: Viewer) {
  const extension = extensionTableOf(kind);
  const where = and(eq(entities.kind, kind), condition, entityVisible(viewer));
  if (!extension) {
    const rows = await ex
      .select({ entity: entities })
      .from(entities)
      .where(where)
      .orderBy(asc(entities.id));
    return rows.map((row) => ({ entity: row.entity, extension: {} }));
  }
  const rows = await ex
    .select({ entity: entities, extension })
    .from(entities)
    .innerJoin(extension, eq(extension.entityId, entities.id))
    .where(where)
    .orderBy(asc(entities.id));
  return rows.map((row) => ({ entity: row.entity, extension: row.extension }));
}

/** Combines the base and extension rows into the kind's read shape. */
function toRead<K extends EntityKind>(kind: K, entity: Row, extension: Row): EntityRead<K> {
  const fields = Object.keys(entityKinds[kind].extension?.shape ?? {});
  const merged: Row = { ...entity };
  for (const field of fields) merged[field] = extension[field];
  merged.createdAt = (entity.createdAt as Date).toISOString();
  merged.updatedAt = (entity.updatedAt as Date).toISOString();
  return schemasFor(kind).read.parse(merged) as EntityRead<K>;
}

export async function getEntity<K extends EntityKind>(
  ex: Executor,
  kind: K,
  id: string,
  options: { viewer: Viewer; include?: readonly EntityInclude[] },
): Promise<EntityRead<K>> {
  const [row] = await loadRows(ex, kind, eq(entities.id, id), options.viewer);
  if (!row) throw new NotFound(entityKinds[kind].label.one.toLowerCase(), id);
  const read = toRead(kind, row.entity, row.extension);
  return { ...read, ...(await loadAspects(ex, kind, id, options.include ?? [])) };
}

export interface ListOptions {
  viewer: Viewer;
  /** Equality filters on extension fields, such as `{ parentId: null, baseType: 'planet' }`. */
  where?: Record<string, unknown>;
  status?: 'draft' | 'published';
  /** Case-insensitive substring of the plain-text name (M7 replaces this with search). */
  q?: string;
  /** The last id of the previous page. */
  cursor?: string;
  limit: number;
}

/** Lists one kind within a map (or universe, for universe-scoped kinds), in id order. */
export async function listEntities<K extends EntityKind>(
  ex: Executor,
  kind: K,
  scope: { mapId: string } | { universeId: string },
  options: ListOptions,
): Promise<{ items: EntityRead<K>[]; nextCursor: string | null }> {
  const conditions: (SQL | undefined)[] = [
    'mapId' in scope ? eq(entities.mapId, scope.mapId) : eq(entities.universeId, scope.universeId),
    options.status ? eq(entities.status, options.status) : undefined,
    options.q ? ilike(entities.namePlain, `%${escapeLike(options.q)}%`) : undefined,
    options.cursor ? gt(entities.id, options.cursor) : undefined,
  ];
  const extension = extensionTableOf(kind);
  for (const [field, value] of Object.entries(options.where ?? {})) {
    const column = extension
      ? (extension as unknown as Record<string, PgColumn | undefined>)[field]
      : undefined;
    if (!column) continue;
    conditions.push(value === null ? sql`${column} is null` : eq(column, value));
  }
  // One extra row tells whether another page follows.
  const rows = (await loadRows(ex, kind, and(...conditions) ?? sql`true`, options.viewer)).slice(
    0,
    options.limit + 1,
  );
  const page = rows.slice(0, options.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => toRead(kind, row.entity, row.extension)),
    nextCursor: rows.length > options.limit && last ? last.entity.id : null,
  };
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Loads the aspects asked for. Kinds that don't support an aspect simply return none. */
async function loadAspects(
  ex: Executor,
  kind: EntityKind,
  id: string,
  include: readonly EntityInclude[],
) {
  const result: Partial<Record<EntityInclude, unknown>> = {};
  const want = new Set(include);
  if (want.has('facts')) {
    result.facts = await ex
      .select()
      .from(fieldValues)
      .where(eq(fieldValues.entityId, id))
      .orderBy(asc(fieldValues.sortKey));
  }
  if (want.has('images')) {
    result.images = await ex
      .select()
      .from(entityImages)
      .where(eq(entityImages.entityId, id))
      .orderBy(asc(entityImages.sortKey));
  }
  if (want.has('links')) {
    result.links = await ex
      .select()
      .from(entityLinks)
      .where(eq(entityLinks.entityId, id))
      .orderBy(asc(entityLinks.sortKey));
  }
  if (want.has('relations')) {
    result.relations = (
      await ex
        .select()
        .from(entityRelations)
        .where(or(eq(entityRelations.fromEntityId, id), eq(entityRelations.toEntityId, id)))
        .orderBy(asc(entityRelations.sortKey))
    ).map(({ universeId: _universeId, createdAt: _createdAt, ...relation }) => relation);
  }
  if (want.has('location')) {
    const [location] = await ex
      .select()
      .from(entityLocations)
      .where(eq(entityLocations.entityId, id));
    result.location = location ? withoutMapId(location) : null;
  }
  if (want.has('members') && kind === 'group') {
    result.members = await ex
      .select({ objectId: groupMembers.objectId, isSpoiler: groupMembers.isSpoiler })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, id))
      .orderBy(asc(groupMembers.objectId));
  }
  return result;
}

function withoutMapId<T extends { mapId: string }>(row: T): Omit<T, 'mapId'> {
  const { mapId: _mapId, ...rest } = row;
  return rest;
}
