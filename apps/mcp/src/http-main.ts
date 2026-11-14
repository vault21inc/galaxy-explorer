import { createMcpHttpServer } from './http.ts';

/**
 * `pnpm mcp:http`: the MCP server over Streamable HTTP (M8-T2), at http://127.0.0.1:3110/mcp by
 * default. Agents connect with an API token from the account page (apps/mcp/README.md).
 *
 * - `GE_API_URL`: the API (default http://127.0.0.1:3100).
 * - `GE_MCP_HOST`, `GE_MCP_PORT`: where to listen (default 127.0.0.1 and 3110). Listening
 *   anywhere but a loopback address, every request needs a token, whatever the API's mode.
 * - `GE_PUBLIC_URL`: the site's address, when it's served behind Caddy: its host is answered too.
 */
const apiUrl = process.env.GE_API_URL ?? 'http://127.0.0.1:3100';
const host = process.env.GE_MCP_HOST ?? '127.0.0.1';
const port = Number(process.env.GE_MCP_PORT ?? '3110');
const publicUrl = process.env.GE_PUBLIC_URL;

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const server = createMcpHttpServer({
  apiUrl,
  allowedHosts: [
    `127.0.0.1:${String(port)}`,
    `localhost:${String(port)}`,
    `[::1]:${String(port)}`,
    ...(publicUrl ? [new URL(publicUrl).host] : []),
  ],
  requireToken: !LOOPBACK.has(host),
});
server.listen(port, host, () => {
  console.error(
    `Galaxy Explorer MCP server: http://${host}:${String(port)}/mcp, for the API at ${apiUrl}.`,
  );
});
