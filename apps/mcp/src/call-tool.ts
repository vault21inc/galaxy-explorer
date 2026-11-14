import type { ApiClient } from '@ge/api-client';
import type { HttpMethod } from './openapi.ts';
import type { Tool } from './tools.ts';

/**
 * Runs one tool call against the API (M7-T7) through @ge/api-client, and says what happened in
 * a form an agent reads well: the result as JSON, and for a write, the batch to revert it by.
 */

type Args = Record<string, unknown>;

/** What a tool call returns over MCP: text content, flagged when it's an error. */
export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/**
 * The client called with a path known only at run time. openapi-fetch types each literal path;
 * the tools are generated, so they call it through this looser view of the same functions.
 */
type LooseCall = (
  path: string,
  init: {
    params?: { path?: Args; query?: Args };
    body?: unknown;
    headers?: Record<string, string>;
    bodySerializer?: (body: unknown) => unknown;
  },
) => Promise<{ data?: unknown; error?: unknown; response: Response }>;
export type LooseClient = Record<HttpMethod, LooseCall>;

export function loose(client: ApiClient): LooseClient {
  return client as unknown as LooseClient;
}

const pick = (args: Args, names: readonly string[]): Args =>
  Object.fromEntries(
    names.filter((name) => args[name] !== undefined).map((name) => [name, args[name]]),
  );

/** The longest batch description the API keeps. */
const MAX_DESCRIPTION = 200;

/** What a write is about, for its batch label: a name, a key, or an id. */
function subjectOf(args: Args): string {
  const name = args.name as { source?: unknown } | undefined;
  if (typeof name?.source === 'string') return name.source;
  for (const field of ['externalKey', 'slug', 'id', 'batchId', 'mapId', 'universeId']) {
    if (typeof args[field] === 'string') return args[field];
  }
  return '';
}

/** "MCP: objects_create — Gudrun": how an agent's change reads in the History panel. */
export function batchLabel(tool: string, subject: string): string {
  return (subject ? `MCP: ${tool} — ${subject}` : `MCP: ${tool}`).slice(0, MAX_DESCRIPTION);
}

export async function callTool(client: ApiClient, tool: Tool, args: Args): Promise<ToolResult> {
  const { operation, layout } = tool;
  let body: unknown =
    layout.body === 'whole'
      ? args.body
      : layout.body.length > 0
        ? pick(args, layout.body)
        : undefined;
  // A batch carries its own description, which names it in the History panel.
  if (tool.name === 'batch' && body && typeof body === 'object' && 'description' in body) {
    const { description } = body;
    body = { ...body, description: batchLabel('batch', String(description)) };
  }
  const result = await loose(client)[operation.method](operation.path, {
    params: { path: pick(args, layout.path), query: pick(args, layout.query) },
    ...(body === undefined ? {} : { body }),
    ...(tool.writes
      ? {
          headers: {
            'x-ge-batch-description': encodeURIComponent(batchLabel(tool.name, subjectOf(args))),
          },
        }
      : {}),
  });
  return resultOf(result);
}

/** A response as a tool result: its payload (and batch), or the API's problem as an error. */
export function resultOf(result: {
  data?: unknown;
  error?: unknown;
  response: Response;
}): ToolResult {
  const { response } = result;
  if (!response.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: problemText(response, result.error) }],
    };
  }
  // Single items arrive as `{ data }`; lists keep `nextCursor` beside their `data`.
  const body = result.data as { data?: unknown; nextCursor?: unknown } | undefined;
  const payload =
    body && typeof body === 'object' && 'data' in body && !('nextCursor' in body)
      ? body.data
      : body;
  const batchId = response.headers.get('x-ge-batch-id');
  const value = batchId ? { batchId, result: payload ?? null } : (payload ?? null);
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function problemText(response: Response, error: unknown): string {
  const problem = (error ?? {}) as {
    title?: string;
    detail?: string;
    errors?: { path: string; message: string }[];
  };
  const lines = [
    `${String(response.status)} ${problem.title ?? response.statusText}${problem.detail ? `: ${problem.detail}` : ''}`,
    ...(problem.errors ?? []).map((item) => `- ${item.path}: ${item.message}`),
  ];
  return lines.join('\n');
}
