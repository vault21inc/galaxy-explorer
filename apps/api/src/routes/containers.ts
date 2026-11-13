import { schema, type Database } from '@ge/db';
import {
  MapClone,
  MapCreate,
  MapRead,
  MapUpdate,
  UniverseCreate,
  UniverseRead,
  UniverseUpdate,
  redactMap,
  redactUniverse,
  HIDE_SPOILERS,
  toPlainText,
} from '@ge/domain';
import { eq } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { actorOf, inBatch } from '../http/batch.ts';
import { cloneMap } from '../services/clone-service.ts';
import {
  envelope,
  listQuery,
  page,
  problemResponses,
  readQuery,
  versionBody,
} from '../http/schemas.ts';
import {
  createMap,
  createUniverse,
  deleteMap,
  deleteUniverse,
  getMap,
  getUniverse,
  listMaps,
  listUniverses,
  updateMap,
  updateUniverse,
} from '../services/container-service.ts';
import { visibleTo } from '../services/visibility.ts';

/** Universes and maps: the containers everything else lives in (data-model §3.1). */

const universeParams = z.object({ universeId: z.uuid() });
const mapParams = z.object({ mapId: z.uuid() });
const universeTag = { tags: ['universes'] };
const mapTag = { tags: ['maps'] };

const UNIVERSE_DOC =
  'A fictional setting, such as Warhammer 40,000. It owns its maps, characters and settings (group types, event categories, object subtypes, field definitions).';
const MAP_DOC =
  'One galaxy at one point in time (U7); cloning a map makes another era. Map-scoped entities (objects, groups, places, events) belong to one map. `isSpoiler` hides the whole map from readers who hide spoilers.';

export const containerRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  app.get(
    '/universes',
    {
      schema: {
        ...universeTag,
        summary: 'List universes',
        description: UNIVERSE_DOC,
        operationId: 'universes.list',
        querystring: listQuery.extend(readQuery.shape),
        response: { 200: page(UniverseRead), ...problemResponses },
      },
    },
    async (request) => {
      const { cursor, limit, spoilers } = request.query;
      const result = await listUniverses(db, { limit, ...(cursor ? { cursor } : {}) });
      const data =
        spoilers === 'exclude'
          ? result.items.map((item) => redactUniverse(item, HIDE_SPOILERS))
          : result.items;
      return { data, nextCursor: result.nextCursor } as never;
    },
  );

  app.post(
    '/universes',
    {
      schema: {
        ...universeTag,
        summary: 'Create a universe',
        description: UNIVERSE_DOC,
        operationId: 'universes.create',
        body: UniverseCreate,
        response: { 201: envelope(UniverseRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const data = await inBatch(db, request, reply, 'Create universe', {}, async (tx, batchId) => {
        const universe = await createUniverse(tx, request.body);
        // The batch couldn't name its universe before the universe existed.
        await tx
          .update(schema.changeBatches)
          .set({ universeId: universe.id })
          .where(eq(schema.changeBatches.id, batchId));
        return universe;
      });
      return reply.code(201).send({ data });
    },
  );

  app.get(
    '/universes/:universeId',
    {
      schema: {
        ...universeTag,
        summary: 'Get a universe',
        description: UNIVERSE_DOC,
        operationId: 'universes.get',
        params: universeParams,
        querystring: readQuery,
        response: { 200: envelope(UniverseRead), ...problemResponses },
      },
    },
    async (request) => {
      const universe = await getUniverse(db, request.params.universeId);
      return {
        data:
          request.query.spoilers === 'exclude' ? redactUniverse(universe, HIDE_SPOILERS) : universe,
      };
    },
  );

  app.patch(
    '/universes/:universeId',
    {
      schema: {
        ...universeTag,
        summary: 'Update a universe',
        description: UNIVERSE_DOC,
        operationId: 'universes.update',
        params: universeParams,
        body: UniverseUpdate,
        response: { 200: envelope(UniverseRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { universeId } = request.params;
      const data = await inBatch(db, request, reply, 'Edit universe', { universeId }, (tx) =>
        updateUniverse(tx, universeId, request.body),
      );
      return { data };
    },
  );

  app.delete(
    '/universes/:universeId',
    {
      schema: {
        ...universeTag,
        summary: 'Delete a universe and everything in it',
        description: UNIVERSE_DOC,
        operationId: 'universes.delete',
        params: universeParams,
        body: versionBody,
        response: { 204: z.null(), ...problemResponses },
      },
    },
    async (request, reply) => {
      await inBatch(db, request, reply, 'Delete universe', {}, (tx) =>
        deleteUniverse(tx, request.params.universeId, request.body.version),
      );
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/universes/:universeId/maps',
    {
      schema: {
        ...mapTag,
        summary: 'List maps',
        description: MAP_DOC,
        operationId: 'maps.list',
        params: universeParams,
        querystring: listQuery.extend(readQuery.shape),
        response: { 200: page(MapRead), ...problemResponses },
      },
    },
    async (request) => {
      const { cursor, limit, spoilers, includeDrafts } = request.query;
      const result = await listMaps(db, request.params.universeId, {
        viewer: visibleTo(actorOf(request), { includeDrafts }),
        limit,
        ...(cursor ? { cursor } : {}),
      });
      const data =
        spoilers === 'exclude'
          ? result.items.map((item) => redactMap(item, HIDE_SPOILERS))
          : result.items;
      return { data, nextCursor: result.nextCursor } as never;
    },
  );

  app.post(
    '/universes/:universeId/maps',
    {
      schema: {
        ...mapTag,
        summary: 'Create a map',
        description: MAP_DOC,
        operationId: 'maps.create',
        params: universeParams,
        body: MapCreate,
        response: { 201: envelope(MapRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { universeId } = request.params;
      const data = await inBatch(db, request, reply, 'Create map', { universeId }, (tx) =>
        createMap(tx, universeId, request.body),
      );
      return reply.code(201).send({ data });
    },
  );

  app.post(
    '/maps/:mapId/clone',
    {
      schema: {
        ...mapTag,
        summary: 'Clone a map for another era',
        description:
          'Copies the map and everything on it (objects, groups, routes, places, events and their facts, images, links, citations, locations, members and waypoints, and relations, including those with characters) to a new map with this slug and name (U7, D-17). ' +
          'Each copy records the entity it came from (`clonedFromEntityId`; read the lineage with `include=counterparts`), keys are kept, images are shared, and characters stay as they are. One change batch: reverting it removes the copy.',
        operationId: 'maps.clone',
        params: mapParams,
        body: MapClone,
        response: { 201: envelope(MapRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const source = await getMap(db, request.params.mapId, { includeDrafts: true });
      const description = `Clone map “${source.namePlain}” as “${toPlainText(request.body.name)}”`;
      const data = await inBatch(
        db,
        request,
        reply,
        description.slice(0, 200),
        { universeId: source.universeId },
        async (tx) => (await cloneMap(tx, source.id, request.body)).map,
      );
      return reply.code(201).send({ data });
    },
  );

  app.get(
    '/maps/:mapId',
    {
      schema: {
        ...mapTag,
        summary: 'Get a map',
        description: MAP_DOC,
        operationId: 'maps.get',
        params: mapParams,
        querystring: readQuery,
        response: { 200: envelope(MapRead), ...problemResponses },
      },
    },
    async (request) => {
      const { spoilers, includeDrafts } = request.query;
      const map = await getMap(
        db,
        request.params.mapId,
        visibleTo(actorOf(request), { includeDrafts }),
      );
      return { data: spoilers === 'exclude' ? redactMap(map, HIDE_SPOILERS) : map };
    },
  );

  app.patch(
    '/maps/:mapId',
    {
      schema: {
        ...mapTag,
        summary: 'Update a map',
        description: MAP_DOC,
        operationId: 'maps.update',
        params: mapParams,
        body: MapUpdate,
        response: { 200: envelope(MapRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const current = await getMap(db, request.params.mapId, { includeDrafts: true });
      const data = await inBatch(
        db,
        request,
        reply,
        'Edit map',
        { universeId: current.universeId },
        (tx) => updateMap(tx, request.params.mapId, request.body),
      );
      return { data };
    },
  );

  app.delete(
    '/maps/:mapId',
    {
      schema: {
        ...mapTag,
        summary: 'Delete a map and everything on it',
        description: MAP_DOC,
        operationId: 'maps.delete',
        params: mapParams,
        body: versionBody,
        response: { 204: z.null(), ...problemResponses },
      },
    },
    async (request, reply) => {
      const current = await getMap(db, request.params.mapId, { includeDrafts: true });
      await inBatch(db, request, reply, 'Delete map', { universeId: current.universeId }, (tx) =>
        deleteMap(tx, request.params.mapId, request.body.version),
      );
      return reply.code(204).send(null);
    },
  );

  done();
};
