import { schema, type Executor } from '@ge/db';
import { entityKinds, schemasFor, type EntityKind } from '@ge/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { NotFound, VersionConflict } from './errors.ts';
import { coreOf, extensionTableOf, getEntity, type EntityRead } from './entity-read.ts';
import { requireMap, requireUniverse, type Scope } from './lookup.ts';
import { checkExtension } from './rules/entities.ts';
import { derivedPlainText, sanitizeRichTextFields } from './sanitize.ts';
import { SEES_EVERYTHING } from './visibility.ts';

/**
 * Create, update and delete for every registered entity kind (architecture.md §4), with no
 * per-kind code beyond the rules. Each function takes a transaction from `withBatch`, so one
 * request (or one operation of a batch request) is one undoable change.
 *
 * Reads are in entity-read.ts.
 */

const { entities, celestialObjects, groupTypes } = schema;

/** The base-table fields every kind shares, as the create schema names them. */
const BASE_FIELDS = [
  'name',
  'summary',
  'description',
  'isSpoiler',
  'status',
  'externalKey',
] as const;

type Row = Record<string, unknown>;

function split(kind: EntityKind, input: Row): { base: Row; extension: Row } {
  const extensionFields = Object.keys(entityKinds[kind].extension?.shape ?? {});
  const base: Row = {};
  const extension: Row = {};
  for (const [key, value] of Object.entries(input)) {
    if ((BASE_FIELDS as readonly string[]).includes(key)) base[key] = value;
    else if (extensionFields.includes(key)) extension[key] = value;
  }
  return { base, extension };
}

/** Where a new entity goes: a map for map-scoped kinds, a universe for the others. */
export type EntityScope = { mapId: string } | { universeId: string };

async function resolveScope(tx: Executor, kind: EntityKind, scope: EntityScope): Promise<Scope> {
  if (entityKinds[kind].scope === 'map') {
    if (!('mapId' in scope)) throw new NotFound('map', '(none given)');
    const map = await requireMap(tx, scope.mapId);
    return { universeId: map.universeId, mapId: map.id };
  }
  if (!('universeId' in scope)) throw new NotFound('universe', '(none given)');
  await requireUniverse(tx, scope.universeId);
  return { universeId: scope.universeId, mapId: null };
}

export async function createEntity<K extends EntityKind>(
  tx: Executor,
  kind: K,
  scope: EntityScope,
  input: z.input<ReturnType<typeof schemasFor<K>>['create']>,
): Promise<EntityRead<K>> {
  const schemas = schemasFor(kind);
  const parsed = sanitizeRichTextFields(schemas.create, schemas.create.parse(input) as Row);
  const where = await resolveScope(tx, kind, scope);
  const { base, extension } = split(kind, parsed);
  await checkExtension(tx, kind, where, undefined, extension);

  const [entity] = await tx
    .insert(entities)
    .values({
      ...(base as typeof entities.$inferInsert),
      ...derivedPlainText(parsed),
      kind,
      ...where,
    })
    .returning({ id: entities.id });
  if (!entity) throw new Error('Inserting the entity returned no row.');

  const table = extensionTableOf(kind);
  if (table) {
    await tx.insert(table).values({
      ...(await extensionDefaults(tx, kind, extension)),
      ...extension,
      entityId: entity.id,
      mapId: where.mapId,
    } as never);
  }
  return getEntity(tx, kind, entity.id, { viewer: SEES_EVERYTHING });
}

/** Defaults the service fills in: a group's outline color comes from its group type. */
async function extensionDefaults(tx: Executor, kind: EntityKind, extension: Row): Promise<Row> {
  if (kind === 'group' && extension.outlineColor === undefined) {
    const [type] = await tx
      .select({ color: groupTypes.defaultColor })
      .from(groupTypes)
      .where(eq(groupTypes.id, extension.groupTypeId as string));
    return type ? { outlineColor: type.color } : {};
  }
  return {};
}

export async function updateEntity<K extends EntityKind>(
  tx: Executor,
  kind: K,
  id: string,
  input: z.input<ReturnType<typeof schemasFor<K>>['update']>,
): Promise<EntityRead<K>> {
  const schemas = schemasFor(kind);
  const { version, ...changes } = sanitizeRichTextFields(
    schemas.update,
    schemas.update.parse(input) as Row,
  );
  const current = await getEntity(tx, kind, id, { viewer: SEES_EVERYTHING });
  if (coreOf(current).version !== version) throw new VersionConflict(current);

  const { base, extension } = split(kind, changes);
  const scope: Scope = { universeId: coreOf(current).universeId, mapId: coreOf(current).mapId };
  if (Object.keys(extension).length > 0) {
    await checkExtension(tx, kind, scope, id, { ...(current as Row), ...extension });
  }

  // Any change to the base or extension bumps the entity's version (architecture.md §4). The
  // version in the WHERE clause guards against a write that slipped in since the read.
  const updated = await tx
    .update(entities)
    .set({
      ...(base as Partial<typeof entities.$inferInsert>),
      ...derivedPlainText(changes),
      version: sql`${entities.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(entities.id, id), eq(entities.version, version)))
    .returning({ id: entities.id });
  if (updated.length === 0)
    throw new VersionConflict(await getEntity(tx, kind, id, { viewer: SEES_EVERYTHING }));

  const table = extensionTableOf(kind);
  if (table && Object.keys(extension).length > 0) {
    await tx.update(table).set(extension).where(eq(table.entityId, id));
  }
  return getEntity(tx, kind, id, { viewer: SEES_EVERYTHING });
}

/**
 * Deletes an entity and everything that depends on it (data-model §11). For an object that
 * includes its whole subtree: the database cascade removes the children's extension rows but
 * not their entity rows, so the subtree's entities are deleted here, in one statement.
 */
export async function deleteEntity(
  tx: Executor,
  kind: EntityKind,
  id: string,
  version: number,
): Promise<void> {
  const current = await getEntity(tx, kind, id, { viewer: SEES_EVERYTHING });
  if (coreOf(current).version !== version) throw new VersionConflict(current);
  if (kind === 'celestial_object') {
    const subtree = sql`(
      with recursive subtree(id) as (
        select ${celestialObjects.entityId} from ${celestialObjects} where ${celestialObjects.entityId} = ${id}
        union all
        select c.entity_id from celestial_objects c join subtree s on c.parent_id = s.id
      ) select id from subtree)`;
    await tx.delete(entities).where(inArray(entities.id, subtree));
  } else {
    await tx.delete(entities).where(eq(entities.id, id));
  }
}
