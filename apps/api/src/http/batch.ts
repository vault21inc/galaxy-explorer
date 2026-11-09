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
 * The `X-GE-Batch-Description` header, decoded. HTTP header values are limited to Latin-1, so
 * clients percent-encode the text as UTF-8 (`encodeURIComponent`): names in any script, and
 * typographic quotes, survive. Plain ASCII without `%` reads the same either way; a value that
 * isn't valid percent-encoding is used as sent.
 */
export function batchDescriptionOf(request: FastifyRequest): string | undefined {
  const raw = request.headers['x-ge-batch-description'];
  if (typeof raw !== 'string') return undefined;
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // Not percent-encoded: keep it as it came.
  }
  text = text.trim();
  return text ? text.slice(0, 200) : undefined;
}

/**
 * Runs a mutating request as one change batch (architecture.md §4–5). The client may describe
 * it with `X-GE-Batch-Description` ("Moved 12 objects", percent-encoded UTF-8); the response carries `X-GE-Batch-Id`,
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
  const { result, batchId } = await withBatch(
    db,
    actorOf(request),
    batchDescriptionOf(request) ?? description,
    fn,
    { universeId: options.universeId ?? null },
  );
  void reply.header('x-ge-batch-id', batchId);
  return result;
}
