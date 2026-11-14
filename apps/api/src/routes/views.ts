import type { Database } from '@ge/db';
import { EventList, GalaxyView, OrbitView, SystemView } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { actorOf } from '../http/batch.ts';
import { envelope, problemResponses, readQuery } from '../http/schemas.ts';
import {
  excludeViewSpoilers,
  galaxyView,
  orbitView,
  systemView,
} from '../services/view-service.ts';
import { eventList } from '../services/event-list.ts';
import { visibleTo } from '../services/visibility.ts';

/**
 * View payloads (architecture.md §6): everything one view draws, in one request. The 3D client
 * loads these; the info panel loads full entities on selection.
 */

const VIEW_DOC =
  "Render-ready: appearances are resolved (type ← subtype ← object), positions are [x, y, z] in the view's frame, and names come with `nameRedacted` for spoiler-hidden labels. No rich-text bodies: fetch the entity for those. Drafts are left out for anonymous readers.";

export const viewRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  const viewerOf = (request: Parameters<typeof actorOf>[0], includeDrafts: boolean | undefined) =>
    visibleTo(request.actor, { includeDrafts });
  const spoilersApplied = <T extends object>(view: T, spoilers: 'include' | 'exclude') =>
    spoilers === 'exclude' ? excludeViewSpoilers(view) : view;

  app.get(
    '/maps/:mapId/event-list',
    {
      schema: {
        tags: ['views'],
        summary: "A map's events, in date order, with where each is",
        description:
          'Every event of the map the reader may see, sorted by `dateSort`, then `dateText`, then name (undated last), each with its category and its location as a path of names, outermost first ("Gudrun › Gudrun I › Hive Primus"). The path is empty in deep space; `location` is null for an event that is nowhere yet. Names come with `nameRedacted`; under `spoilers=exclude` a spoiler location keeps its mode but loses its path.',
        operationId: 'views.events',
        params: z.object({ mapId: z.uuid() }),
        querystring: readQuery,
        response: { 200: envelope(EventList), ...problemResponses },
      },
    },
    async (request) => {
      const { spoilers, includeDrafts } = request.query;
      const list = await eventList(db, request.params.mapId, viewerOf(request, includeDrafts));
      return { data: spoilersApplied(list, spoilers) };
    },
  );

  app.get(
    '/maps/:mapId/views/galaxy',
    {
      schema: {
        tags: ['views'],
        summary: 'Everything the galaxy view draws',
        description: `${VIEW_DOC} Objects are the top-level ones (light-years, galaxy frame); groups come with their members and the universe's group types.`,
        operationId: 'views.galaxy',
        params: z.object({ mapId: z.uuid() }),
        querystring: readQuery,
        response: { 200: envelope(GalaxyView), ...problemResponses },
      },
    },
    async (request) => {
      const { spoilers, includeDrafts } = request.query;
      const view = await galaxyView(db, request.params.mapId, viewerOf(request, includeDrafts));
      return { data: spoilersApplied(view, spoilers) };
    },
  );

  app.get(
    '/objects/:id/views/system',
    {
      schema: {
        tags: ['views'],
        summary: 'Everything a system view draws',
        description: `${VIEW_DOC} The subject must be a system; its children are positioned in system units. A 400 explains when the object opens another view, or none.`,
        operationId: 'views.system',
        params: z.object({ id: z.uuid() }),
        querystring: readQuery,
        response: { 200: envelope(SystemView), ...problemResponses },
      },
    },
    async (request) => {
      const { spoilers, includeDrafts } = request.query;
      const view = await systemView(db, request.params.id, viewerOf(request, includeDrafts));
      return { data: spoilersApplied(view, spoilers) };
    },
  );

  app.get(
    '/objects/:id/views/orbit',
    {
      schema: {
        tags: ['views'],
        summary: 'Everything an orbit view draws',
        description: `${VIEW_DOC} The subject must be a planet or moon; children are positioned in body radii. Pins are the places and events located on it, including events at a place on it.`,
        operationId: 'views.orbit',
        params: z.object({ id: z.uuid() }),
        querystring: readQuery,
        response: { 200: envelope(OrbitView), ...problemResponses },
      },
    },
    async (request) => {
      const { spoilers, includeDrafts } = request.query;
      const view = await orbitView(db, request.params.id, viewerOf(request, includeDrafts));
      return { data: spoilersApplied(view, spoilers) };
    },
  );

  done();
};
