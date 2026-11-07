import { ACTOR_TYPES } from '@ge/domain';
import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { idColumn, oneOf } from './helpers.ts';

/**
 * History (data-model §3.7, §9). Every write runs in a change batch, and the audit trigger
 * (M1-T4) logs each changed row to `change_log`, which is what undo and revert replay.
 * These two tables are not audited themselves.
 */
export const changeBatches = pgTable(
  'change_batches',
  {
    id: idColumn(),
    universeId: uuid(),
    actorType: text().notNull(),
    actorId: uuid(),
    /** 'local', 'owner', 'token: claude-code', 'seed'… */
    actorLabel: text().notNull(),
    /** 'Moved 12 objects', 'MCP: objects.create'… */
    description: text().notNull(),
    /** Set when this batch reverts another one. */
    revertsBatchId: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('change_batches_actor_type_check', oneOf(t.actorType, ACTOR_TYPES)),
    index('change_batches_universe_idx').on(t.universeId, t.createdAt.desc()),
  ],
);

export const changeLog = pgTable(
  'change_log',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    batchId: uuid().notNull(),
    tableName: text().notNull(),
    op: text().notNull(),
    /** The row's primary-key columns. */
    pk: jsonb().notNull(),
    /** The row before the change; null for an insert. */
    before: jsonb(),
    /** The row after the change; null for a delete. */
    after: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('change_log_op_check', sql`${t.op} in ('INSERT', 'UPDATE', 'DELETE')`),
    index('change_log_batch_idx').on(t.batchId, t.id),
  ],
);
