import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.ts';

/**
 * Remote MCP (M8-T2): the same server as `pnpm mcp`, over MCP's Streamable HTTP transport, for
 * agents that aren't on the machine running the API. It answers at `/mcp`, and in production
 * runs as its own service behind Caddy (architecture.md §14).
 *
 * - **Every request needs an API token** (`Authorization: Bearer ge_…`), checked with the API
 *   before anything else, so a revoked token, or one whose account is disabled, is refused at
 *   once with a 401 that MCP clients understand. The token then goes with each call the tools
 *   make, and the API applies it as it would to any request: the agent can do what the token's
 *   account may, narrowed by the token, and nothing else.
 * - The one exception: on your own machine, in front of an API with no accounts
 *   (`GE_AUTH_MODE=none`) and listening only on a loopback address, it needs no token, as
 *   `pnpm mcp` doesn't.
 * - **Stateless:** each POST gets a fresh server, so nothing about one agent lingers for the
 *   next, and any number of instances can run side by side. Responses are plain JSON rather
 *   than event streams: the tools answer at once, with nothing to stream.
 * - **Only the hosts it's meant for:** a request whose `Host` isn't one of `allowedHosts` is
 *   refused, so a web page can't reach a local server by pointing a name of its own at
 *   127.0.0.1 (DNS rebinding).
 */

export interface McpHttpOptions {
  /** The API's origin (`GE_API_URL`). */
  apiUrl: string;
  /** The `Host` headers to answer, such as `127.0.0.1:3110` and the public site's host. */
  allowedHosts: readonly string[];
  /** Whether a token is needed even when the API has no accounts: when it's reachable from afar. */
  requireToken: boolean;
  /** A fetch to use instead of the global one, for tests. */
  fetch?: typeof globalThis.fetch;
}

/** How long the API's auth mode is trusted before it's asked again. */
const AUTH_MODE_TTL_MS = 60_000;

type Gate = { ok: true; apiToken?: string } | { ok: false; status: number; message: string };

/** The token an `Authorization` header carries, if it's a bearer one. */
function bearerOf(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return match?.[1];
}

/** A JSON-RPC error, as MCP clients expect a refusal to look, with the HTTP status beside it. */
function refuse(res: ServerResponse, status: number, message: string, headers = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message }, id: null }));
}

export function createMcpHttpServer(options: McpHttpOptions): Server {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const apiUrl = options.apiUrl.replace(/\/+$/, '');
  const hosts = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
  let authMode: { value: string; at: number } | null = null;

  /** Whether the API has accounts (`/api/health`), asked at most once a minute. */
  async function apiHasAccounts(): Promise<boolean> {
    if (!authMode || Date.now() - authMode.at > AUTH_MODE_TTL_MS) {
      const response = await fetchFn(`${apiUrl}/api/health`);
      const health = (await response.json()) as { data?: { authMode?: string } };
      // Anything but a clear "none" is taken as accounts: then a token is always asked for.
      authMode = { value: health.data?.authMode ?? 'required', at: Date.now() };
    }
    return authMode.value !== 'none';
  }

  /** Whether to serve this request, and with which token. */
  async function gate(request: IncomingMessage): Promise<Gate> {
    const token = bearerOf(request.headers.authorization);
    const tokenNeeded = options.requireToken || (await apiHasAccounts());
    if (!token) {
      if (!tokenNeeded) return { ok: true };
      return {
        ok: false,
        status: 401,
        message:
          'Send an API token as `Authorization: Bearer ge_…`. Make one on your account page, under API tokens.',
      };
    }
    if (!tokenNeeded) return { ok: true };
    const response = await fetchFn(`${apiUrl}/api/v1/auth/token`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.ok) return { ok: true, apiToken: token };
    if (response.status === 401 || response.status === 403) {
      const problem = (await response.json().catch(() => ({}))) as { detail?: string };
      return { ok: false, status: 401, message: problem.detail ?? 'This API token doesn’t work.' };
    }
    if (response.status === 404) {
      // An API without accounts has no tokens to check them against.
      return {
        ok: false,
        status: 502,
        message:
          'The API has no accounts (GE_AUTH_MODE=none), so no token can be checked. Listen on a loopback address to use it without one.',
      };
    }
    return { ok: false, status: 502, message: `The API answered ${String(response.status)}.` };
  }

  async function handle(request: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(request.url ?? '/', 'http://mcp.invalid').pathname;
    if (path === '/health' && request.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (path !== '/mcp') {
      refuse(res, 404, `Nothing at ${path}: MCP is at /mcp.`);
      return;
    }
    if (!hosts.has((request.headers.host ?? '').toLowerCase())) {
      refuse(res, 403, 'This server doesn’t answer to that host name.');
      return;
    }
    // Stateless: no event stream to open with a GET, and no session to end with a DELETE.
    if (request.method !== 'POST') {
      refuse(res, 405, 'Send MCP messages with POST.', { allow: 'POST' });
      return;
    }
    let gated: Gate;
    try {
      gated = await gate(request);
    } catch (error) {
      refuse(res, 502, `The API can’t be reached: ${String(error)}`);
      return;
    }
    if (!gated.ok) {
      // RFC 6750 §3: tells a client that a bearer token is what's wanted.
      const challenge =
        gated.status === 401 ? { 'www-authenticate': 'Bearer realm="galaxy-explorer"' } : {};
      refuse(res, gated.status, gated.message, challenge);
      return;
    }

    const server = createMcpServer({
      apiUrl,
      ...(gated.apiToken ? { apiToken: gated.apiToken } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    // No session id generator: the stateless mode, where each request stands alone.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, res);
  }

  return createServer((request, res) => {
    handle(request, res).catch((error: unknown) => {
      if (!res.headersSent) refuse(res, 500, `The MCP server failed: ${String(error)}`);
      else res.end();
    });
  });
}
