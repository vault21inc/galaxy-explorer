# Architecture

How the code is organized, how data flows, and the conventions every package follows. The schema is in [data-model.md](data-model.md); 3D specifics are in [rendering.md](rendering.md); interaction design is in [ux.md](ux.md).

## 1. System overview

```
 Browser: apps/web                          Server: apps/api                     PostgreSQL 18
┌──────────────────────────────┐   REST   ┌──────────────────────────────┐    ┌─────────────────────┐
│ React UI: panels, forms      │ ───────▶ │ Fastify routes, generated    │──▶ │ tables              │
│ R3F views: galaxy/system/    │  /api/v1 │ from the registries          │    │ audit trigger ──▶   │
│   orbit (three.js, WebGL2)   │ ◀─────── │ services: rules, sanitizing  │◀── │ change_log          │
│ zustand + TanStack Query     │          │ uploads, wiki, import/export │    └─────────────────────┘
└──────────────────────────────┘          └──────────────────────────────┘
               ▲                                         ▲            │
               │ same OpenAPI contract                   │            ▼
 LLM agents ── apps/mcp (MCP server) ── api-client ──────┘     media volume (images)
```

There is one source of truth for every shape: Zod schemas in `packages/domain`. The API validates with them, OpenAPI is generated from them, the client is generated from OpenAPI, and the editor forms are derived from them.

## 2. Packages and layering

```
galaxy-explorer/
├─ apps/
│  ├─ web/          Vite + React + React Three Fiber: viewer and editor
│  ├─ api/          Fastify REST API, OpenAPI docs at /api/docs
│  └─ mcp/          MCP server for LLM agents (M7)
├─ packages/
│  ├─ domain/       pure TypeScript: Zod schemas, registries, rich text, redaction, geo math
│  ├─ db/           Drizzle schema, migrations, audit/batch/revert/clone primitives, seeds
│  ├─ api-client/   generated from the API's OpenAPI document (openapi-typescript + openapi-fetch)
│  └─ config/       shared tsconfig, ESLint and Prettier presets
├─ docker/          compose files, Caddyfile (production, M8)
└─ docs/            plan/, perf/ (measurement reports), api/ (LLM guide, M7), ops/ (runbooks, M8)
```

Dependency rules. `packages/config/workspace.js` holds this table as data. ESLint turns it into `no-restricted-imports` errors, and `packages/config/test/layers.test.js` checks every row:

| Package | May import | Must not import |
|---|---|---|
| `domain` | zod, small pure libraries | db, api, web, api-client, mcp, React, three, Node built-ins (it runs in the browser too) |
| `db` | domain, drizzle | api, web, api-client, mcp |
| `api` | domain, db | web, api-client, mcp |
| `api-client` | generated types only | every other workspace package |
| `web` | domain, api-client | db, api, mcp |
| `mcp` | domain, api-client | db, api, web |
| `config` | ESLint, typescript-eslint, Prettier | every workspace package |

Packages are imported by name (`@ge/domain`), never by relative paths across package boundaries. The same lint rule rejects relative paths into `apps/` or `packages/`.

**Internal packages export TypeScript source.** `domain`, `db` and `api-client` have no build step. Their `exports` point at `src/index.ts`, and whatever runs them compiles them: Vite and Vitest do, and the API runs on Node's built-in type stripping. That's why relative imports spell out the `.ts` extension.

Turborepo's `lint`, `typecheck` and `test` tasks depend on a no-op `transit` task. Changing a package therefore invalidates the cached results of every package that depends on it, while the tasks still run in parallel.

## 3. Registries: the DRY core

Everything that varies by "kind of thing" is described once in a registry. Code that handles many kinds iterates the registry instead of being written per kind. **If you are about to write the same handler for two kinds, extend a registry instead.**

### 3.1 Entity kinds (`packages/domain/src/registry/entity-kinds.ts`)

An *entity* is anything the author writes about. Each kind declares its scope, its URL plural, its extension columns and which shared aspects it supports.

```ts
export const entityKinds = defineEntityKinds({
  celestial_object: {
    scope: 'map',                    // belongs to one map; 'universe' kinds are shared by all maps
    plural: 'objects',               // URL segment, MCP tool prefix, query-key prefix
    label: { one: 'Object', many: 'Objects' },
    extension: celestialObjectExtension, // Zod object for the extension table's columns
    aspects: { images: true, links: true, facts: true, relations: true, location: 'none' },
    form: celestialObjectForm,       // field order and widget hints for the editor (data, not React)
  },
  group:     { scope: 'map',      plural: 'groups',     extension: groupExtension, /* … */ },
  route:     { scope: 'map',      plural: 'routes',     extension: routeExtension, /* M4 */ },
  place:     { scope: 'map',      plural: 'places',     extension: null, aspects: { /* … */ location: 'required' } },
  event:     { scope: 'map',      plural: 'events',     extension: eventExtension, aspects: { /* … */ location: 'optional' } },
  character: { scope: 'universe', plural: 'characters', extension: null, aspects: { /* … */ location: 'none' } },
});
```

From this one definition the code derives:

- Zod create, update and read schemas (base fields plus the extension);
- the binding to the extension table (`packages/db`);
- REST routes and their OpenAPI documentation;
- TanStack Query hooks;
- editor forms;
- MCP tools;
- import and export handlers;
- clone rules;
- the generic contract test suite.

Factions, species and gods later become one registry entry each, plus a migration.

### 3.2 Object base types (`registry/object-types.ts`)

Base types decide how an object is drawn and where it can live. Universes add subtypes on top (`object_subtypes` table), but cannot add base types.

```ts
export const objectTypes = defineObjectTypes({
  //             allowed parents ('map' = top level)    view it opens   default size per view (§ data-model 6)
  system:        { parents: ['map'],                     explorableAs: 'system', size: { galaxy: 120 } },
  star:          { parents: ['system'],                  explorableAs: null,     size: { system: 1 } },
  planet:        { parents: ['system', 'map'],           explorableAs: 'orbit',  size: { galaxy: 60, system: 0.35, orbit: 1 } },
  moon:          { parents: ['planet'],                  explorableAs: 'orbit',  size: { orbit: 0.27 } },
  asteroid_belt: { parents: ['system'],                  explorableAs: null,     size: { system: 1 } },
  station:       { parents: ['map', 'system', 'planet', 'moon'], explorableAs: null, size: { galaxy: 40, system: 0.08, orbit: 0.05 } },
  nebula:        { parents: ['map'],                     explorableAs: null,     region: true },
  anomaly:       { parents: ['map', 'system'],           explorableAs: null,     region: true }, // warp storms, rifts
  black_hole:    { parents: ['map', 'system'],           explorableAs: null,     size: { galaxy: 80, system: 0.5 } },
  marker:        { parents: ['map', 'system', 'planet', 'moon'], explorableAs: null, size: { galaxy: 30, system: 0.05, orbit: 0.03 } },
});
```

The sizes are starting points; tune them while building M2/M5. Each type also carries its icon key and its default appearance.

### 3.3 View levels (`registry/view-levels.ts`)

```ts
export const viewLevels = defineViewLevels({
  galaxy: { subject: 'map',              unit: 'ly'    }, // unit label comes from universe settings
  system: { subject: ['system'],         unit: 'su'    }, // "system units", schematic (≈ AU)
  orbit:  { subject: ['planet', 'moon'], unit: 'radii' }, // the subject's radius = 1
});
```

There is no hard-coded hierarchy:

- the view an object opens comes from its type's `explorableAs`;
- a view's parent view is the view of its subject's parent object (the galaxy view when the parent is the map);
- breadcrumbs are the subject's chain of ancestors.

A rogue planet placed directly in the galaxy therefore opens an orbit view straight from the galaxy view.

### 3.4 Relation types, config resources

```ts
export const relationTypes = defineRelationTypes({
  participant: { from: ['character'], to: ['event'], label: 'Involved in', inverseLabel: 'People involved' },
  related:     { from: '*', to: '*', label: 'Related to', symmetric: true },
});

// Universe-level settings tables with plain CRUD: generated routes, settings-page tables, MCP tools.
export const configResources = defineConfigResources({
  group_types:       { plural: 'group-types',       schema: groupTypeSchema },
  event_categories:  { plural: 'event-categories',  schema: eventCategorySchema },
  object_subtypes:   { plural: 'object-subtypes',   schema: objectSubtypeSchema },
  field_definitions: { plural: 'field-definitions', schema: fieldDefinitionSchema },
});
```

### 3.5 Web-only registries (`apps/web`)

| Registry | File | Maps |
|---|---|---|
| Levels | `src/levels/registry.ts` | view level → lazy-loaded React component, camera limits, enter/exit distances |
| Renderers | `src/render/registry.ts` | (view level, base type) → renderer component; this is the O3 extension point for stations, ships and models |
| Input bindings | `src/input/bindings.ts` | (gesture, modifiers, mode, target) → action ([ux.md §3](ux.md#3-input-bindings)) |
| Panel sections | `src/panels/sections.ts` | entity kind → ordered panel sections (details, facts, images, links, relations, members, location, history) |

### 3.6 Consistency tests

Registries and the database must agree. Tests in `packages/db` introspect the live schema and fail when:

- the `entities.kind` or `celestial_objects.base_type` check lists differ from the registry;
- a registered kind has no extension-table binding when it declares one;
- a content table lacks the audit trigger;
- a table with a `map_id` column or a foreign key to `entities` is missing from the clone spec ([data-model.md §10](data-model.md#10-cloning-a-map)).

## 4. Mutation lifecycle

Every write follows the same path:

```
PATCH /api/v1/objects/{id}  { version: 7, name: {...}, x: 120.5 }
  → auth (M8) → Zod validation (generated route schema)
  → entityService.update('celestial_object', id, input, actor)
      withBatch(actor, 'Edit "Gudrun System"', async (tx) => {
        rules.check(tx, …)          // allowed parent, same map, explorable allowed, group nesting, location mode
        sanitizeRichText(input)     // HTML allowlist; derives name_plain
        repo.update(tx, kind, id, input, expectedVersion: 7)   // 0 rows updated → 409 Conflict
      })                            // the audit trigger logs every touched row under this batch
  → 200 { data: entity }  +  header  X-GE-Batch-Id: <uuid>
```

- `withBatch` opens a transaction, inserts a `change_batches` row, and runs `select set_config('ge.batch_id', <id>, true)`. The audit trigger refuses writes without a batch id, so nothing can change unlogged ([data-model.md §9](data-model.md#9-history-batches-audit-trigger-revert)).
- The web client keeps the returned batch ids for undo and redo.
- Any change to an entity's base or extension columns bumps `entities.version`. Aspect rows (images, links, facts…) are independent rows; for them the last write wins.

## 5. API conventions

- **Base path** `/api/v1`. JSON request and response bodies use camelCase; the database uses snake_case (Drizzle `casing: 'snake_case'`).
- **Response envelope:** `{ "data": … }` for single items, `{ "data": [...], "nextCursor": "…" | null }` for lists. Lists use cursor pagination with a default `limit` of 100 (maximum 1,000; view payloads aren't paginated).
- **Errors:** RFC 9457 `application/problem+json`, as `{ type, title, status, detail, errors?: [{ path, message }] }`. A 409 conflict includes the current version of the resource in `current`.
- **Concurrency:** reads return `version`. `PATCH` and `DELETE` require `version` in the body; a mismatch returns 409.
- **Batches:** every mutating request is one change batch. Clients may send `X-GE-Batch-Description` (for example "Moved 12 objects"); responses carry `X-GE-Batch-Id`.
- **Query flags:** `spoilers=include|exclude` (default `include`; see §10), `includeDrafts=true` (only honored for editors).
- **Idempotent imports:** entities can carry an `externalKey`, unique per map (per universe for universe-scoped kinds). `PUT /api/v1/maps/{mapId}/{plural}/by-key/{externalKey}` (or `/universes/{universeId}/{plural}/by-key/…`) upserts. LLM agents should use this.
- **OpenAPI:** generated at `/api/openapi.json`; Swagger UI at `/api/docs`. Every route has a stable `operationId` (`objects.create`) and a description written for LLM readers.

### Routes

| Area | Routes |
|---|---|
| Universes | `GET/POST /universes`, `GET/PATCH/DELETE /universes/{universeId}` |
| Maps | `GET/POST /universes/{universeId}/maps`, `GET/PATCH/DELETE /maps/{mapId}`, `POST /maps/{mapId}/clone` (M7) |
| Config resources | `GET/POST /universes/{universeId}/{plural}`, `GET/PATCH/DELETE /{plural}/{id}` for `group-types`, `event-categories`, `object-subtypes`, `field-definitions` |
| Entities | map-scoped: `GET/POST /maps/{mapId}/{plural}`; universe-scoped: `GET/POST /universes/{universeId}/{plural}`; all: `GET/PATCH/DELETE /{plural}/{id}`. `plural` ∈ `objects`, `groups`, `routes`, `places`, `events`, `characters` |
| Aspects (any entity) | `/entities/{entityId}/images`, `/links`, `/facts`, `/relations`, `/citations` (M7) as list + create + item update/delete (items at `/links/{linkId}`, `/images/{assetId}/{role}`, `/relations/{relationId}`; facts are set with `PUT /facts/{fieldDefinitionId}`); `/entities/{entityId}/location` as `GET`/`PUT`/`DELETE` |
| Kind-specific | `PUT/POST/DELETE /groups/{groupId}/members`, `PUT /routes/{routeId}/waypoints` |
| Views (render payloads) | `GET /maps/{mapId}/views/galaxy`, `GET /objects/{objectId}/views/system`, `GET /objects/{objectId}/views/orbit` |
| Batch | `POST /batch` with `{ description, dryRun?, operations: [{ op, kind, id?, version?, data? }] }`: all operations in one transaction and one change batch. `dryRun: true` validates and returns the would-be results, then rolls back. |
| History | `GET /universes/{universeId}/history`, `GET /history/{batchId}`, `POST /history/{batchId}/revert` |
| Assets | `GET/POST /universes/{universeId}/assets` (POST is multipart), `GET/PATCH/DELETE /assets/{assetId}`; files are served under `/media/…` |
| Later | search, import/export, wiki (M7); auth, tokens (M8) |

## 6. View payloads

View endpoints return compact, render-ready projections: one request per view, with no rich-text bodies. The info panel fetches the full entity when something is selected.

```jsonc
// GET /api/v1/maps/{mapId}/views/galaxy
{
  "data": {
    "map": { "id": "…", "namePlain": "M41", "galaxySettings": { … }, "underlay": { … } | null },
    "objects": [{
      "id": "…", "baseType": "system", "subtypeId": null,
      "namePlain": "Gudrun System", "nameSpoiler": false, "isSpoiler": false, "status": "published",
      "explorable": true, "position": [12345.6, -40.0, 8820.1],
      "appearance": { /* resolved: type defaults ← subtype defaults ← object overrides */ }
    }],
    "groups": [{ "id": "…", "namePlain": "Helican Sub-sector", "nameSpoiler": false, "isSpoiler": false,
                 "groupTypeId": "…", "parentGroupId": "…", "outlineColor": "#c8a24a", "style": { … },
                 "members": [{ "objectId": "…", "isSpoiler": false }] }],
    "routes": [ … ],
    "groupTypes": [ … ]
  }
}
```

The system and orbit payloads have the same shape: the subject, its direct children, the map and the subject's ancestors (for breadcrumbs), and, for orbit views, the pins (places and events located on the subject). Every named record also carries `nameRedacted`, its name with spoilers blacked out, which labels show by default, and objects carry their resolved `size`. The schemas are `GalaxyView`, `SystemView` and `OrbitView` in `@ge/domain`. Resolution uses `resolveAppearance()` from `packages/domain`, the same function the client uses for live editing previews.

## 7. Auth modes

| `GE_AUTH_MODE` | Used for | Behavior |
|---|---|---|
| `none` (default in development) | local proof of concept | Every request acts as actor `{ type: 'local', label: 'local' }` with full rights. The API **binds to 127.0.0.1 only**, and Docker publishes Postgres on 127.0.0.1 only. |
| `required` (production, M8) | public site | Anonymous visitors can read published content only. Writes need an owner session (cookie) or an API token with the `write` scope. |

## 8. Media and uploads

- `BlobStore` interface: `put(key, data, contentType)`, `get(key)`, `delete(key)`, `publicUrl(key)`. `LocalBlobStore` writes to `GE_MEDIA_DIR`; in development Fastify serves the files under `/media/`, in production Caddy does.
- Pipeline:
  1. Limit uploads to 25 MB.
  2. Sniff the real type with `file-type`. Accept PNG, JPEG, WebP and AVIF, plus GIF for its first frame only.
  3. sharp decodes and re-encodes to WebP, which strips EXIF and anything else embedded.
  4. Write the variants: `thumb` (256 px), `display` (1,600 px) and, for surface textures, `texture` (2:1, power-of-two width, at most 4,096 × 2,048).
  5. Deduplicate by the SHA-256 of the original.
- Keys: `u/{universeId}/{assetId}/{variant}.webp`.
- Every asset carries `altText`, `credit`, `sourceUrl` and `license` (A5). The UI shows the credit wherever the image appears.

## 9. Rich text pipeline

`RichText = { format: 'plain' | 'markdown' | 'html', source: string, spoiler: boolean }`. The schema is in [data-model.md §4](data-model.md#4-documents-stored-as-jsonb).

| Step | Plain | Markdown | HTML |
|---|---|---|---|
| Server, on write | stored as is | stored as is | sanitized with `sanitize-html` using `RICH_TEXT_POLICY` from `@ge/domain` |
| Derived on write | `toPlainText()` → `name_plain` (and search text, M7) | same | same |
| Client render | `richTextTree()` → React | `richTextTree()` (remark-parse + `remark-gfm` + `remark-spoiler`, raw HTML skipped) → React | `richTextTree()` (htmlparser2, keeping only what `RICH_TEXT_POLICY` allows: defense in depth) → React |

- **One renderer for all three formats** (M2-T7, D-26): `richTextTree()` in `@ge/domain` turns any `RichText` into a small tree of allowed elements, text and numbered spoilers, and `RichTextView` renders the tree as React elements. No HTML string is ever set on the page, so markup the policy doesn't allow can't run even if it got past the server. Spoiler nodes become `<Redactable>`.
- **Inline spoilers:** `||hidden text||` in Markdown, `<span data-spoiler>hidden text</span>` in HTML. Plain text has field-level spoilers only.
- **Links** are rendered with `target="_blank" rel="noopener noreferrer nofollow ugc"`. Images inside rich text are allowed only from this site's `/media/` URLs.
- **Names** use the same type, but 3D labels, sorting and breadcrumbs use the plain-text projection.

## 10. Visibility: drafts and spoilers

| | Drafts (`status = 'draft'`) | Spoilers (`is_spoiler` / `spoiler` flags) |
|---|---|---|
| Are they secret? | Yes: unpublished work | No: readers may choose to see them |
| Where filtered | **Server**. Anonymous requests never receive drafts, nor descendants of draft objects or maps. | **Client**, by default. The API returns content with its flags, and the UI blacks it out (instant toggle, no refetch). |
| Server option | `includeDrafts=true` for editors | `spoilers=exclude` makes the server apply the same `redactEntity()` from `@ge/domain` (used by search snippets, SEO pages and cautious API clients) |
| Edit mode | drafts shown with a "Draft" badge | everything shown, with spoiler content marked |

One redaction implementation (`packages/domain/src/spoilers/`) serves the page text (`<Redactable>`), the 3D labels (`labelText()`), view payloads and server-side exclusion.

## 11. Configuration

All configuration comes from environment variables, validated by a Zod schema at boot. A missing or invalid value stops startup with a clear message.

| Variable | Used by | Example / default |
|---|---|---|
| `DATABASE_URL` | api, db scripts | `postgres://ge:ge@127.0.0.1:5442/ge` |
| `TEST_DATABASE_URL` | integration tests | `postgres://ge:ge@127.0.0.1:5443/ge_test` |
| `GE_AUTH_MODE` | api | `none` |
| `GE_HOST`, `GE_PORT` | api | `127.0.0.1`, `3100`. With `GE_AUTH_MODE=none` the host must be a loopback address. |
| `GE_LOG_LEVEL` | api | `info` (`fatal` … `trace`, or `silent`) |
| `GE_MEDIA_DIR` | api | `./.data/media` |
| `GE_PUBLIC_URL` | api, web build | `http://localhost:5173` |
| `VITE_TEST_HOOKS` | web build | unset; `1` exposes `window.__GE_TEST__` in a production build, for e2e tests (development builds always have it) |
| `GE_SESSION_SECRET` | api (M8) | 32+ random bytes |
| `GE_WIKI_USER_AGENT` | api (M7) | `GalaxyExplorer/0.1 (contact: …)` |
| `GE_API_URL`, `GE_API_TOKEN` | mcp (M7) | `http://127.0.0.1:3100/api/v1` |

`.env.example` documents every variable. Real `.env` files are git-ignored.

## 12. Errors and logging

- Fastify's logger (pino) writes JSON with a request id, and redacts authorization headers and cookies.
- Domain rule violations throw typed errors (`RuleViolation` → 422, `NotFound` → 404, `VersionConflict` → 409 with `current`, `RevertConflictError` → 409 with `conflict`). One error handler maps them to problem+json, and also maps database constraint errors that get past the rules (unique → 409, foreign key or check → 422).
- Postgres errors from the revert function use SQLSTATE `GE409`, which maps to 409 with the conflicting rows listed.
- The web app shows API errors as toasts with the problem's `title`. Validation errors attach to form fields by `path`.
- The UI never swallows an error silently.

## 13. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Pure logic | Vitest | rich text, redaction, geo math, hull outlines, appearance resolution, registries, input-binding resolution, navigation state machine, label solver |
| Database | Vitest + real Postgres 18 (`TEST_DATABASE_URL`) | migrations from empty, constraints, audit trigger, revert, clone, consistency tests (§3.6) |
| API | Vitest + `fastify.inject()` + real Postgres | the **generic contract suite**, run once per registered kind (create, read, list, update, version conflict, delete, spoiler flags, batch id, revert), plus rule-specific tests |
| Web components | Vitest + Testing Library (jsdom) | panels, forms, rich text renderer, `<Redactable>`; 3D components aren't unit-tested |
| End-to-end | Playwright (Chromium + WebKit locally, Chromium in CI) | user flows per milestone, driven by real mouse and keyboard; 3D state checked through `window.__GE_TEST__` ([rendering.md §14](rendering.md#14-test-hooks-and-performance-measurement)) |
| Performance | `pnpm perf` (Playwright, headed, local Mac) | frame-time budgets with the stress seed; reports land in `docs/perf/` |

CI runs everything except `pnpm perf`. CI has no real GPU, so performance is measured on the owner's Mac.

## 14. Production topology (M8)

```
Internet ──443──▶ Caddy (auto HTTPS, security headers)
                   ├── /            → web build (static SPA, hashed assets, long cache)
                   ├── /media/*     → media volume (read-only)
                   └── /api/*       → api:3000 (Fastify) ──▶ postgres:5432 (volume: pgdata)
                                           └── writes media volume
backup (cron container): nightly pg_dump + media archive ──▶ DigitalOcean Spaces (30-day retention)
```

All services run under one `docker-compose.prod.yml` on one droplet. Migrations run as a one-off container before the API starts.

## 15. Coding conventions

- **TypeScript:** strict mode, `noUncheckedIndexedAccess`, no `any`, no non-null `!` outside tests. Types are inferred from Zod (`z.infer`) or Drizzle, never re-declared by hand.
- **Units in names:** `distanceLy`, `radiusSu`, `sizePx`, `latDeg`, `lonDeg`, `durationMs`, `angleRad`. Converting between units goes through named helpers.
- **Naming:**
  - SQL uses snake_case;
  - TypeScript uses camelCase for values and PascalCase for types and components;
  - files use kebab-case (`label-layer.tsx`);
  - registry keys use snake_case strings.
- **Size:** aim for files under 300 lines and one component per file. Split by responsibility, not by line count alone.
- **Comments explain why.** Every non-obvious piece of 3D math, shader code or camera logic gets a plain-language comment. The owner is new to three.js, so link the relevant section of `rendering.md`.
- **No magic numbers in rendering:** tunables live in `apps/web/src/render/tuning.ts`, each with a comment and its unit.
- **Dependencies:** add one only when it removes real work. Note new runtime dependencies in the commit message, and in `decisions.md` if they're architectural.
- **Language in the product:** say "event", never "scene", in UI text, API names and docs. three.js's `Scene` class in code is fine. The three levels are the galaxy view, system view and orbit view.
