import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.ts';

/**
 * `pnpm mcp`: the MCP server over stdio, for Claude Code and Claude Desktop (apps/mcp/README.md).
 * stdout carries the protocol, so anything else goes to stderr.
 */
const apiUrl = process.env.GE_API_URL ?? 'http://127.0.0.1:3100';
const apiToken = process.env.GE_API_TOKEN;
const server = createMcpServer({ apiUrl, ...(apiToken ? { apiToken } : {}) });
await server.connect(new StdioServerTransport());
console.error(`Galaxy Explorer MCP server: tools for the API at ${apiUrl}.`);
