import { schema, type Database, type Executor } from '@ge/db';
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
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { inBatch } from '../http/batch.ts';
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
  getUniverseBySlug,
  INSTALLATION_OWN,
  listMaps,
  listUniverses,
  universeReads,
  updateMap,
  updateUniverse,
  type UniverseRecord,
} from '../services/container-service.ts';
import { NotFound } from '../services/errors.ts';
import { problem } from '../http/problems.ts';
import { viewerFor } from '../services/visibility.ts';
import { routeAccess } from '../http/access-guard.ts';
import type { AuthContext } from '../auth/context.ts';
import { requireConfirmation, requireSession } from '../auth/requester.ts';
import { recordAccessEvent } from '../services/access-events.ts';
import { setVisibility } from '../services/sharing-service.ts';

/** Universes and maps: the containers everything else lives in (data-model §3.1). */

const universeParams = z.object({ universeId: z.uuid() });
const mapParams = z.object({ mapId: z.uuid() });
const universeTag = { tags: ['universes'] };
const mapTag = { tags: ['maps'] };

const UNIVERSE_DOC =
  'A fictional setting, such as Warhammer 40,000. It owns its maps, characters and settings (group types, event categories, object subtypes, field definitions).';
const MAP_DOC =
  'One galaxy at one point in time (U7); cloning a map makes another era. Map-scoped entities (objects, groups, places, events) belong to one map. `isSpoiler` hides the whole map from readers who hide spoilers.';

export const containerRoutes: FastifyPluginCallbackZod<{
  db: Database;
  auth: AuthContext | null;
}> = (app, { db, auth }, done) => {
  /** Universes as this requester sees them, spoilers redacted if asked. */
  const reads = async (
    ex: Executor,
    request: FastifyRequest,
    records: UniverseRecord[],
    spoilers?: 'include' | 'exclude',
  ) => {
    const data = await universeReads(ex, request.requester, records);
    return spoilers === 'exclude' ? data.map((item) => redactUniverse(item, HIDE_SPOILERS)) : data;
  };
  const one = <T>(items: T[]): T => {
    const [item] = items;
    // Only a universe the requester can read gets this far.
    if (item === undefined) throw new Error('The universe is out of reach.');
    return item;
  };

  app.get(
    '/universes',
    {
      schema: {
        ...universeTag,
        summary: 'List universes',
        description: `${UNIVERSE_DOC} Lists the universes the requester can read: public ones, and with an account, its own and those shared with it. A link-only universe isn't listed for someone who only has its link.`,
        operationId: 'universes.list',
        ...routeAccess({ scope: 'open' }),
        querystring: listQuery.extend(readQuery.shape),
        response: { 200: page(UniverseRead), ...problemResponses },
      },
    },
    async (request) => {
      const { cursor, limit, spoilers } = request.query;
      const result = await listUniverses(db, request.requester, {
        limit,
        ...(cursor ? { cursor } : {}),
      });
      return {
        data: await reads(db, request, result.items, spoilers),
        nextCursor: result.nextCursor,
      } as never;
    },
  );

  app.get(
    '/universes/by-slug/:slug',
    {
      schema: {
        ...universeTag,
        summary: 'Get a universe by its address',
        description: `${UNIVERSE_DOC} The universe at /u/{slug}, for anyone who can read it, listed or not (a link-only universe opens this way). Anyone else gets a 404, as for an address that's free.`,
        operationId: 'universes.bySlug',
        // It finds the universe itself, then asks universeAccess, as the guard would.
        ...routeAccess({ scope: 'open' }),
        params: z.object({ slug: z.string().min(1).max(100) }),
        querystring: readQuery,
        response: { 200: envelope(UniverseRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const record = await getUniverseBySlug(db, slug).catch((error: unknown) => {
        if (error instanceof NotFound) return null;
        throw error;
      });
      const [data] = record ? await reads(db, request, [record], request.query.spoilers) : [];
      // Hidden reads exactly like missing.
      if (!data) {
        return reply
          .code(404)
          .type('application/problem+json')
          .send(problem(404, `No universe at /u/${slug}.`));
      }
      // Private and link-only universes are kept out of search engines (M8-T12).
      if (data.visibility !== 'public') void reply.header('x-robots-tag', 'noindex');
      return { data };
    },
  );

  app.post(
    '/universes',
    {
      schema: {
        ...universeTag,
        summary: 'Create a universe',
        description: `${UNIVERSE_DOC} With accounts, the new universe belongs to the account that makes it and starts private.`,
        operationId: 'universes.create',
        ...routeAccess({ scope: 'editor', newUniverse: true }),
        body: UniverseCreate,
        response: { 201: envelope(UniverseRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { requester } = request;
      // With accounts, the maker owns it, private (D-34); locally, it's the installation's.
      const placement =
        requester.kind === 'account'
          ? { ownerId: requester.account.id, visibility: 'private' as const }
          : INSTALLATION_OWN;
      const data = await inBatch(db, request, reply, 'Create universe', {}, async (tx, batchId) => {
        const universe = await createUniverse(tx, request.body, placement);
        // The batch couldn't name its universe before the universe existed.
        await tx
          .update(schema.changeBatches)
          .set({ universeId: universe.id })
          .where(eq(schema.changeBatches.id, batchId));
        return one(await reads(tx, request, [universe]));
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
      return { data: one(await reads(db, request, [universe], request.query.spoilers)) };
    },
  );

  app.patch(
    '/universes/:universeId',
    {
      schema: {
        ...universeTag,
        summary: 'Update a universe',
        description: `${UNIVERSE_DOC} Its owner alone changes its address (\`slug\`) and \`visibility\`: \`private\`, \`link\` (anyone with the share link, \`/u/{slug}?k={shareKey}\`) or \`public\`. A visibility isn't content: it isn't in History and can't be reverted, and it's recorded in the access log instead (M8-T12).`,
        operationId: 'universes.update',
        ...routeAccess({ scope: 'universe', ownFields: ['slug', 'visibility'] }),
        params: universeParams,
        body: UniverseUpdate,
        response: { 200: envelope(UniverseRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { universeId } = request.params;
      const { visibility, version: _version, ...content } = request.body;
      // Who may see it is changed in a browser, never with an API token (M8-T2).
      if (visibility !== undefined) await requireSession(auth)(request);
      const apply = async (tx: Executor) => {
        await updateUniverse(tx, universeId, request.body);
        if (visibility !== undefined) {
          await setVisibility(tx, request.requester, universeId, visibility);
        }
        return one(await reads(tx, request, [await getUniverse(tx, universeId)]));
      };
      // Only a visibility: nothing for History to show or undo (D-41), so no change batch.
      const data =
        visibility !== undefined && Object.keys(content).length === 0
          ? await db.transaction(apply)
          : await inBatch(db, request, reply, 'Edit universe', { universeId }, apply);
      return { data };
    },
  );

  app.delete(
    '/universes/:universeId',
    {
      schema: {
        ...universeTag,
        summary: 'Delete a universe and everything in it',
        description: `${UNIVERSE_DOC} Only its owner may, signed in, with a confirmation: a current two-factor code in \`X-GE-TOTP\`, or, for an account with codes off, its password in \`X-GE-Password\`, percent-encoded (D-47) (M8-T12). It can't be undone.`,
        operationId: 'universes.delete',
        ...routeAccess({ scope: 'universe', level: 'own', session: true }),
        params: universeParams,
        body: versionBody,
        response: { 204: z.null(), ...problemResponses },
      },
      preHandler: requireConfirmation(auth),
    },
    async (request, reply) => {
      const { universeId } = request.params;
      await inBatch(db, request, reply, 'Delete universe', {}, async (tx) => {
        const universe = await getUniverse(tx, universeId);
        // Recorded first: the row keeps the names once the universe's id is gone.
        await recordAccessEvent(tx, request.requester, {
          action: 'universe.delete',
          universeId,
          detail: { slug: universe.slug, name: universe.namePlain },
        });
        await deleteUniverse(tx, universeId, request.body.version);
      });
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
        viewer: viewerFor(request.universeAccess, { includeDrafts }),
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
        viewerFor(request.universeAccess, { includeDrafts }),
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
