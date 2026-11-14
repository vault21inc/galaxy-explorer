import { schema, type Database } from '@ge/db';
import { eq } from 'drizzle-orm';
import { ENTITY_KINDS, entityKinds, schemasFor, type EntityKind } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { inBatch } from '../http/batch.ts';
import {
  envelope,
  idParams,
  includeQuery,
  includesOf,
  listQuery,
  page,
  problemResponses,
  readQuery,
  versionBody,
} from '../http/schemas.ts';
import { getEntity, listEntities } from '../services/entity-read.ts';
import {
  createEntity,
  deleteEntity,
  updateEntity,
  upsertEntityByKey,
} from '../services/entity-service.ts';
import { applySpoilers } from '../services/redaction.ts';
import { viewerFor } from '../services/visibility.ts';
import { entityResponse, extensionFilters, filterQuery } from './entity-schemas.ts';

/**
 * The REST routes of every entity kind, generated from the registry (architecture.md §3.1,
 * §5). Adding a kind to the registry adds its routes, docs and contract tests; nothing here
 * names a kind.
 */
export const entityRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  for (const kind of ENTITY_KINDS) registerKind(app, db, kind);
  done();
};

type App = Parameters<FastifyPluginCallbackZod>[0];

function registerKind(app: App, db: Database, kind: EntityKind): void {
  const def = entityKinds[kind];
  const schemas = schemasFor(kind);
  const { plural } = def;
  const one = def.label.one.toLowerCase();
  // "an object", "an event", "a group": the summaries are read by people and LLM agents.
  const aOne = `${/^[aeiou]/.test(one) ? 'an' : 'a'} ${one}`;
  const response = entityResponse(kind);
  const scoped = def.scope === 'map';
  const scopeParams = scoped ? z.object({ mapId: z.uuid() }) : z.object({ universeId: z.uuid() });
  const scopePath = scoped ? '/maps/:mapId' : '/universes/:universeId';
  const scopeOf = (params: { mapId?: string; universeId?: string }) =>
    scoped ? { mapId: params.mapId ?? '' } : { universeId: params.universeId ?? '' };
  /**
   * The universe a write belongs to, so its batch shows in that universe's history. Unknown
   * ids give no universe here; the service then answers 404.
   */
  const universeOfScope = async (params: { mapId?: string; universeId?: string }) => {
    if (!scoped) return { universeId: params.universeId ?? null };
    const [map] = await db
      .select({ universeId: schema.maps.universeId })
      .from(schema.maps)
      .where(eq(schema.maps.id, params.mapId ?? ''));
    return { universeId: map?.universeId ?? null };
  };
  const universeOfEntity = async (id: string) => {
    const [entity] = await db
      .select({ universeId: schema.entities.universeId })
      .from(schema.entities)
      .where(eq(schema.entities.id, id));
    return { universeId: entity?.universeId ?? null };
  };
  const docs = (summary: string, extra = '') => ({
    tags: [plural],
    summary,
    description: `${def.description}${extra ? `\n\n${extra}` : ''}`,
  });

  app.get(
    `${scopePath}/${plural}`,
    {
      schema: {
        ...docs(`List ${def.label.many.toLowerCase()}`),
        operationId: `${plural}.list`,
        params: scopeParams,
        querystring: listQuery.extend(readQuery.shape).extend(filterQuery(kind).shape),
        response: { 200: page(response), ...problemResponses },
      },
    },
    async (request) => {
      const query = request.query as Record<string, unknown> &
        z.infer<typeof listQuery> &
        z.infer<typeof readQuery>;
      const result = await listEntities(db, kind, scopeOf(request.params), {
        viewer: viewerFor(request.universeAccess, { includeDrafts: query.includeDrafts }),
        where: extensionFilters(kind, query),
        ...(typeof query.status === 'string'
          ? { status: query.status as 'draft' | 'published' }
          : {}),
        ...(typeof query.q === 'string' ? { q: query.q } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        limit: query.limit,
      });
      return {
        data: result.items.map((item) => applySpoilers(kind, item, query.spoilers)),
        nextCursor: result.nextCursor,
        // Typed loosely because the kind is only known at run time; the response schema checks
        // the shape on the way out (serializerCompiler).
      } as never;
    },
  );

  app.post(
    `${scopePath}/${plural}`,
    {
      schema: {
        ...docs(
          `Create ${aOne}`,
          `Example body:\n\n\`\`\`json\n${JSON.stringify(def.example, null, 2)}\n\`\`\``,
        ),
        operationId: `${plural}.create`,
        params: scopeParams,
        body: schemas.create,
        response: { 201: envelope(response), ...problemResponses },
      },
    },
    async (request, reply) => {
      const data = await inBatch(
        db,
        request,
        reply,
        `Create ${one}`,
        await universeOfScope(request.params),
        (tx) => createEntity(tx, kind, scopeOf(request.params), request.body as never),
      );
      return reply.code(201).send({ data } as never);
    },
  );

  app.put(
    `${scopePath}/${plural}/by-key/:externalKey`,
    {
      schema: {
        ...docs(
          `Create or update ${aOne} by its external key`,
          'Idempotent: the first call creates the entity with this `externalKey`, later calls update it (no `version` needed). Use this from scripts and LLM agents so re-running them never duplicates content.',
        ),
        operationId: `${plural}.upsertByKey`,
        params: scopeParams.extend({ externalKey: z.string().min(1).max(200) }),
        body: schemas.create,
        response: { 200: envelope(response), 201: envelope(response), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { externalKey, ...params } = request.params as {
        externalKey: string;
        mapId?: string;
        universeId?: string;
      };
      const { entity, created } = await inBatch(
        db,
        request,
        reply,
        `Upsert ${one} ${externalKey}`,
        await universeOfScope(params),
        (tx) => upsertEntityByKey(tx, kind, scopeOf(params), externalKey, request.body as never),
      );
      return reply.code(created ? 201 : 200).send({ data: entity } as never);
    },
  );

  app.get(
    `/${plural}/:id`,
    {
      schema: {
        ...docs(`Get ${aOne}`),
        operationId: `${plural}.get`,
        params: idParams,
        querystring: readQuery.extend(includeQuery.shape),
        response: { 200: envelope(response), ...problemResponses },
      },
    },
    async (request) => {
      const { spoilers, includeDrafts, include } = request.query;
      const read = await getEntity(db, kind, request.params.id, {
        viewer: viewerFor(request.universeAccess, { includeDrafts }),
        include: includesOf(include),
      });
      return { data: applySpoilers(kind, read, spoilers) } as never;
    },
  );

  app.patch(
    `/${plural}/:id`,
    {
      schema: {
        ...docs(
          `Update ${aOne}`,
          'Send only the fields to change, plus the `version` you read. A stale version returns 409 with the current record.',
        ),
        operationId: `${plural}.update`,
        params: idParams,
        body: schemas.update,
        response: { 200: envelope(response), ...problemResponses },
      },
    },
    async (request, reply) => {
      const data = await inBatch(
        db,
        request,
        reply,
        `Edit ${one}`,
        await universeOfEntity(request.params.id),
        (tx) => updateEntity(tx, kind, request.params.id, request.body as never),
      );
      return { data } as never;
    },
  );

  app.delete(
    `/${plural}/:id`,
    {
      schema: {
        ...docs(
          `Delete ${aOne}`,
          'Deletes what depends on it too (data-model §11); revert the batch to undo.',
        ),
        operationId: `${plural}.delete`,
        params: idParams,
        body: versionBody,
        response: { 204: z.null().describe('Deleted.'), ...problemResponses },
      },
    },
    async (request, reply) => {
      await inBatch(
        db,
        request,
        reply,
        `Delete ${one}`,
        await universeOfEntity(request.params.id),
        (tx) => deleteEntity(tx, kind, request.params.id, request.body.version),
      );
      return reply.code(204).send(null);
    },
  );
}
