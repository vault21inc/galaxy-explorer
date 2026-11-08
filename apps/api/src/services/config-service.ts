import { CONFIG_TABLES, schema, type Executor } from '@ge/db';
import { configSchemasFor, type ConfigResource } from '@ge/domain';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { NotFound, RuleViolation } from './errors.ts';
import { requireInUniverse, requireUniverse } from './lookup.ts';
import { sanitizeRichTextFields } from './sanitize.ts';

/**
 * Plain CRUD for the universe settings tables (architecture.md §3.4), for every config resource
 * in the registry. They have no version: the last write wins.
 */

type ConfigTable = PgTable & { id: PgColumn; universeId: PgColumn };
type Row = Record<string, unknown>;

const tableOf = (resource: ConfigResource) => CONFIG_TABLES[resource] as unknown as ConfigTable;

/**
 * Fields that point at another settings row, and which table it's in. They must name a row in
 * the same universe.
 */
const REFERENCES: Record<string, PgTable & { id: PgColumn; universeId: PgColumn }> = {
  parentGroupTypeId: schema.groupTypes,
  appliesToSubtypeId: schema.objectSubtypes,
};

async function checkReferences(
  ex: Executor,
  universeId: string,
  values: Row,
  selfId?: string,
): Promise<void> {
  for (const [field, table] of Object.entries(REFERENCES)) {
    const id = values[field];
    if (typeof id !== 'string') continue;
    if (field === 'parentGroupTypeId' && id === selfId) continue; // a type may nest in itself
    const rows = (await ex.select().from(table).where(eq(table.id, id))) as {
      universeId: string;
    }[];
    requireInUniverse(rows, { universeId, mapId: null }, `/${field}`, 'setting');
  }
}

function toRead(resource: ConfigResource, row: Row) {
  return configSchemasFor(resource).read.parse(row);
}

export async function createConfig(
  tx: Executor,
  resource: ConfigResource,
  universeId: string,
  input: unknown,
) {
  const schemas = configSchemasFor(resource);
  const values = sanitizeRichTextFields(schemas.create, schemas.create.parse(input) as Row);
  await requireUniverse(tx, universeId);
  await checkReferences(tx, universeId, values);
  const table = tableOf(resource);
  const [row] = (await tx
    .insert(table)
    .values({ ...values, universeId } as never)
    .returning()) as Row[];
  if (!row) throw new Error('Insert returned no row.');
  return toRead(resource, row);
}

export async function getConfig(ex: Executor, resource: ConfigResource, id: string) {
  const table = tableOf(resource);
  const [row] = (await ex.select().from(table).where(eq(table.id, id))) as Row[];
  if (!row) throw new NotFound(resource.replace('_', ' ').replace(/s$/, ''), id);
  return toRead(resource, row);
}

export async function listConfig(
  ex: Executor,
  resource: ConfigResource,
  universeId: string,
  options: { cursor?: string; limit: number },
) {
  const table = tableOf(resource);
  const rows = (await ex
    .select()
    .from(table)
    .where(
      and(
        eq(table.universeId, universeId),
        options.cursor ? gt(table.id, options.cursor) : undefined,
      ),
    )
    .orderBy(asc(table.id))
    .limit(options.limit + 1)) as Row[];
  const page = rows.slice(0, options.limit);
  return {
    items: page.map((row) => toRead(resource, row)),
    nextCursor:
      rows.length > options.limit ? ((page.at(-1)?.id as string | undefined) ?? null) : null,
  };
}

export async function updateConfig(
  tx: Executor,
  resource: ConfigResource,
  id: string,
  input: unknown,
) {
  const schemas = configSchemasFor(resource);
  const values = sanitizeRichTextFields(schemas.update, schemas.update.parse(input) as Row);
  const current = await getConfig(tx, resource, id);
  await checkReferences(tx, current.universeId, values, id);
  if (
    resource === 'object_subtypes' &&
    'baseType' in values &&
    values.baseType !== (current as Row).baseType
  ) {
    throw new RuleViolation(
      "A subtype's base type can't change; create a new subtype instead.",
      '/baseType',
    );
  }
  const table = tableOf(resource);
  if (Object.keys(values).length > 0) await tx.update(table).set(values).where(eq(table.id, id));
  return getConfig(tx, resource, id);
}

/** Deletes a settings row. Rows still in use are protected by the database (data-model §11). */
export async function deleteConfig(
  tx: Executor,
  resource: ConfigResource,
  id: string,
): Promise<void> {
  await getConfig(tx, resource, id);
  const table = tableOf(resource);
  await tx.delete(table).where(eq(table.id, id));
}
