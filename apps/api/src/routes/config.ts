import type { Database } from '@ge/db';
import {
  CONFIG_RESOURCES,
  configResources,
  configSchemasFor,
  type ConfigResource,
} from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { inBatch } from '../http/batch.ts';
import { envelope, idParams, listQuery, page, problemResponses } from '../http/schemas.ts';
import {
  createConfig,
  deleteConfig,
  getConfig,
  listConfig,
  updateConfig,
} from '../services/config-service.ts';

/**
 * The routes of every universe settings resource (group types, event categories, object
 * subtypes, field definitions), generated from the registry like the entity routes.
 */
export const configRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  for (const resource of CONFIG_RESOURCES) registerResource(app, db, resource);
  done();
};

type App = Parameters<FastifyPluginCallbackZod>[0];

function registerResource(app: App, db: Database, resource: ConfigResource): void {
  const def = configResources[resource];
  const schemas = configSchemasFor(resource);
  const { plural } = def;
  const one = def.label.one.toLowerCase();
  const docs = (summary: string, extra = '') => ({
    tags: [plural],
    summary,
    description: `${def.description}${extra ? `\n\n${extra}` : ''}`,
  });
  const universeParams = z.object({ universeId: z.uuid() });

  app.get(
    `/universes/:universeId/${plural}`,
    {
      schema: {
        ...docs(`List ${def.label.many.toLowerCase()}`),
        operationId: `${plural}.list`,
        params: universeParams,
        querystring: listQuery,
        response: { 200: page(schemas.read), ...problemResponses },
      },
    },
    async (request) => {
      const { cursor, limit } = request.query;
      const result = await listConfig(db, resource, request.params.universeId, {
        limit,
        ...(cursor ? { cursor } : {}),
      });
      return { data: result.items, nextCursor: result.nextCursor } as never;
    },
  );

  app.post(
    `/universes/:universeId/${plural}`,
    {
      schema: {
        ...docs(
          `Create a ${one}`,
          `Example body:\n\n\`\`\`json\n${JSON.stringify(def.example, null, 2)}\n\`\`\``,
        ),
        operationId: `${plural}.create`,
        params: universeParams,
        body: schemas.create,
        response: { 201: envelope(schemas.read), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { universeId } = request.params;
      const data = await inBatch(db, request, reply, `Create ${one}`, { universeId }, (tx) =>
        createConfig(tx, resource, universeId, request.body),
      );
      return reply.code(201).send({ data });
    },
  );

  app.get(
    `/${plural}/:id`,
    {
      schema: {
        ...docs(`Get a ${one}`),
        operationId: `${plural}.get`,
        params: idParams,
        response: { 200: envelope(schemas.read), ...problemResponses },
      },
    },
    async (request) => ({ data: await getConfig(db, resource, request.params.id) }),
  );

  app.patch(
    `/${plural}/:id`,
    {
      schema: {
        ...docs(
          `Update a ${one}`,
          'Send only the fields to change. Settings have no version: the last write wins.',
        ),
        operationId: `${plural}.update`,
        params: idParams,
        body: schemas.update,
        response: { 200: envelope(schemas.read), ...problemResponses },
      },
    },
    async (request, reply) => {
      const current = await getConfig(db, resource, request.params.id);
      const data = await inBatch(
        db,
        request,
        reply,
        `Edit ${one}`,
        { universeId: current.universeId },
        (tx) => updateConfig(tx, resource, request.params.id, request.body),
      );
      return { data };
    },
  );

  app.delete(
    `/${plural}/:id`,
    {
      schema: {
        ...docs(
          `Delete a ${one}`,
          'Fails with 422 while something still uses it, such as a group type with groups.',
        ),
        operationId: `${plural}.delete`,
        params: idParams,
        response: { 204: z.null().describe('Deleted.'), ...problemResponses },
      },
    },
    async (request, reply) => {
      const current = await getConfig(db, resource, request.params.id);
      await inBatch(db, request, reply, `Delete ${one}`, { universeId: current.universeId }, (tx) =>
        deleteConfig(tx, resource, request.params.id),
      );
      return reply.code(204).send(null);
    },
  );
}
