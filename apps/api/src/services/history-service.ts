import { isDeepStrictEqual } from 'node:util';
import { AUDITED_TABLES, schema, tableKey, type Executor } from '@ge/db';
import type { ActorType } from '@ge/domain';
import { and, desc, eq, gte, inArray, lt, lte, sql, type SQL } from 'drizzle-orm';
import { NotFound } from './errors.ts';
import { entityIdOf, summarizeEntities, summarizeOthers, type LogRow } from './history-summary.ts';
import { requireUniverse } from './lookup.ts';

/** Change history (data-model §9): the batches, what each changed, and what blocks a revert. */

const { changeBatches, changeLog, entities } = schema;

export interface HistoryFilters {
  actorType?: ActorType;
  actorLabel?: string;
  /** ISO timestamps bounding `createdAt`, inclusive. */
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}

/** A batch as the history list shows it, with the batches that reverted it. */
async function withReverts(ex: Executor, rows: (typeof changeBatches.$inferSelect)[]) {
  const ids = rows.map((row) => row.id);
  const reverts = ids.length
    ? await ex
        .select({ id: changeBatches.id, revertsBatchId: changeBatches.revertsBatchId })
        .from(changeBatches)
        .where(inArray(changeBatches.revertsBatchId, ids))
    : [];
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    revertedBy: reverts
      .filter((revert) => revert.revertsBatchId === row.id)
      .map((revert) => revert.id),
  }));
}

/** A universe's batches, newest first. Batch ids are time-ordered (UUIDv7), so the cursor is an id. */
export async function listHistory(ex: Executor, universeId: string, filters: HistoryFilters) {
  await requireUniverse(ex, universeId);
  const conditions: (SQL | undefined)[] = [
    eq(changeBatches.universeId, universeId),
    filters.actorType ? eq(changeBatches.actorType, filters.actorType) : undefined,
    filters.actorLabel ? eq(changeBatches.actorLabel, filters.actorLabel) : undefined,
    filters.from ? gte(changeBatches.createdAt, new Date(filters.from)) : undefined,
    filters.to ? lte(changeBatches.createdAt, new Date(filters.to)) : undefined,
    filters.cursor ? lt(changeBatches.id, filters.cursor) : undefined,
  ];
  const rows = await ex
    .select()
    .from(changeBatches)
    .where(and(...conditions))
    .orderBy(desc(changeBatches.id))
    .limit(filters.limit + 1);
  const page = rows.slice(0, filters.limit);
  return {
    items: await withReverts(ex, page),
    nextCursor: rows.length > filters.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

async function logOf(ex: Executor, batchId: string): Promise<LogRow[]> {
  const rows = await ex
    .select()
    .from(changeLog)
    .where(eq(changeLog.batchId, batchId))
    .orderBy(changeLog.id);
  return rows.map((row) => ({
    tableName: row.tableName,
    op: row.op as LogRow['op'],
    pk: row.pk as Record<string, unknown>,
    before: row.before as Record<string, unknown> | null,
    after: row.after as Record<string, unknown> | null,
  }));
}

/** Current names and kinds of the entities a set of log rows is about. */
async function namesOf(ex: Executor, rows: readonly LogRow[]) {
  const ids = [...new Set(rows.map(entityIdOf).filter((id): id is string => id !== undefined))];
  const found = ids.length
    ? await ex
        .select({ id: entities.id, name: entities.namePlain, kind: entities.kind })
        .from(entities)
        .where(inArray(entities.id, ids))
    : [];
  return new Map(found.map((row) => [row.id, { name: row.name, kind: row.kind }]));
}

/** One batch, summarized per entity: "Gudrun: x 120→140, name changed". */
export async function getBatchDetail(ex: Executor, batchId: string) {
  const [batch] = await ex.select().from(changeBatches).where(eq(changeBatches.id, batchId));
  if (!batch) throw new NotFound('change batch', batchId);
  const rows = await logOf(ex, batchId);
  const [summary] = await withReverts(ex, [batch]);
  return {
    batch: summary,
    rowCount: rows.length,
    entities: summarizeEntities(rows, await namesOf(ex, rows)),
    other: summarizeOthers(rows),
  };
}

export interface RevertConflict {
  table: string;
  primaryKey: Record<string, unknown>;
  /** The entity the row belongs to, and its name, when it's about one. */
  entityId: string | null;
  name: string | null;
}

const AUDITED = new Set(AUDITED_TABLES.map((table) => tableKey(table).name));

const content = (row: Record<string, unknown> | null) => {
  if (!row) return null;
  const { updated_at: _updatedAt, version: _version, ...rest } = row;
  return rest;
};

/**
 * Every row that changed after the batch, which makes its revert fail with GE409. It applies
 * `ge_revert_batch`'s rules to each row's last change in the batch, so the 409 can list all the
 * conflicting entities rather than only the first one the database stopped at.
 */
export async function findRevertConflicts(
  ex: Executor,
  batchId: string,
): Promise<RevertConflict[]> {
  const last = new Map<string, LogRow>();
  for (const row of await logOf(ex, batchId))
    last.set(`${row.tableName}:${JSON.stringify(row.pk)}`, row);

  const conflicts: LogRow[] = [];
  for (const row of last.values()) {
    if (!AUDITED.has(row.tableName)) continue;
    const match = Object.entries(row.pk).map(
      ([column, value]) => sql`t.${sql.identifier(column)}::text = ${String(value)}`,
    );
    const result = await ex.execute<{ row: Record<string, unknown> }>(
      sql`select to_jsonb(t) as row from ${sql.identifier(row.tableName)} t where ${sql.join(match, sql` and `)}`,
    );
    const current = content(result.rows[0]?.row ?? null);
    const conflict =
      row.op === 'INSERT'
        ? current !== null && !isDeepStrictEqual(current, content(row.after))
        : row.op === 'UPDATE'
          ? !isDeepStrictEqual(current, content(row.after))
          : current !== null && !isDeepStrictEqual(current, content(row.before));
    if (conflict) conflicts.push(row);
  }

  const names = await namesOf(ex, conflicts);
  return conflicts.map((row) => {
    const entityId = entityIdOf(row) ?? null;
    return {
      table: row.tableName,
      primaryKey: row.pk,
      entityId,
      name: entityId ? (names.get(entityId)?.name ?? null) : null,
    };
  });
}
