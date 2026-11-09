import { unwrap, type operations } from '@ge/api-client';
import { CONFIG_RESOURCES, ENTITY_KINDS } from '@ge/domain';
import type { QueryKey } from '@tanstack/react-query';
import { api } from './client.ts';

/** History (M1-T8, data-model §9): what changed, batch by batch, and reverting a batch. */

type Json<Operation extends keyof operations, Status extends number> =
  operations[Operation]['responses'] extends Record<
    Status,
    { content: { 'application/json': infer Body } }
  >
    ? Body
    : never;

export type HistoryBatch =
  Json<'history.list', 200> extends { data: (infer Item)[] } ? Item : never;
export type BatchDetail = Json<'history.get', 200> extends { data: infer Detail } ? Detail : never;

/** One page of a universe's batches, newest first. */
export async function historyPage(universeId: string, cursor?: string, signal?: AbortSignal) {
  return unwrap(
    api.GET('/api/v1/universes/{universeId}/history', {
      params: { path: { universeId }, query: { limit: 50, ...(cursor ? { cursor } : {}) } },
      ...(signal ? { signal } : {}),
    }),
  );
}

/** What one batch changed, per entity. */
export async function batchDetail(batchId: string): Promise<BatchDetail> {
  return unwrap(api.GET('/api/v1/history/{batchId}', { params: { path: { batchId } } }));
}

/**
 * Reverts a batch as a new batch, whose id comes back: undo, or redo when the batch was itself
 * a revert. A 409 (`ApiError`) means something it touched changed since; then nothing changed.
 */
export async function revertBatch(batchId: string): Promise<{ batchId: string }> {
  return unwrap(api.POST('/api/v1/history/{batchId}/revert', { params: { path: { batchId } } }));
}

/**
 * The query keys (keys.ts) a revert of this batch can change: each entity kind it touched,
 * universes, maps or settings it touched, every view, and the history itself.
 */
export function affectedQueries(detail: BatchDetail): QueryKey[] {
  const prefixes = new Set<string>(['view', 'history']);
  for (const entity of detail.entities) {
    if (entity.kind && (ENTITY_KINDS as readonly string[]).includes(entity.kind)) {
      prefixes.add(entity.kind);
    }
  }
  for (const row of detail.other) {
    if (row.table === 'universes') prefixes.add('universe');
    else if (row.table === 'maps') prefixes.add('map');
    // Settings tables are named like their config resources (`object_subtypes`).
    else if ((CONFIG_RESOURCES as readonly string[]).includes(row.table)) prefixes.add(row.table);
  }
  return [...prefixes].map((prefix) => [prefix]);
}

/** Entities the batch created, which reverting it deletes. */
export function createdEntities(detail: BatchDetail): string[] {
  return detail.entities.flatMap((entity) =>
    entity.change === 'created' ? [entity.entityId] : [],
  );
}
