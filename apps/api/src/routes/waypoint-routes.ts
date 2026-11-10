import type { Database } from '@ge/db';
import { WaypointRead, WaypointsWrite } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../http/schemas.ts';
import { listWaypoints, requireRoute, setWaypoints } from '../services/aspects/waypoints.ts';
import { aspectWriter, list } from './aspect-helpers.ts';

/** A route's waypoints (M4-T7, architecture.md §5: the kind-specific routes). */

const WAYPOINTS_DOC =
  "A route's waypoints are the objects it passes through, in order: top-level objects on the route's map. An object may appear again later (a round trip) but not twice in a row. The change is one batch, returned in X-GE-Batch-Id.";
const routeParams = z.object({ routeId: z.uuid() });

export const waypointRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  const write = aspectWriter(db);

  app.get(
    '/routes/:routeId/waypoints',
    {
      schema: {
        tags: ['routes'],
        summary: "List a route's waypoints",
        description: WAYPOINTS_DOC,
        operationId: 'routes.waypoints.list',
        params: routeParams,
        response: { 200: list(WaypointRead), ...problemResponses },
      },
    },
    async (request) => {
      await requireRoute(db, request.params.routeId);
      return { data: await listWaypoints(db, request.params.routeId) } as never;
    },
  );

  app.put(
    '/routes/:routeId/waypoints',
    {
      schema: {
        tags: ['routes'],
        summary: "Replace a route's waypoints",
        description: WAYPOINTS_DOC,
        operationId: 'routes.waypoints.set',
        params: routeParams,
        body: WaypointsWrite,
        response: { 200: list(WaypointRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { routeId } = request.params;
      await requireRoute(db, routeId);
      await write(request, reply, routeId, 'Set route waypoints', (tx) =>
        setWaypoints(tx, routeId, request.body),
      );
      return { data: await listWaypoints(db, routeId) } as never;
    },
  );

  done();
};
