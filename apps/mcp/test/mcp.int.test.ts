import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createMcpHttpServer, createMcpServer } from '../src/index.ts';

/**
 * The MCP server against the real API (M7-T7): an agent builds a system with a batch and
 * temporary references, and history_revert puts the database back as it was. The API runs in
 * its own process (test/api-server.ts); the database is read directly to check.
 */

const apiUrl = inject('apiUrl') ?? '';
const database = new pg.Client({ connectionString: inject('databaseUrl') ?? '' });
let client: Client;
let universeId = '';
let mapId = '';

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function post(path: string, body: object): Promise<{ id: string }> {
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as { data: { id: string } }).data;
}

/** A tool's result, parsed; fails the test if the tool reported an error. */
async function call(name: string, args: Record<string, unknown>): Promise<any> {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: { text: string }[];
    isError?: boolean;
  };
  expect(result.isError ?? false, result.content[0]?.text).toBe(false);
  return JSON.parse(result.content[0]?.text ?? 'null');
}

/** Every content row of the universe, to compare before and after. */
async function census() {
  const rows = await database.query(
    `select (select count(*) from entities where universe_id = $1)::int as entities,
            (select count(*) from celestial_objects where map_id = $2)::int as objects,
            (select count(*) from field_values f join entities e on e.id = f.entity_id
              where e.universe_id = $1)::int as facts`,
    [universeId, mapId],
  );
  return rows.rows[0] as { entities: number; objects: number; facts: number };
}

beforeAll(async () => {
  await database.connect();
  universeId = (
    await post('/universes', { slug: `mcp-${Date.now().toString(36)}`, name: plain('MCP') })
  ).id;
  mapId = (await post(`/universes/${universeId}/maps`, { slug: 'main', name: plain('Main') })).id;
  const server = createMcpServer({ apiUrl });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: 'galaxy-explorer-test', version: '1' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
  await database.end();
});

describe('the MCP server', () => {
  it('builds a system with a batch and temporary references, and history_revert undoes it all', async () => {
    const before = await census();
    const built = await call('batch', {
      description: 'build the Gudrun system',
      operations: [
        {
          op: 'create',
          kind: 'celestial_object',
          mapId,
          data: { name: plain('Gudrun System'), baseType: 'system', explorable: true },
        },
        {
          op: 'create',
          kind: 'celestial_object',
          mapId,
          data: { name: plain('Gudrun'), baseType: 'star', parentId: '$op:0' },
        },
        {
          op: 'create',
          kind: 'celestial_object',
          mapId,
          data: { name: plain('Gudrun I'), baseType: 'planet', parentId: '$op:0', x: 4 },
        },
        {
          op: 'create',
          kind: 'celestial_object',
          mapId,
          data: { name: plain('Gudrun II'), baseType: 'planet', parentId: '$op:0', x: 7 },
        },
      ],
    });
    expect(built.batchId).toEqual(expect.any(String));
    expect(built.result.results).toHaveLength(4);
    expect(await census()).toEqual({
      ...before,
      entities: before.entities + 4,
      objects: before.objects + 4,
    });

    // One more, by a single tool; the History panel names both as an agent's work.
    const single = await call('objects_create', {
      mapId,
      name: plain('Hubris'),
      baseType: 'system',
    });
    const history = await call('history_list', { universeId });
    const labels = history.data.map((batch: { description: string }) => batch.description);
    expect(labels).toEqual(
      expect.arrayContaining([
        'MCP: objects_create — Hubris',
        'MCP: batch — build the Gudrun system',
      ]),
    );

    await call('history_revert', { batchId: single.batchId });
    await call('history_revert', { batchId: built.batchId });
    expect(await census()).toEqual(before);
  });

  it('reads, updates by version, upserts by key without duplicating, and says what went wrong', async () => {
    const first = await call('objects_upsert_by_key', {
      mapId,
      externalKey: 'cadia',
      name: plain('Cadia'),
      baseType: 'system',
    });
    const again = await call('objects_upsert_by_key', {
      mapId,
      externalKey: 'cadia',
      name: plain('Cadia'),
      baseType: 'system',
      x: 10,
    });
    expect(again.result.id).toBe(first.result.id);

    const object = await call('objects_get', { id: first.result.id });
    const updated = await call('objects_update', {
      id: object.id,
      version: object.version,
      name: plain('Cadia Prime'),
    });
    expect(updated.result.namePlain).toBe('Cadia Prime');
    const found = await call('search', { universeId, q: 'cad' });
    expect(found.map((result: { name: string }) => result.name)).toContain('Cadia Prime');
    const view = await call('view_galaxy', { mapId });
    expect(view.objects.map((item: { id: string }) => item.id)).toContain(object.id);

    // A stale version is the API's 409, passed on as a tool error the agent can read.
    const stale = (await client.callTool({
      name: 'objects_update',
      arguments: { id: object.id, version: object.version, name: plain('Old') },
    })) as { content: { text: string }[]; isError?: boolean };
    expect(stale.isError).toBe(true);
    expect(stale.content[0]?.text).toMatch(/^409 /);

    const checked = await call('import_dry_run', {
      universeId,
      mapId,
      csv: 'name,base_type,external_key\nHubris,system,hubris\n',
    });
    expect(checked).toMatchObject({
      dryRun: true,
      blocked: false,
      counts: { objects: { create: 1 } },
    });
  });
});

describe('remote MCP (M8-T2)', () => {
  it('creates an object over Streamable HTTP, as one labelled batch', async () => {
    // The API here has no accounts, so on a loopback address the door needs no token; with
    // accounts, e2e/remote-mcp.spec.ts makes one on the account page and uses it.
    const probe = createMcpHttpServer({ apiUrl, allowedHosts: [], requireToken: false });
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise((resolve) => probe.close(resolve));
    const http = createMcpHttpServer({
      apiUrl,
      allowedHosts: [`127.0.0.1:${String(port)}`],
      requireToken: false,
    });
    await new Promise<void>((resolve) => http.listen(port, '127.0.0.1', resolve));
    const remote = new Client({ name: 'galaxy-explorer-http-test', version: '1' });
    try {
      await remote.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${String(port)}/mcp`)),
      );
      const result = (await remote.callTool({
        name: 'objects_create',
        arguments: { mapId, name: plain('Vigilus'), baseType: 'system' },
      })) as { content: { text: string }[]; isError?: boolean };
      expect(result.isError ?? false, result.content[0]?.text).toBe(false);
      const { batchId } = JSON.parse(result.content[0]?.text ?? '{}') as { batchId: string };
      const batch = await database.query('select description from change_batches where id = $1', [
        batchId,
      ]);
      expect(batch.rows[0]).toEqual({ description: 'MCP: objects_create — Vigilus' });
    } finally {
      await remote.close();
      await new Promise((resolve) => http.close(resolve));
    }
  });
});
