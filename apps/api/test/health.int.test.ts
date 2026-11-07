import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, type ApiServer } from '../src/server.ts';
import { requireEnv, testConfig, UNREACHABLE_DATABASE_URL } from './helpers.ts';

const servers: ApiServer[] = [];

async function startServer(databaseUrl: string) {
  const app = await buildServer(testConfig({ databaseUrl }));
  servers.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
});

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    const app = await startServer(requireEnv('TEST_DATABASE_URL'));
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { status: 'ok', db: 'ok', version: '0.0.0' },
    });
  });

  it('reports 503 and db down when the database is unreachable', async () => {
    const app = await startServer(UNREACHABLE_DATABASE_URL);
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      data: { status: 'degraded', db: 'down', version: '0.0.0' },
    });
  });
});
