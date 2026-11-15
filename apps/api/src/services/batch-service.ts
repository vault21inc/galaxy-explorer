import { schema, type Executor } from '@ge/db';
import { entityKinds, OPERATION_REFERENCE, type BatchOperation, type EntityKind } from '@ge/domain';
import { eq, sql } from 'drizzle-orm';
import { addCitation, addLink, addRelation, setFact } from './aspects/content.ts';
import { addMembers, removeMembers, setLocation } from './aspects/placement.ts';
import { setWaypoints } from './aspects/waypoints.ts';
import {
  createEntity,
  deleteEntity,
  updateEntity,
  upsertEntityByKey,
  type EntityScope,
} from './entity-service.ts';
import { RuleViolation } from './errors.ts';

/**
 * Runs the operations of a batch request in order, inside one transaction (M1-T7). Each one
 * goes through the same service as its single-resource route, so the same rules apply.
 */

export interface OperationResult {
  index: number;
  op: BatchOperation['op'];
  kind?: EntityKind;
  /** The entity (or link, relation) the operation created or changed; what "$op:N" stands for. */
  id: string | null;
  data: unknown;
}

/** An operation failed; the whole batch is rolled back, and the error names the operation. */
export class BatchOperationError extends Error {
  override readonly name = 'BatchOperationError';
  readonly index: number;
  readonly op: string;
  override readonly cause: unknown;

  constructor(index: number, op: string, cause: unknown) {
    super(`Operation ${String(index)} (${op}) failed.`);
    this.index = index;
    this.op = op;
    this.cause = cause;
  }
}

export async function runOperations(
  tx: Executor,
  operations: readonly BatchOperation[],
  batchId: string,
): Promise<OperationResult[]> {
  const results: OperationResult[] = [];
  let universeRecorded = false;
  for (const [index, raw] of operations.entries()) {
    let result: OperationResult;
    let touched: string | undefined;
    try {
      const operation = resolveReferences(raw, results, index);
      const { universeId: deletedFrom, ...rest } = await runOne(tx, operation);
      result = { index, ...rest };
      touched = deletedFrom;
    } catch (error) {
      throw new BatchOperationError(index, raw.op, error);
    }
    results.push(result);
    // List the batch in the history of the universe its first entity belongs to.
    const universeId = touched ?? (result.data as { universeId?: unknown } | null)?.universeId;
    if (!universeRecorded && typeof universeId === 'string') {
      await tx
        .update(schema.changeBatches)
        .set({ universeId })
        .where(eq(schema.changeBatches.id, batchId));
      universeRecorded = true;
    }
  }
  return results;
}

/**
 * Replaces every `"$op:N"` in the operation with the id operation N returned. Only earlier
 * operations can be referred to.
 */
function resolveReferences(
  operation: BatchOperation,
  results: readonly OperationResult[],
  index: number,
): BatchOperation {
  const resolve = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const match = OPERATION_REFERENCE.exec(value);
      if (!match) return value;
      const target = Number(match[1]);
      const id = target < index ? results[target]?.id : undefined;
      if (!id) {
        throw new RuleViolation(
          `"${value}" must refer to an earlier operation; this is operation ${String(index)}.`,
        );
      }
      return id;
    }
    if (Array.isArray(value)) return value.map(resolve);
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, resolve(field)]));
    }
    return value;
  };
  return resolve(operation) as BatchOperation;
}

function scopeOf(
  kind: EntityKind,
  operation: { mapId?: string; universeId?: string },
): EntityScope {
  if (entityKinds[kind].scope === 'map') {
    if (!operation.mapId) throw new RuleViolation(`A ${kind} needs a mapId.`, '/mapId');
    return { mapId: operation.mapId };
  }
  if (!operation.universeId)
    throw new RuleViolation(`A ${kind} needs a universeId.`, '/universeId');
  return { universeId: operation.universeId };
}

/**
 * One operation's result, plus the universe it touched when the result doesn't say (a delete
 * returns no data), so the batch still lands in that universe's history.
 */
type RunResult = Omit<OperationResult, 'index'> & { universeId?: string };

async function runOne(tx: Executor, operation: BatchOperation): Promise<RunResult> {
  switch (operation.op) {
    case 'create': {
      const entity = await createEntity(
        tx,
        operation.kind,
        scopeOf(operation.kind, operation),
        operation.data as never,
      );
      return {
        op: 'create',
        kind: operation.kind,
        id: (entity as { id: string }).id,
        data: entity,
      };
    }
    case 'update': {
      const entity = await updateEntity(tx, operation.kind, operation.id, {
        ...operation.data,
        version: operation.version,
      });
      return { op: 'update', kind: operation.kind, id: operation.id, data: entity };
    }
    case 'delete': {
      const { universeId } = await deleteEntity(
        tx,
        operation.kind,
        operation.id,
        operation.version,
      );
      return { op: 'delete', kind: operation.kind, id: operation.id, data: null, universeId };
    }
    case 'upsert': {
      const { entity } = await upsertEntityByKey(
        tx,
        operation.kind,
        scopeOf(operation.kind, operation),
        operation.externalKey,
        operation.data as never,
      );
      return {
        op: 'upsert',
        kind: operation.kind,
        id: (entity as { id: string }).id,
        data: entity,
      };
    }
    case 'setLocation':
      return {
        op: 'setLocation',
        id: operation.id,
        data: await setLocation(tx, operation.id, operation.data as never),
      };
    case 'addMembers':
      return {
        op: 'addMembers',
        id: operation.id,
        data: await addMembers(tx, operation.id, operation.data as never),
      };
    case 'removeMembers':
      await removeMembers(tx, operation.id, operation.data);
      return { op: 'removeMembers', id: operation.id, data: null };
    case 'setWaypoints':
      return {
        op: 'setWaypoints',
        id: operation.id,
        data: await setWaypoints(tx, operation.id, { objectIds: operation.data }),
      };
    case 'setFacts': {
      const facts = [];
      for (const fact of operation.data) facts.push(await setFact(tx, operation.id, fact as never));
      return { op: 'setFacts', id: operation.id, data: facts };
    }
    case 'addLink': {
      const link = await addLink(tx, operation.id, operation.data as never);
      return { op: 'addLink', id: link?.id ?? null, data: link };
    }
    case 'addCitation': {
      const citation = await addCitation(tx, operation.id, operation.data as never);
      return { op: 'addCitation', id: citation.id, data: citation };
    }
    case 'addRelation': {
      const relation = await addRelation(tx, operation.id, operation.data as never);
      return { op: 'addRelation', id: relation?.id ?? null, data: relation };
    }
  }
}

/** Rows touched per table in a batch, read from its change log: the dry run's impact summary. */
export async function batchImpact(tx: Executor, batchId: string) {
  const rows = await tx.execute<{ table: string; op: string; count: number }>(sql`
    select table_name as table, op, count(*)::int as count
    from change_log where batch_id = ${batchId} group by table_name, op order by table_name, op`);
  const impact: Record<string, { insert: number; update: number; delete: number }> = {};
  for (const row of rows.rows) {
    const entry = (impact[row.table] ??= { insert: 0, update: 0, delete: 0 });
    entry[row.op.toLowerCase() as 'insert' | 'update' | 'delete'] = row.count;
  }
  return impact;
}
