import { EXAMPLE_ID, rt } from '@ge/domain';
import { expect } from 'vitest';
import type { Config } from '../../src/config.ts';
import { buildServer, type ApiServer } from '../../src/server.ts';
import { testConfig } from '../helpers.ts';

/** A running API on a test database, called with `inject` (no network). */
export async function apiOn(url: string, overrides: Partial<Config> = {}): Promise<Api> {
  const app = await buildServer(testConfig({ databaseUrl: url, ...overrides }));
  return new Api(app);
}

export class Api {
  readonly app: ApiServer;

  constructor(app: ApiServer) {
    this.app = app;
  }

  async call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
    const response = await this.app.inject({
      method,
      url: `/api/v1${url}`,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return {
      status: response.statusCode,
      body: response.body ? response.json<Record<string, any>>() : {},
      batchId: response.headers['x-ge-batch-id'] as string | undefined,
    };
  }

  /** Calls and expects a status, with the body in the failure message to explain it. */
  async expect(
    status: number,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
  ) {
    const result = await this.call(method, url, payload);
    expect(result.status, JSON.stringify(result.body)).toBe(status);
    return result;
  }

  close() {
    return this.app.close();
  }
}

/** A universe with one map, made through the API. */
export async function newWorld(api: Api) {
  const universe = await api.expect(201, 'POST', '/universes', {
    slug: 'contract',
    name: rt.plain('Contract'),
  });
  const universeId = universe.body.data.id as string;
  const map = await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
    slug: 'main',
    name: rt.plain('Main'),
  });
  return { universeId, mapId: map.body.data.id as string };
}

type World = Awaited<ReturnType<typeof newWorld>>;

/**
 * How to get a real id for each reference field an example uses (EXAMPLE_ID in the registry).
 * Keyed by field name, not by kind: a new kind with a new kind of reference adds one line here,
 * and the suite fails with a clear message until it does.
 */
const REFERENCE_FIXTURES: Record<string, (api: Api, world: World) => Promise<string>> = {
  groupTypeId: async (api, world) =>
    (
      await api.expect(201, 'POST', `/universes/${world.universeId}/group-types`, {
        name: 'Sector',
        layer: 'Administrative',
        defaultColor: '#c8a24a',
      })
    ).body.data.id as string,
  categoryId: async (api, world) =>
    (
      await api.expect(201, 'POST', `/universes/${world.universeId}/event-categories`, {
        name: 'Battle',
        icon: 'swords',
        color: '#ff0000',
      })
    ).body.data.id as string,
  parentGroupTypeId: async (api, world) =>
    (
      await api.expect(201, 'POST', `/universes/${world.universeId}/group-types`, {
        name: 'Segmentum',
        layer: 'Administrative',
        defaultColor: '#123456',
      })
    ).body.data.id as string,
};

/** A registry example with its placeholder ids replaced by real ones. */
export async function bodyFrom(
  api: Api,
  world: World,
  example: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { ...example };
  for (const [field, value] of Object.entries(body)) {
    if (value !== EXAMPLE_ID) continue;
    const fixture = REFERENCE_FIXTURES[field];
    if (!fixture)
      throw new Error(`Add a REFERENCE_FIXTURES entry for "${field}" in test/contract/harness.ts.`);
    body[field] = await fixture(api, world);
  }
  return body;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;
