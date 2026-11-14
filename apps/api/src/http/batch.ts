import { withBatch, type Actor, type Database, type Transaction } from '@ge/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { NotSignedIn } from '../auth/errors.ts';

/** Every request's actor with GE_AUTH_MODE=none: the owner, on their own machine. */
export const LOCAL_ACTOR: Actor = { type: 'local', label: 'local' };

/**
 * Who a change is recorded as (History): the local actor, or the signed-in account (M8-T1,
 * auth/requester.ts). An anonymous visitor can't make one; the request hook already refuses
 * their writes, and this makes sure.
 */
export function actorOf(request: FastifyRequest): Actor {
  if (request.actor) return request.actor;
  throw new NotSignedIn('Sign in to make changes.');
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
