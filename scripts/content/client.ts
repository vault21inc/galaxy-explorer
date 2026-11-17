import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

/**
 * Talks to a Galaxy Explorer site the way an outside agent does: the REST API for what MCP has
 * no tool for (making a universe and a map), and the MCP server's tools for everything else.
 *
 * - `GE_API_URL`: the site's origin, such as https://galaxy.example (default: the local API).
 * - `GE_MCP_URL`: the MCP endpoint (default: `${GE_API_URL}/mcp`, or the local `pnpm mcp:http`).
 * - `GE_API_TOKEN`, or `GE_API_TOKEN_FILE` (a file holding it): a write token from the account
 *   page, needed in front of an API with accounts. Read from a file so it never shows in a
 *   shell's history.
 */
const LOCAL_API = 'http://127.0.0.1:3100';
const apiUrl = (process.env.GE_API_URL ?? LOCAL_API).replace(/\/$/, '');
const mcpUrl =
  process.env.GE_MCP_URL ?? (apiUrl === LOCAL_API ? 'http://127.0.0.1:3110/mcp' : `${apiUrl}/mcp`);

function token(): string | undefined {
  if (process.env.GE_API_TOKEN) return process.env.GE_API_TOKEN;
  const file = process.env.GE_API_TOKEN_FILE?.replace(/^~(?=\/)/, homedir());
  return file ? readFileSync(file, 'utf8').trim() : undefined;
}

function headers(): Record<string, string> {
  const bearer = token();
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  };
}

export function describeTarget(): string {
  return `API ${apiUrl}, MCP ${mcpUrl}`;
}

/** A REST call; returns the response's `data`, or throws the API's problem. */
export async function rest(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: headers(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json: unknown = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json)}`);
  return field(json, 'data');
}

let requestId = 0;

/** One MCP tool call over Streamable HTTP; returns the tool's JSON result. */
export async function callTool(name: string, args: unknown): Promise<unknown> {
  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++requestId,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const json: unknown = await response.json();
  const error = field(json, 'error');
  if (error !== undefined) throw new Error(`${name}: ${JSON.stringify(error)}`);
  const result = field(json, 'result');
  const content = field(result, 'content');
  const text = Array.isArray(content)
    ? content
        .map((part) => {
          const text = field(part, 'text');
          return typeof text === 'string' ? text : '';
        })
        .join('\n')
    : '';
  if (field(result, 'isError') === true) throw new Error(`${name}: ${text}`);
  return JSON.parse(text) as unknown;
}

/** Reads one property of a JSON value, or undefined. */
export function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** The `data` list of a list tool's result, as records. */
export function listOf(result: unknown): Record<string, unknown>[] {
  const data = field(result, 'data');
  if (!Array.isArray(data)) throw new Error(`Expected a list: ${JSON.stringify(result)}`);
  return data.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  );
}
