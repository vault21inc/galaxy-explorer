import { CONFIG_RESOURCES, configResources, ENTITY_KINDS, entityKinds } from '@ge/domain';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { batchLabel, buildTools, createMcpServer } from '../src/index.ts';

/** The MCP server's tools (M7-T7): generated from the registries, described by the API. */

/** What the registries promise: each kind's six tools, each settings resource's four. */
function expectedNames(): string[] {
  const kinds = ENTITY_KINDS.flatMap((kind) =>
    ['list', 'get', 'create', 'update', 'delete', 'upsert_by_key'].map(
      (action) => `${entityKinds[kind].plural}_${action}`,
    ),
  );
  const settings = CONFIG_RESOURCES.flatMap((resource) =>
    ['list', 'create', 'update', 'delete'].map((action) => `${resource}_${action}`),
  );
  const shared = [
    'batch',
    'history_list',
    'history_revert',
    'search',
    'view_galaxy',
    'view_system',
    'view_orbit',
    'universes_list',
    'maps_list',
    'import_dry_run',
  ];
  return [...kinds, ...settings, ...shared].sort();
}

async function listed() {
  const server = createMcpServer({ apiUrl: 'http://127.0.0.1:9' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(clientSide);
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

describe('the MCP tools', () => {
  it('are one set per entity kind and settings resource in the registries, plus the shared ones', async () => {
    const tools = await listed();
    expect(tools.map((tool) => tool.name).sort()).toEqual(expectedNames());
    // Each kind's tools call that kind's routes.
    for (const kind of ENTITY_KINDS) {
      const { plural } = entityKinds[kind];
      const create = buildTools().find((tool) => tool.name === `${plural}_create`);
      expect(create?.operation.operationId).toBe(`${plural}.create`);
    }
    for (const resource of CONFIG_RESOURCES) {
      const list = buildTools().find((tool) => tool.name === `${resource}_list`);
      expect(list?.operation.operationId).toBe(`${configResources[resource].plural}.list`);
    }
  });

  it('take what the routes take, described for an agent, with standalone schemas', async () => {
    for (const tool of await listed()) {
      expect(tool.name).toMatch(/^[a-z0-9_]{1,64}$/);
      expect(tool.description?.length, tool.name).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
      // Every reference resolves inside the schema itself.
      const text = JSON.stringify(tool.inputSchema);
      for (const [, name] of text.matchAll(/"#\/\$defs\/([^"]+)"/g)) {
        expect(
          (tool.inputSchema.$defs as Record<string, unknown> | undefined)?.[name ?? ''],
        ).toBeDefined();
      }
      expect(text).not.toContain('#/components/');
    }
    const create = buildTools().find((tool) => tool.name === 'objects_create');
    expect(create?.inputSchema.required).toEqual(
      expect.arrayContaining(['mapId', 'name', 'baseType']),
    );
    expect(create?.writes).toBe(true);
    expect(create?.description).toContain('history_revert');
    // An upsert's key is its path's, not a body field.
    expect(buildTools().find((tool) => tool.name === 'objects_upsert_by_key')?.layout.path).toEqual(
      ['mapId', 'externalKey'],
    );
  });

  it('label an agent’s changes for the History panel', () => {
    expect(batchLabel('objects_create', 'Gudrun')).toBe('MCP: objects_create — Gudrun');
    expect(batchLabel('batch', '')).toBe('MCP: batch');
    expect(batchLabel('objects_create', 'x'.repeat(300))).toHaveLength(200);
  });
});
