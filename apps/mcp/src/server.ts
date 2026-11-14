import { createApiClient } from '@ge/api-client';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { callTool, type ToolResult } from './call-tool.ts';
import { IMPORT_TOOL, importDryRun } from './import-tool.ts';
import { buildTools } from './tools.ts';

/**
 * The Galaxy Explorer MCP server (M7-T7, D-18): LLM agents read and edit content through tools
 * generated from the registries, each calling the REST API, so every rule the API checks
 * applies to them too, and every change they make is a batch the owner can revert.
 */

export interface McpServerOptions {
  /** The API's origin, such as http://127.0.0.1:3100 (`GE_API_URL`). */
  apiUrl: string;
  /** Sent as a bearer token once the API has accounts (`GE_API_TOKEN`, M8). */
  apiToken?: string;
  /** A fetch to use instead of the global one, for tests. */
  fetch?: typeof globalThis.fetch;
}

const INSTRUCTIONS = `Galaxy Explorer: universes hold maps (one galaxy at one point in time) and characters; maps hold objects (systems, stars, planets… nested by parentId), groups, routes, places and events.
- Find ids with universes_list, maps_list, search and the *_list tools; read a view with view_galaxy, view_system or view_orbit.
- Prefer *_upsert_by_key with an externalKey, so running a task again never duplicates content.
- Build structures with batch, referring to an earlier operation's result as "$op:N"; try dryRun: true first.
- Updates and deletes need the entity's current version, from a get or list.
- Never delete unless asked. Every write returns a batchId; history_revert undoes it.`;

export function createMcpServer(options: McpServerOptions): McpServer {
  const client = createApiClient({
    baseUrl: options.apiUrl,
    ...(options.apiToken ? { getAuthHeader: () => `Bearer ${String(options.apiToken)}` } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const tools = buildTools();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  const mcp = new McpServer(
    { name: 'galaxy-explorer', version: '0.1.0' },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );
  // The tools' schemas are JSON Schema already (openapi.ts), so they're served by the protocol
  // server underneath rather than registered as Zod tools; McpServer adds tool handlers of its
  // own only when one is registered that way, so these are the only ones.
  const server = mcp.server;
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      ...tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as { type: 'object' },
        annotations: {
          readOnlyHint: !tool.writes,
          destructiveHint: tool.name.endsWith('_delete'),
          idempotentHint: !tool.writes || tool.name.endsWith('_upsert_by_key'),
        },
      })),
      { ...IMPORT_TOOL, annotations: { readOnlyHint: true } },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<ToolResult> => {
    const { name, arguments: args = {} } = request.params;
    try {
      if (name === IMPORT_TOOL.name) return await importDryRun(client, args);
      const tool = byName.get(name);
      if (!tool) return { isError: true, content: [{ type: 'text', text: `No tool ${name}.` }] };
      return await callTool(client, tool, args);
    } catch (error) {
      // The API couldn't be reached, or answered nonsense: tell the agent, don't crash.
      return {
        isError: true,
        content: [{ type: 'text', text: `The API call failed: ${String(error)}` }],
      };
    }
  });
  return mcp;
}
