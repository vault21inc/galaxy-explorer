import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createMcpHttpServer } from '../src/http.ts';

/**
 * Remote MCP's door (M8-T2): which requests get through, and with which token, against a
 * stand-in API. test/mcp.int.test.ts runs it against the real one.
 */

const GOOD = `ge_${'a'.repeat(43)}`;
const REVOKED = `ge_${'r'.repeat(43)}`;

/** The API, as far as the door asks it: its auth mode, a token's check, and the universe list. */
function fakeApi(authMode: 'none' | 'required') {
  const seen: { url: string; authorization: string | null }[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const request = new Request(input, init);
    const authorization = request.headers.get('authorization');
    seen.push({ url: new URL(request.url).pathname, authorization });
    const json = (status: number, body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const path = new URL(request.url).pathname;
    if (path === '/api/health') return json(200, { data: { status: 'ok', authMode } });
    if (path === '/api/v1/auth/token') {
      if (authMode === 'none') return json(404, { detail: 'No accounts.' });
      return authorization === `Bearer ${GOOD}`
        ? json(200, { data: { name: 'agent', username: 'aemos' } })
        : json(401, { detail: 'This API token doesn’t work: it was revoked.' });
    }
    if (path === '/api/v1/universes') return json(200, { data: [], nextCursor: null });
    return json(404, { detail: `No ${path}` });
  };
  return { fetch, seen };
}

let server: Server | null = null;

async function start(authMode: 'none' | 'required', requireToken = false) {
  const api = fakeApi(authMode);
  server = createMcpHttpServer({
    apiUrl: 'http://api.invalid',
    allowedHosts: [],
    requireToken,
    fetch: api.fetch,
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  // The test's own host, which the door must be told to answer to.
  server.close();
  server = createMcpHttpServer({
    apiUrl: 'http://api.invalid',
    allowedHosts: [`127.0.0.1:${String(port)}`],
    requireToken,
    fetch: api.fetch,
  });
  await new Promise<void>((resolve) => server?.listen(port, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${String(port)}/mcp`, api };
}

afterEach(async () => {
  const open = server;
  if (open) await new Promise((resolve) => open.close(resolve));
  server = null;
});

async function connect(url: string, token?: string): Promise<Client> {
  const client = new Client({ name: 'http-test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: token ? { headers: { authorization: `Bearer ${token}` } } : {},
  });
  await client.connect(transport);
  return client;
}

const initialize = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't' } },
    }),
  });

describe('remote MCP (M8-T2)', () => {
  it('serves a good token, and passes it on with every call the tools make', async () => {
    const { url, api } = await start('required');
    const client = await connect(url, GOOD);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('objects_create');
    const result = await client.callTool({ name: 'universes_list', arguments: {} });
    expect(result.isError ?? false).toBe(false);
    const listed = api.seen.filter((call) => call.url === '/api/v1/universes');
    expect(listed).toEqual([{ url: '/api/v1/universes', authorization: `Bearer ${GOOD}` }]);
    await client.close();
  });

  it('refuses a missing or revoked token with a 401 that asks for a bearer token', async () => {
    const { url } = await start('required');
    const missing = await initialize(url);
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toMatch(/^Bearer /);
    const revoked = await initialize(url, { authorization: `Bearer ${REVOKED}` });
    expect(revoked.status).toBe(401);
    expect(((await revoked.json()) as { error: { message: string } }).error.message).toMatch(
      /revoked/,
    );
  });

  it('needs no token on your own machine, in front of an API with no accounts', async () => {
    const { url } = await start('none');
    const client = await connect(url);
    expect((await client.listTools()).tools.length).toBeGreaterThan(10);
    await client.close();
    // Reachable from afar, it needs one even so, and has nothing to check it with.
    await new Promise((resolve) => server?.close(resolve));
    const remote = await start('none', true);
    expect((await initialize(remote.url)).status).toBe(401);
  });

  it('answers only at /mcp, only POST, and only to its own host names', async () => {
    const { url } = await start('required');
    expect((await fetch(url.replace('/mcp', '/other'))).status).toBe(404);
    const get = await fetch(url, { headers: { authorization: `Bearer ${GOOD}` } });
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    expect((await fetch(url.replace('/mcp', '/health'))).status).toBe(200);
    // A page that points a name of its own at this machine (DNS rebinding) is turned away.
    const rebound = await initialize(url.replace('127.0.0.1', 'localhost'), {
      authorization: `Bearer ${GOOD}`,
    });
    expect(rebound.status).toBe(403);
  });
});
