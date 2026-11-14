import { RevertConflictError, revertBatch, type Database } from '@ge/db';
import { ACTOR_TYPES, Uuid } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { actorOf } from '../http/batch.ts';
import { envelope, listQuery, page, problemResponses } from '../http/schemas.ts';
import { RevertConflicts } from '../services/errors.ts';
import { findRevertConflicts, getBatchDetail, listHistory } from '../services/history-service.ts';
import { routeAccess } from '../http/access-guard.ts';

/** History: list batches, see what one changed, and revert it (data-model §9). */

const Batch = z.object({
  id: Uuid,
  universeId: Uuid.nullable(),
  actorType: z.enum(ACTOR_TYPES),
  actorId: Uuid.nullable(),
  actorLabel: z.string(),
  description: z.string(),
  revertsBatchId: Uuid.nullable().describe('Set when this batch reverted another one.'),
  revertedBy: z.array(Uuid).describe('Batches that reverted this one.'),
  createdAt: z.iso.datetime({ offset: true }),
});

const FieldChange = z.object({
  field: z.string(),
  from: z.unknown().optional(),
  to: z.unknown().optional(),
});
const BatchDetail = z.object({
  batch: Batch,
  rowCount: z.int().describe('Rows the batch changed, cascades included.'),
  entities: z.array(
    z.object({
      entityId: Uuid,
      kind: z.string().nullable(),
      name: z.string(),
      change: z.enum(['created', 'updated', 'deleted']),
      fields: z.array(FieldChange),
      aspects: z.array(z.string()),
      summary: z.string().describe('For example "Gudrun: x 120→140, name changed".'),
    }),
  ),
  other: z.array(
    z.object({
      table: z.string(),
      primaryKey: z.record(z.string(), z.unknown()),
      change: z.enum(['created', 'updated', 'deleted']),
      summary: z.string(),
    }),
  ),
});

const HISTORY_DOC =
  'Every change is a batch: one request, or one batch request. Reverting a batch undoes it as a new batch; reverting that new batch redoes the original.';
const batchParams = z.object({ batchId: z.uuid() });

export const historyRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  app.get(
    '/universes/:universeId/history',
    {
      schema: {
        tags: ['history'],
        summary: "List a universe's changes, newest first",
        description: HISTORY_DOC,
        operationId: 'history.list',
        ...routeAccess({ scope: 'universe', level: 'edit' }),
        params: z.object({ universeId: z.uuid() }),
        querystring: listQuery.extend({
          actorType: z.enum(ACTOR_TYPES).optional().describe('Only changes by this kind of actor.'),
          actorLabel: z
            .string()
            .min(1)
            .max(200)
            .optional()
            .describe('Only changes by this actor, such as "token: claude-code".'),
          from: z.iso
            .datetime({ offset: true })
            .optional()
            .describe('Only changes at or after this time.'),
          to: z.iso
            .datetime({ offset: true })
            .optional()
            .describe('Only changes at or before this time.'),
        }),
        response: { 200: page(Batch), ...problemResponses },
      },
    },
    async (request) => {
      const { cursor, limit, actorType, actorLabel, from, to } = request.query;
      const result = await listHistory(db, request.params.universeId, {
        limit,
        ...(cursor ? { cursor } : {}),
        ...(actorType ? { actorType } : {}),
        ...(actorLabel ? { actorLabel } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      return { data: result.items, nextCursor: result.nextCursor } as never;
    },
  );

  app.get(
    '/history/:batchId',
    {
      schema: {
        tags: ['history'],
        summary: 'What one change did, per entity',
        description: `${HISTORY_DOC} The summary groups rows by entity, including cascaded rows and aspect changes (links, facts, members…).`,
        operationId: 'history.get',
        ...routeAccess({ scope: 'universe', level: 'edit' }),
        params: batchParams,
        response: { 200: envelope(BatchDetail), ...problemResponses },
      },
    },
    async (request) => ({ data: await getBatchDetail(db, request.params.batchId) }) as never,
  );

  app.post(
    '/history/:batchId/revert',
    {
      schema: {
        tags: ['history'],
        summary: 'Revert a change (undo), or revert a revert (redo)',
        description: `${HISTORY_DOC} If anything the batch touched has changed since, nothing is reverted and the 409 response lists the conflicting entities in \`conflicts\`.`,
        operationId: 'history.revert',
        params: batchParams,
        response: {
          201: envelope(z.object({ batchId: Uuid, revertsBatchId: Uuid, rowsChanged: z.int() })),
          ...problemResponses,
        },
      },
    },
    async (request, reply) => {
      const { batchId } = request.params;
      try {
        const reverted = await revertBatch(db, batchId, actorOf(request));
        void reply.header('x-ge-batch-id', reverted.batchId);
        return await reply
          .code(201)
          .send({ data: { ...reverted, revertsBatchId: batchId } } as never);
      } catch (error) {
        if (!(error instanceof RevertConflictError)) throw error;
        const conflicts = await findRevertConflicts(db, batchId);
        if (conflicts.length === 0) throw error;
        throw new RevertConflicts(conflicts);
      }
    },
  );

  done();
};
