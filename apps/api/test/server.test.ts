import SwaggerParser from '@apidevtools/swagger-parser';
import { configResources, entityKinds } from '@ge/domain';
import type { OpenAPIV3_1 } from 'openapi-types';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildServer, type ApiServer } from '../src/server.ts';
import { testConfig } from './helpers.ts';

const servers: ApiServer[] = [];

async function startServer(addRoutes?: (app: ApiServer) => void) {
  const app = await buildServer(testConfig());
  addRoutes?.(app);
  servers.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
});

describe('problem responses', () => {
  it('answers unknown routes with a 404 problem document', async () => {
    const app = await startServer();
    const response = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'No route for GET /api/nope.',
    });
  });

  it('turns schema validation failures into a 400 with the failing paths', async () => {
    const app = await startServer((server) => {
      server.get(
        '/test/sum',
        { schema: { querystring: z.object({ a: z.coerce.number(), b: z.coerce.number() }) } },
        (request) => ({ sum: request.query.a + request.query.b }),
      );
    });
    const response = await app.inject({ method: 'GET', url: '/test/sum?a=1&b=two' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      title: 'Bad Request',
      status: 400,
      detail: 'The querystring is invalid.',
      errors: [{ path: '/b' }],
    });
  });

  it('hides the details of unexpected errors', async () => {
    const app = await startServer((server) => {
      server.get('/test/crash', () => {
        throw new Error('secret internals');
      });
    });
    const response = await app.inject({ method: 'GET', url: '/test/crash' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
    });
  });
});

describe('OpenAPI document', () => {
  async function openApiDocument() {
    const app = await startServer();
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    expect(response.statusCode).toBe(200);
    return response.json<OpenAPIV3_1.Document>();
  }

  // The first test here builds the server and the whole document, and the validator walks
  // every schema: about 0.1 s locally, but over 5 s once on a busy CI runner.
  it('is valid OpenAPI 3.1', { timeout: 30_000 }, async () => {
    const document = await openApiDocument();
    expect(document.openapi).toBe('3.1.0');
    await expect(SwaggerParser.validate(structuredClone(document))).resolves.toBeDefined();
  });

  it('has the routes of every registered entity kind and config resource', async () => {
    const paths = Object.keys((await openApiDocument()).paths ?? {});
    for (const kind of Object.values(entityKinds)) {
      const scope =
        kind.scope === 'map' ? '/api/v1/maps/{mapId}' : '/api/v1/universes/{universeId}';
      expect(paths).toEqual(
        expect.arrayContaining([
          `${scope}/${kind.plural}`,
          `${scope}/${kind.plural}/by-key/{externalKey}`,
          `/api/v1/${kind.plural}/{id}`,
        ]),
      );
    }
    for (const resource of Object.values(configResources)) {
      expect(paths).toEqual(
        expect.arrayContaining([
          `/api/v1/universes/{universeId}/${resource.plural}`,
          `/api/v1/${resource.plural}/{id}`,
        ]),
      );
    }
  });

  it('gives every operation a unique operationId, a declared tag and a description', async () => {
    const document = await openApiDocument();
    const declaredTags = (document.tags ?? []).map((tag) => tag.name);
    const methods = ['get', 'put', 'post', 'patch', 'delete'] as const;
    const operations = Object.values(document.paths ?? {}).flatMap((item) =>
      methods.flatMap((method) => {
        const operation = item?.[method];
        return operation ? [operation] : [];
      }),
    );
    const ids = operations.map((operation) => operation.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const operation of operations) {
      expect(operation.tags?.length, operation.operationId).toBeGreaterThan(0);
      for (const tag of operation.tags ?? [])
        expect(declaredTags, operation.operationId).toContain(tag);
      expect(operation.description ?? operation.summary, operation.operationId).toBeTruthy();
    }
  });

  it('serves the interactive docs page', async () => {
    const app = await startServer();
    const response = await app.inject({ method: 'GET', url: '/api/docs/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });
});
