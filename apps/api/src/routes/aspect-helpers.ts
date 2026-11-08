import type { Database, Transaction } from '@ge/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { inBatch } from '../http/batch.ts';
import { problemResponses } from '../http/schemas.ts';
import { requireOwner } from '../services/aspects/owner.ts';

/** Shared by the aspect and member routes. */

export const entityParams = z.object({ entityId: z.uuid() });
export const ASPECT_DOC =
  'Aspects are details any entity can have. Each change is one batch, returned in X-GE-Batch-Id. Aspect rows have no version: the last write wins. They come back with their spoiler flags; for a redacted view, read the entity with `include` and `spoilers=exclude`.';
export const list = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item) });
export const deleted = { 204: z.null().describe('Deleted.'), ...problemResponses };

/** Runs an aspect write as one batch, listed in the history of the entity's universe. */
export function aspectWriter(db: Database) {
  return async <T>(
    request: FastifyRequest,
    reply: FastifyReply,
    entityId: string,
    description: string,
    fn: (tx: Transaction) => Promise<T>,
  ): Promise<T> => {
    const { universeId } = await requireOwner(db, entityId);
    return inBatch(db, request, reply, description, { universeId }, fn);
  };
}
