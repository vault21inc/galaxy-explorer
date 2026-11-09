import { unwrap } from '@ge/api-client';
import type { BatchRequest } from '@ge/domain';
import { api } from './client.ts';

/** What `POST /batch` returns (M1-T7). */
export interface BatchResult {
  dryRun: boolean;
  batchId: string | null;
  results: { index: number; op: string; kind?: string; id: string | null; data: unknown }[];
  /** Dry runs only: rows each table would insert, update and delete. */
  impact?: Record<string, { insert: number; update: number; delete: number }>;
}

/**
 * Runs a batch: many operations as one change and one undo step (architecture.md §5). The
 * request is the domain's `BatchRequest`, which the API validates the same way; the generated
 * client types `data` more loosely, hence the one cast.
 */
export async function sendBatch(request: BatchRequest): Promise<BatchResult> {
  const result: unknown = await unwrap(api.POST('/api/v1/batch', { body: request as never }));
  return result as BatchResult;
}
