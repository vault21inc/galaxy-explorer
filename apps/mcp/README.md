# Galaxy Explorer MCP server

An [MCP](https://modelcontextprotocol.io) server that lets LLM agents, such as Claude Code or
Claude Desktop, read and build a galaxy through the REST API (M7-T7, D-18).

- **Its tools come from the registries.** Each entity kind gets `<plural>_list`, `_get`,
  `_create`, `_update`, `_delete` and `_upsert_by_key` (`objects_create`, `characters_get`…),
  and each settings resource gets list, create, update and delete (`group_types_create`…).
  The shared tools are `batch`, `history_list`, `history_revert`, `search`, `view_galaxy`,
  `view_system`, `view_orbit`, `universes_list`, `maps_list` and `import_dry_run`. A new kind in
  the registry brings its tools with it.
- **Each tool takes what its route takes.** Its input is the route's parameters and body, and
  its description the route's, both from the API's OpenAPI document. That document is
  generated from the Zod schemas in `@ge/domain`, and the API checks every call against them.
- **An agent's changes can be undone.** Every write is one change batch, labelled
  `MCP: <tool> — <what>` in the History panel. The tool's result names its `batchId`, which
  `history_revert` (or the History panel's Revert) undoes.

## Run it

It's a local process that talks to the API over HTTP, so start the API first:

```bash
pnpm dev
```

Then point your MCP client at it. The server speaks MCP over stdio; `GE_API_URL` says where
the API is (default `http://127.0.0.1:3100`). In front of an API with accounts (M8), set
`GE_API_TOKEN` to an API token from your account page: the agent then acts for your account,
narrowed by the token (read or write, every universe or one).

### Claude Code

From the repository root:

```bash
claude mcp add galaxy-explorer --env GE_API_URL=http://127.0.0.1:3100 -- node "$PWD/apps/mcp/src/main.ts"
```

`claude mcp list` shows it, and `/mcp` in a session shows its tools.

### Claude Desktop

Add it to `claude_desktop_config.json` (Settings › Developer › Edit Config), with the
repository's absolute path, and restart Claude Desktop:

```json
{
  "mcpServers": {
    "galaxy-explorer": {
      "command": "node",
      "args": ["/absolute/path/to/galaxy-explorer/apps/mcp/src/main.ts"],
      "env": { "GE_API_URL": "http://127.0.0.1:3100" }
    }
  }
}
```

It needs Node 26 or later, which runs the TypeScript directly.

## Remote MCP (M8-T2)

For an agent that isn't on the machine running the API, the same server speaks MCP's
Streamable HTTP transport:

```bash
pnpm mcp:http
```

It listens at `http://127.0.0.1:3110/mcp` (`GE_MCP_HOST`, `GE_MCP_PORT`) and calls the API at
`GE_API_URL`. In production it runs behind Caddy at `https://<domain>/mcp` (M8-T4).

- **Every request needs an API token,** sent as `Authorization: Bearer ge_…`. Make one on your
  account page, under API tokens: a name, read or write, and optionally one universe. It's
  shown once. The server checks the token with the API before each request, so a revoked
  token, or one whose account is disabled, gets a 401 at its next message. On your own
  machine, in front of an API with no accounts, and listening on a loopback address, it needs
  none.
- **A token can do what its account can, never more:** a read token reads as a viewer would;
  one for a single universe reaches no other. Account, sharing and admin actions refuse tokens.
- **The History panel names the token:** an agent's changes read "token: claude-code, for
  aemos", each batch labelled "MCP: objects_create — Gudrun" as before.

Add it to Claude Code:

```bash
claude mcp add --transport http galaxy-explorer https://<domain>/mcp --header "Authorization: Bearer ge_…"
```

It's stateless: each request gets a fresh server, and answers with plain JSON. It answers only
to `127.0.0.1`, `localhost` and `[::1]` on its port, and to the host of `GE_PUBLIC_URL`, so a
web page can't reach it through a name of its own pointed at your machine.

## Example prompts

- "List the universes, then the maps of the first one."
- "In the Example Universe's main map, add three moons to Brennan III, with keys `brennan-iii-a`
  to `-c`." The agent finds the planet with `search`, then makes one `batch`.
- "Build a system called Gudrun at x 1200, z −400: a yellow star and four planets. Do a dry run
  first and show me what it would create."
- "Undo what you just did." The agent passes the batch's id to `history_revert`.
- "Check this CSV before I import it" (with the file's text). `import_dry_run` reports what it
  would create and what's wrong.

## How it's built

- `src/tools.ts`: the tool list, from `@ge/domain`'s registries.
- `src/openapi.ts`: each tool's input schema and description, from the OpenAPI document
  (`@ge/api-client/openapi.json`), with the components it refers to copied into `$defs`.
- `src/call-tool.ts`: a call goes through `@ge/api-client`, labels a write's batch, and returns
  JSON (or the API's problem as a tool error).
- `src/import-tool.ts`: `import_dry_run`, which takes a file's content rather than an upload.
- `src/http.ts` and `src/http-main.ts`: remote MCP (M8-T2), the token check in front of it,
  and its entry.
- `src/server.ts` and `src/main.ts`: the server and its stdio entry. The tools are served by
  the protocol server under the SDK's `McpServer`, since their schemas are JSON Schema
  already rather than Zod.

The tests check the tool list against the registries (`test/tools.test.ts`), what remote MCP
lets through (`test/http.test.ts`), and run an MCP client against the real API, in memory and
over HTTP (`test/mcp.int.test.ts`). `apps/web/e2e/remote-mcp.spec.ts` makes a token on the
account page and uses it. The API runs as a separate process,
because this package may not import the API or the database (architecture.md §2).
