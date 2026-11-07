import SwaggerParser from '@apidevtools/swagger-parser';
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
  it('is valid OpenAPI 3.1 and lists the health route', async () => {
    const app = await startServer();
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    const document = response.json<OpenAPIV3_1.Document>();

    expect(response.statusCode).toBe(200);
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths ?? {})).toEqual(['/api/health']);
    await expect(SwaggerParser.validate(structuredClone(document))).resolves.toBeDefined();
  });

  it('serves the interactive docs page', async () => {
    const app = await startServer();
    const response = await app.inject({ method: 'GET', url: '/api/docs/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });
});
