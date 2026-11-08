import { withBatch, type Actor, type Database, type Transaction } from '@ge/db';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Who is making a request. With GE_AUTH_MODE=none (the proof of concept) every request is the
 * local owner; M8 adds sessions and API tokens, and anonymous readers.
 */
export const LOCAL_ACTOR: Actor = { type: 'local', label: 'local' };

export function actorOf(_request: FastifyRequest): Actor {
  return LOCAL_ACTOR;
}

/**
 * Runs a mutating request as one change batch (architecture.md §4–5). The client may describe
 * it with `X-GE-Batch-Description` ("Moved 12 objects"); the response carries `X-GE-Batch-Id`,
 * which is what undo reverts. `universeOf` names the universe whose history lists the batch,
 * when it's only known from the result (a new universe).
 */
export async function inBatch<T>(
  db: Database,
  request: FastifyRequest,
  reply: FastifyReply,
  description: string,
  options: { universeId?: string | null },
  fn: (tx: Transaction, batchId: string) => Promise<T>,
): Promise<T> {
  const custom = request.headers['x-ge-batch-description'];
  const { result, batchId } = await withBatch(
    db,
    actorOf(request),
    typeof custom === 'string' && custom.trim() ? custom.trim().slice(0, 200) : description,
    fn,
    { universeId: options.universeId ?? null },
  );
  void reply.header('x-ge-batch-id', batchId);
  return result;
}
