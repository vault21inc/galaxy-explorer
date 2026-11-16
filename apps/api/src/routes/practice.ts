import { randomBytes } from 'node:crypto';
import type { Database } from '@ge/db';
import { PracticeUniverse, Slug } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { routeAccess } from '../http/access-guard.ts';
import { inBatch } from '../http/batch.ts';
import { envelope, problemResponses } from '../http/schemas.ts';
import { getUniverse, universeReads, type Placement } from '../services/container-service.ts';
import { fillDemo } from '../seeds/demo.ts';

/**
 * The editor tour's practice universe (M8-T10, D-30): the demo's content, in a new universe of
 * its own, so the tour can teach editing on something nobody else sees. With accounts it's the
 * account's, private, like any universe it makes (D-34), and counts toward its quota until
 * deleted; locally it's the installation's. The tour offers to delete it at the end, through
 * the usual route and its confirmation.
 */

/** The map of the demo's that the tour opens: its present era, with systems to enter. */
const PRACTICE_MAP_SLUG = Slug.parse('main');

export const practiceRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  app.post(
    '/practice-universe',
    {
      schema: {
        tags: ['universes'],
        summary: 'Make a practice universe for the editor tour',
        description:
          'A new universe named “Practice” with the demo’s content (two maps, systems to enter, groups, regions, a route, places, events and characters), made as one change. With accounts it belongs to the account and is private, as any universe it makes. Answers with the universe and the map the tour opens. Delete it as any universe.',
        operationId: 'universes.practice',
        // As making any universe: someone who may make changes, not a token for one universe.
        ...routeAccess({ scope: 'editor', newUniverse: true }),
        response: { 201: envelope(PracticeUniverse), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { requester } = request;
      const placement: Placement =
        requester.kind === 'account'
          ? { ownerId: requester.account.id, visibility: 'private' }
          : { ownerId: null, visibility: 'private' };
      // Its own address each time, so a kept practice universe never collides with a new one.
      const slug = `practice-${randomBytes(4).toString('hex')}`;
      const data = await inBatch(
        db,
        request,
        reply,
        'Practice universe for the editor tour',
        {},
        async (tx, batchId) => {
          const { universeId } = await fillDemo(tx, batchId, { slug, name: 'Practice', placement });
          const [universe] = await universeReads(tx, requester, [
            await getUniverse(tx, universeId),
          ]);
          if (!universe) throw new Error('The new practice universe can’t be read by its maker.');
          return { universe, mapSlug: PRACTICE_MAP_SLUG };
        },
      );
      return reply.code(201).send({ data });
    },
  );

  done();
};
