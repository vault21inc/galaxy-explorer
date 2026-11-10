import { withBatch, type Database } from '@ge/db';
import { BatchRequest, ENTITY_KINDS, MAX_BATCH_OPERATIONS } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { actorOf } from '../http/batch.ts';
import { envelope, problemResponses } from '../http/schemas.ts';
import { batchImpact, runOperations, type OperationResult } from '../services/batch-service.ts';

const BATCH_DOC = `Runs up to ${String(MAX_BATCH_OPERATIONS)} operations in order, in one transaction and one change batch: all of them happen, or none do, and the whole request is one undo step.

Operations: create, update, delete and upsert for any entity kind (\`kind\` is ${ENTITY_KINDS.join(', ')}; \`data\` is the same body as that kind's single-resource route), and setLocation, addMembers, removeMembers, setWaypoints (a route's object ids in order), setFacts, addLink and addRelation on an entity \`id\`.

Refer to an entity created earlier in the same request as \`"$op:N"\` (N counts from 0), anywhere an id goes. For example, create a system, then planets with \`"parentId": "$op:0"\`.

If an operation fails, nothing is written, and the problem response's \`operationIndex\` names it. With \`dryRun: true\` everything runs and is reported, including \`impact\` (rows touched per table), and then rolled back; use it to preview deletes.`;

const Impact = z.record(
  z.string(),
  z.object({ insert: z.int(), update: z.int(), delete: z.int() }),
);
const Result = z.object({
  index: z.int(),
  op: z.string(),
  kind: z.string().optional(),
  id: z.uuid().nullable().describe('What "$op:N" stood for: the entity created or changed.'),
  data: z.unknown(),
});
const BatchResponse = z.object({
  dryRun: z.boolean(),
  /** Null for a dry run: nothing was kept. */
  batchId: z.uuid().nullable(),
  results: z.array(Result),
  impact: Impact.optional().describe(
    'Dry runs only: rows that would be inserted, updated and deleted, per table.',
  ),
});

/** Thrown at the end of a dry run to roll the transaction back, carrying what it would have done. */
class DryRunRollback extends Error {
  readonly outcome: { results: OperationResult[]; impact: z.infer<typeof Impact> };

  constructor(outcome: DryRunRollback['outcome']) {
    super('dry run');
    this.outcome = outcome;
  }
}

export const batchRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  app.post(
    '/batch',
    {
      schema: {
        tags: ['batch'],
        summary: 'Run many operations as one change',
        description: BATCH_DOC,
        operationId: 'batch.run',
        body: BatchRequest,
        response: { 200: envelope(BatchResponse), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { description, dryRun = false, operations } = request.body;
      if (dryRun) {
        try {
          await withBatch(db, actorOf(request), description, async (tx, batchId) => {
            const results = await runOperations(tx, operations, batchId);
            throw new DryRunRollback({ results, impact: await batchImpact(tx, batchId) });
          });
        } catch (error) {
          if (!(error instanceof DryRunRollback)) throw error;
          return { data: { dryRun: true, batchId: null, ...error.outcome } };
        }
      }
      const { result, batchId } = await withBatch(db, actorOf(request), description, (tx, id) =>
        runOperations(tx, operations, id),
      );
      void reply.header('x-ge-batch-id', batchId);
      return { data: { dryRun: false, batchId, results: result } };
    },
  );
  done();
};
