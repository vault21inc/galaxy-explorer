import type { ActorType } from '@ge/domain';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../client.ts';
import { changeBatches } from '../schema/index.ts';

/** Who is making a change: shown in the History panel (data-model §3.7). */
export interface Actor {
  type: ActorType;
  /** The user or API token, when there is one (M8). */
  id?: string | null;
  /** 'local', 'owner', 'token: claude-code', 'seed'… */
  label: string;
}

export interface BatchOptions {
  /** The universe the change belongs to, so its history lists the batch. */
  universeId?: string | null;
  /** Set when this batch reverts another one. */
  revertsBatchId?: string | null;
}

/** A Drizzle transaction, as `withBatch` passes it to its callback. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Runs `fn` as one change batch (data-model §9): one transaction, one `change_batches` row,
 * and every row it changes logged to `change_log` by the audit trigger. A write to a content
 * table outside a batch fails with SQLSTATE GE400, by design.
 *
 * One user action or API request is one batch, which is also the unit of undo.
 */
export async function withBatch<T>(
  db: Database,
  actor: Actor,
  description: string,
  fn: (tx: Transaction, batchId: string) => Promise<T>,
  options: BatchOptions = {},
): Promise<{ result: T; batchId: string }> {
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(changeBatches)
      .values({
        actorType: actor.type,
        actorId: actor.id ?? null,
        actorLabel: actor.label,
        description,
        universeId: options.universeId ?? null,
        revertsBatchId: options.revertsBatchId ?? null,
      })
      .returning({ id: changeBatches.id });
    if (!batch) throw new Error('Creating the change batch returned no row.');
    // `true` makes the setting local to this transaction: the audit trigger reads it, and it
    // disappears at commit, so a pooled connection never carries it into the next request.
    await tx.execute(sql`select set_config('ge.batch_id', ${batch.id}, true)`);
    return { result: await fn(tx, batch.id), batchId: batch.id };
  });
}

/** A revert found a row that changed after the batch being reverted (SQLSTATE GE409). */
export class RevertConflictError extends Error {
  override readonly name = 'RevertConflictError';
  readonly table: string;
  readonly primaryKey: Record<string, unknown>;

  constructor(table: string, primaryKey: Record<string, unknown>) {
    super(`A row in ${table} changed after this batch, so it can't be reverted.`);
    this.table = table;
    this.primaryKey = primaryKey;
  }
}

/** The batch to revert doesn't exist (SQLSTATE GE404). */
export class BatchNotFoundError extends Error {
  override readonly name = 'BatchNotFoundError';
  readonly batchId: string;

  constructor(batchId: string) {
    super(`Change batch ${batchId} does not exist.`);
    this.batchId = batchId;
  }
}

/**
 * Undoes a batch, as a new batch that records `revertsBatchId` (data-model §9). Reverting that
 * new batch redoes the original. Nothing changes if any row has changed since the batch: the
 * whole revert is one transaction, and a conflict throws RevertConflictError.
 */
export async function revertBatch(
  db: Database,
  batchId: string,
  actor: Actor,
): Promise<{ batchId: string; rowsChanged: number }> {
  const [original] = await db
    .select({ description: changeBatches.description, universeId: changeBatches.universeId })
    .from(changeBatches)
    .where(eq(changeBatches.id, batchId));
  if (!original) throw new BatchNotFoundError(batchId);

  try {
    const { result, batchId: revertId } = await withBatch(
      db,
      actor,
      `Revert: ${original.description}`,
      async (tx) => {
        const rows = await tx.execute<{ count: number }>(
          sql`select ge_revert_batch(${batchId}) as count`,
        );
        return rows.rows[0]?.count ?? 0;
      },
      { universeId: original.universeId, revertsBatchId: batchId },
    );
    return { batchId: revertId, rowsChanged: result };
  } catch (error) {
    throw translateRevertError(error, batchId);
  }
}

function translateRevertError(error: unknown, batchId: string): unknown {
  const pgError = databaseErrorOf(error);
  if (pgError?.code === 'GE404') return new BatchNotFoundError(batchId);
  if (pgError?.code === 'GE409') {
    const detail = JSON.parse(pgError.detail ?? '{}') as {
      table?: string;
      pk?: Record<string, unknown>;
    };
    return new RevertConflictError(detail.table ?? 'unknown', detail.pk ?? {});
  }
  return error;
}

/** The Postgres error behind a Drizzle error, which wraps it as `cause`. */
export function databaseErrorOf(
  error: unknown,
): { code?: string; detail?: string; constraint?: string } | undefined {
  for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
    if (typeof (current as { code?: unknown }).code === 'string') {
      return current;
    }
  }
  return undefined;
}
