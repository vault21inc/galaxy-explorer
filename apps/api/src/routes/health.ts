import { pingDatabase, type Database } from '@ge/db';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const healthResponse = z.object({
  data: z.object({
    status: z.enum(['ok', 'degraded']),
    db: z.enum(['ok', 'down']),
    version: z.string(),
  }),
});

export interface HealthRouteOptions {
  db: Database;
  version: string;
}

/** `GET /api/health`: liveness for humans, uptime monitors and deploy scripts. */
export const healthRoutes: FastifyPluginCallbackZod<HealthRouteOptions> = (app, options, done) => {
  app.get(
    '/api/health',
    {
      schema: {
        operationId: 'health.get',
        tags: ['health'],
        summary: 'Check that the API and its database are up',
        description:
          'Returns 200 with `status: "ok"` when the database answers, and 503 with `status: "degraded"` and `db: "down"` when it does not.',
        response: { 200: healthResponse, 503: healthResponse },
      },
    },
    async (_request, reply) => {
      const dbUp = await pingDatabase(options.db);
      return reply.code(dbUp ? 200 : 503).send({
        data: {
          status: dbUp ? 'ok' : 'degraded',
          db: dbUp ? 'ok' : 'down',
          version: options.version,
        },
      });
    },
  );
  done();
};
