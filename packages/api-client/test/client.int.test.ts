import { describe, expect, expectTypeOf, inject, it } from 'vitest';
import { ApiError, createApiClient, unwrap } from '../src/index.ts';

/** The typed client against the real API (M1-T10). */

const baseUrl = inject('apiBaseUrl') ?? '';
const plain = (source: string) => ({ format: 'plain' as const, source });

describe('the typed client', () => {
  it('calls the health endpoint', async () => {
    const api = createApiClient({ baseUrl });
    const health = await unwrap(api.GET('/api/health'));
    expect(health).toMatchObject({ status: 'ok', db: 'ok' });
    expectTypeOf(health.status).toEqualTypeOf<'ok' | 'degraded'>();
  });

  it('creates, reads, lists, updates and deletes objects, typed end to end', async () => {
    const batches: string[] = [];
    const api = createApiClient({ baseUrl, onBatch: (batchId) => batches.push(batchId) });
    const slug = `client-${String(Date.now())}`;
    const universe = await unwrap(
      api.POST('/api/v1/universes', { body: { slug, name: plain('Client test') } }),
    );
    const map = await unwrap(
      api.POST('/api/v1/universes/{universeId}/maps', {
        params: { path: { universeId: universe.id } },
        body: { slug: 'main', name: plain('Main') },
      }),
    );
    const system = await unwrap(
      api.POST('/api/v1/maps/{mapId}/objects', {
        params: { path: { mapId: map.id } },
        body: { name: plain('Gudrun'), baseType: 'system', explorable: true, x: 12 },
      }),
    );
    expectTypeOf(system.baseType).toEqualTypeOf<
      | 'system'
      | 'star'
      | 'planet'
      | 'moon'
      | 'asteroid_belt'
      | 'station'
      | 'nebula'
      | 'anomaly'
      | 'black_hole'
      | 'marker'
    >();
    expect(system).toMatchObject({ namePlain: 'Gudrun', x: 12, version: 1 });

    const read = await unwrap(
      api.GET('/api/v1/objects/{id}', {
        params: { path: { id: system.id }, query: { include: 'facts' } },
      }),
    );
    expect(read.facts).toEqual([]);

    const page = await unwrap(
      api.GET('/api/v1/maps/{mapId}/objects', {
        params: { path: { mapId: map.id }, query: { parentId: 'null' } },
      }),
    );
    expect(page.data.map((item) => item.id)).toEqual([system.id]);
    expect(page.nextCursor).toBeNull();

    const moved = await unwrap(
      api.PATCH('/api/v1/objects/{id}', {
        params: { path: { id: system.id } },
        body: { version: 1, x: 40 },
      }),
    );
    expect(moved).toMatchObject({ x: 40, version: 2 });

    expect(
      await unwrap(
        api.DELETE('/api/v1/objects/{id}', {
          params: { path: { id: system.id } },
          body: { version: 2 },
        }),
      ),
    ).toBeUndefined();
    // Universe, map, create, update and delete: five writes, five batches for undo.
    expect(batches).toHaveLength(5);
  });

  it('throws ApiError with the problem document', async () => {
    const api = createApiClient({ baseUrl });
    const missing = await unwrap(
      api.GET('/api/v1/objects/{id}', {
        params: { path: { id: '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b' } },
      }),
    ).catch((error: unknown) => error);
    expect(missing).toBeInstanceOf(ApiError);
    expect(missing).toMatchObject({ status: 404, problem: { status: 404, title: 'Not Found' } });

    const universe = await unwrap(
      api.POST('/api/v1/universes', {
        body: { slug: `rules-${String(Date.now())}`, name: plain('Rules') },
      }),
    );
    const map = await unwrap(
      api.POST('/api/v1/universes/{universeId}/maps', {
        params: { path: { universeId: universe.id } },
        body: { slug: 'main', name: plain('Main') },
      }),
    );
    const broken = await unwrap(
      api.POST('/api/v1/maps/{mapId}/objects', {
        params: { path: { mapId: map.id } },
        body: { name: plain('Moon'), baseType: 'moon' },
      }),
    ).catch((error: unknown) => error);
    expect(broken).toMatchObject({ status: 422, problem: { errors: [{ path: '/parentId' }] } });
    expect((broken as ApiError).message).toMatch(/can't be at the top level/);
  });

  it('sends the Authorization header from getAuthHeader', async () => {
    const seen: (string | null)[] = [];
    const api = createApiClient({
      baseUrl,
      getAuthHeader: () => 'Bearer ge_test',
      fetch: (input) => {
        seen.push(input instanceof Request ? input.headers.get('authorization') : null);
        return fetch(input);
      },
    });
    await unwrap(api.GET('/api/health'));
    expect(seen).toEqual(['Bearer ge_test']);
  });
});
