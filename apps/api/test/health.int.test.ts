import { withTestDb } from '@ge/db/testing';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.ts';
import { testConfig, UNREACHABLE_DATABASE_URL } from './helpers.ts';

/** Calls GET /api/health on a server using `databaseUrl`, then closes the server. */
async function getHealth(databaseUrl: string) {
  const app = await buildServer(testConfig({ databaseUrl }));
  try {
    return await app.inject({ method: 'GET', url: '/api/health' });
  } finally {
    await app.close();
  }
}

describe('GET /api/health', () => {
  it('reports ok when the database answers', () =>
    withTestDb(async (_db, url) => {
      const response = await getHealth(url);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          status: 'ok',
          db: 'ok',
          version: '0.0.0',
          authMode: 'none',
          canEdit: true,
          homeUniverse: null,
          homePath: null,
        },
      });
    }));

  it('reports 503 and db down when the database is unreachable', async () => {
    const response = await getHealth(UNREACHABLE_DATABASE_URL);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      data: {
        status: 'degraded',
        db: 'down',
        version: '0.0.0',
        authMode: 'none',
        canEdit: true,
        homeUniverse: null,
        homePath: null,
      },
    });
  });

  it('names the home universe for signed-out visitors when one is set (D-51)', () =>
    withTestDb(async (_db, url) => {
      const home = { universe: 'milky-way', path: '/u/milky-way/present-day?cam=1,2,3,0,0,0' };
      const app = await buildServer(testConfig({ databaseUrl: url, home }));
      try {
        const response = await app.inject({ method: 'GET', url: '/api/health' });
        expect(response.json()).toMatchObject({
          data: { homeUniverse: 'milky-way', homePath: '/u/milky-way/present-day?cam=1,2,3,0,0,0' },
        });
      } finally {
        await app.close();
      }
    }));
});
