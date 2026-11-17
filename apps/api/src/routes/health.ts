import { pingDatabase, type Database } from '@ge/db';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { routeAccess } from '../http/access-guard.ts';

const healthResponse = z.object({
  data: z.object({
    status: z.enum(['ok', 'degraded']),
    db: z.enum(['ok', 'down']),
    version: z.string(),
    /**
     * How the API authenticates (architecture.md §7): `none` has no accounts; with `required`,
     * the web app offers signing in (M8-T1).
     */
    authMode: z.enum(['none', 'required']),
    /**
     * Whether this request may edit, which decides whether the web app offers edit mode. With
     * `authMode: none` that's everyone, except readers of the private preview
     * (docs/ops/preview.md); with `required`, a signed-in account (until M8-T11 decides it
     * per universe).
     */
    canEdit: z.boolean(),
    /**
     * The universe a signed-out visitor opens at `/`, by slug (D-51, `GE_HOME_UNIVERSE`); null
     * lists the public universes instead.
     */
    homeUniverse: z.string().nullable(),
    /**
     * Where to send that visitor: `/u/{homeUniverse}`, or a path into it naming a view, a
     * selection and a camera (`GE_HOME_UNIVERSE` as a path); null with no home universe.
     */
    homePath: z.string().nullable(),
  }),
});

export interface HealthRouteOptions {
  db: Database;
  version: string;
  authMode: 'none' | 'required';
  home?: { universe: string; path: string } | undefined;
}

/** `GET /api/health`: liveness for humans, uptime monitors and deploy scripts. */
export const healthRoutes: FastifyPluginCallbackZod<HealthRouteOptions> = (app, options, done) => {
  app.get(
    '/api/health',
    {
      schema: {
        operationId: 'health.get',
        ...routeAccess({ scope: 'open' }),
        tags: ['health'],
        summary: 'Check that the API and its database are up',
        description:
          'Returns 200 with `status: "ok"` when the database answers, and 503 with `status: "degraded"` and `db: "down"` when it does not.',
        response: { 200: healthResponse, 503: healthResponse },
      },
    },
    async (request, reply) => {
      const dbUp = await pingDatabase(options.db);
      return reply.code(dbUp ? 200 : 503).send({
        data: {
          status: dbUp ? 'ok' : 'degraded',
          db: dbUp ? 'ok' : 'down',
          version: options.version,
          authMode: options.authMode,
          canEdit: request.canEdit,
          homeUniverse: options.home?.universe ?? null,
          homePath: options.home?.path ?? null,
        },
      });
    },
  );
  done();
};
