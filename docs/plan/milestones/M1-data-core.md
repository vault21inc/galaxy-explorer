# M1: Data core and API

**Goal:** the complete data model for the proof of concept, the registries that drive everything, a generic CRUD API, history with revert, and the foundations for rich text and spoilers. There is no 3D work in this milestone. When it's done, an LLM agent could already build a galaxy through the API.

**Depends on:** M0.
**Read first:** [architecture.md §3–13](../architecture.md), [data-model.md](../data-model.md) (all of it).
**Demo at the end:**
1. `pnpm db:reset && pnpm db:seed demo`.
2. Browse `/api/docs` and create a system with three planets in one `POST /api/v1/batch`.
3. Move a planet with `PATCH`.
4. Revert that move through `POST /api/v1/history/{batchId}/revert`.

**Out of scope:** routes (M4), citations, search, import/export and cloning (M7), auth (M8). Upload handling is M3, but the `assets` and `entity_images` tables are created here.

---

### M1-T1 Domain primitives

**Where:** `packages/domain/src/{ids,colors,units}.ts`, `richtext/`, `spoilers/`.

- Branded `Uuid`, `Slug`, `HexColor`, plus numeric type aliases named after their unit (`Ly`, `Su`, `Radii`, `Deg`, `Px`). Frames never convert between each other, so no conversion helpers are needed.
- `RichText` schema (data-model §4) and constructors (`rt.plain('…')`, `rt.md('…')`).
- `toPlainText(rt, { redactSpoilers })`:
  - Markdown is parsed with `remark-parse` + `remark-gfm`, then `mdast-util-to-string`.
  - HTML goes through `htmlparser2`: text nodes only, block elements become newlines.
  - Inline spoilers become `▇` repeated to about the hidden text's length when redacting.
- `RICH_TEXT_POLICY`: the allowed tags, attributes and URL schemes (ux.md §8). The server's `sanitize-html` and the client's DOMPurify both consume it.
- `SpoilerPolicy = { showAll: boolean; revealed: ReadonlySet<string> }`; `isHidden(flagged, key, policy)`; `redactRichText(rt, policy)`; `redactEntity(entityRead, policy)`, which covers every flag in data-model §7.

**Done when:**
- [x] Unit tests cover plain-text extraction for all three formats, including lists, links, tables and line breaks.
- [x] Inline spoilers are tested in Markdown (`||x||`, escaped `\|\|`, unclosed `||`) and HTML (`<span data-spoiler>`, including nested).
- [x] A table-driven test shows `redactEntity` hides every flagged item in data-model §7 and leaves everything else untouched.

**Notes (done 2026-11-07):**
- **Markdown spoilers** are a real parser extension (`richtext/markdown-spoiler.ts`), modelled on GFM's `~~strikethrough~~`, and also a unified plugin (`remarkSpoiler`) that the web app can pass to react-markdown. The rules:
  - a marker is exactly `||`;
  - escaped, unclosed and three-pipe markers are plain text;
  - `|| x ||` with inner spaces isn't a spoiler (the same rule as `**bold**`);
  - code spans win over spoilers;
  - nested spoilers count as one.
  - Inside GFM tables, pipes separate cells, so a spoiler in a table needs HTML.
- **Plain text** uses our own walk over the syntax tree instead of `mdast-util-to-string`, which joins blocks with no separator. The output has one line per paragraph, heading, list item, table row or code line; table cells are joined with ` | `; empty lines are dropped. Raw HTML inside Markdown is ignored, as the renderer will ignore it.
- **Redaction bars** are `▇` about as long as the hidden text: rounded up to a multiple of 3, from 3 to 40 characters, so the exact length isn't revealed.
- **Spoiler keys** come from `spoilerKeys`, such as `<entityId>/description#0` for the first inline spoiler in a description. They're how a reader reveals one item.
- **`redactRichText(rt, policy, fieldKey)`:** a hidden whole-field spoiler becomes plain `▇` text. Hidden inline spoilers keep their `||` markers or `<span data-spoiler>`, with the text inside replaced, and the rest of the source stays byte for byte.
- **`redactEntity(entity, policy, { contentFields })`:**
  - a hidden image, link, fact, relation, membership or location becomes a placeholder `{ redacted: true, … }` that keeps only what isn't secret (which fact, the image role, the sort order);
  - a hidden whole entity also blacks out its texts and nulls its kind-specific `contentFields`, which the entity-kind registry (M1-T2) will list.
  - It takes the minimal shapes it needs, so the M1-T6 read types pass straight in.
- **`redactMap` and `redactUniverse`** cover the map flag and the map and universe texts.
- **`RICH_TEXT_POLICY`** is data, plus `isAllowedLinkUrl` (http, https, mailto, site-relative; never `//host`, `/\host` or `javascript:`) and `isAllowedImageSource` (`/media/` only). The sanitizers themselves come in M1-T5.
- **New dependencies:** unified, remark-parse, remark-gfm, micromark-util-chunked / classify-character / resolve-all, htmlparser2, domhandler and zod. Their types come from @types/mdast, mdast-util-from-markdown and micromark-util-types. The package still bundles for the browser with no Node imports.

### M1-T2 Registries and document schemas

**Where:** `packages/domain/src/registry/*`, `packages/domain/src/schemas/*`.

- `defineEntityKinds`, `defineObjectTypes`, `defineViewLevels`, `defineRelationTypes`, `defineConfigResources`, typed so that `entityKinds.celestial_object.plural` is the literal type `'objects'`. Contents as in architecture §3.1–3.4. `route` is **not** registered yet (M4).
- The Zod documents from data-model §4: `Appearance`, `PlanetAppearance`, `GalaxySettings`, `Underlay`, `GroupStyle`, `RouteStyle`, `UniverseSettings`, `FieldValue`.
- `schemasFor(kind)` returns `{ create, update, read }`, derived from base fields + extension (+ `version` on update, + `id`, timestamps and `version` on read). The same pattern serves the config resources.
- `resolveAppearance({ baseType, subtypeDefaults, overrides, view })` (data-model §6).

**Done when:**
- [x] Invariant tests pass:
  - every `explorableAs` is a view level;
  - every entry in `parents` is a base type or `'map'`;
  - plurals are unique;
  - relation endpoints name existing kinds;
  - every config resource has a schema.
- [x] `resolveAppearance` precedence is tested (type ← subtype ← object, per view).

**Notes (done 2026-11-07):**
- **Registries** live in `packages/domain/src/registry/`. Each `define…` function keeps literal types, so `entityKinds.celestial_object.plural` is `'objects'`; a type-level test checks this.
  - Object types carry a label, an icon key (Lucide names until the icon set is chosen in M6) and a default appearance with at least a color.
  - Planets and moons default to `showOrbit: true`; systems get a higher label priority.
  - The colors and sizes are starting points for M2 and M5.
- **Entity kinds have `contentFields`** (an event's `dateText` and `dateSort`), which `redactEntity` nulls while a whole entity is hidden. The `form` hints shown in architecture §3.1 wait for the editor in M3. `route` isn't registered (M4).
- **Extension schemas** use the API's camelCase field names. A field the database fills by default (`x`, `appearance`, `explorable`, …) is optional on create.
- **`schemasFor(kind)` and `configSchemasFor(resource)`** derive `{ create, update, read }`:
  - **create** is strict, so unknown fields are rejected;
  - **update** is the create fields, all optional, plus `version`. It never fills in defaults, so a PATCH can't reset a field it didn't mention;
  - **read** has every field, plus `id`, `kind`, `universeId`, `mapId` (null for characters), `namePlain`, `clonedFromEntityId`, `version` and ISO timestamps.
  - Config resources follow the same pattern, without a version or timestamps, because their tables have neither (data-model §3.5).
- **Documents** follow data-model §4 in Zod 4 syntax: `z.url()`, `z.uuid()`, `z.int()`, and `z.partialRecord` over the view levels for per-view values. `FIELD_VALUE_TYPES` is read from the `FieldValue` union, so the two can't drift apart.
- **`resolveAppearance`** merges nested settings field by field and replaces lists (palettes) whole. It returns the merged appearance and the size in the view's unit, or null where the type isn't drawn as a body.
- **Additional invariant tests:** sizes are for real view levels; region types, and only they, have no body size; view-level subjects and `explorableAs` agree in both directions; content fields exist in their extension; plurals are unique across entity kinds and config resources together, and URL-safe.

### M1-T3 Schema migration

**Where:** `packages/db/src/schema/*`, `packages/db/migrations/*`.

- Create every table in data-model §3.1–3.7 except `routes`, `route_waypoints` and `citations`. Leave out the auth tables (§3.8).
- Use custom SQL migrations where Drizzle can't express a construct: `nulls not distinct … where`, `on delete set null (col)`, the `check (case mode …)` on locations, `deferrable` options.
- Write the registry ↔ database consistency tests (architecture §3.6) for `entities.kind`, `celestial_objects.base_type` and `object_subtypes.base_type`.

**Done when:**
- [ ] Migrating from empty succeeds in CI.
- [ ] Constraint tests pass. Each one tries the bad write and expects the right error:
  - a parent from another map is rejected;
  - an object can't be in two groups of the same type;
  - each of the four location modes rejects invalid combinations;
  - a character with a `map_id` is rejected;
  - `external_key` is unique per map but may repeat across maps;
  - color, slug and URL formats are checked.

### M1-T4 Audit trigger, batches and revert

**Where:** a custom migration, plus `packages/db/src/audit/`.

- `ge_audit()` and its triggers on every table in data-model §9, with primary-key columns as trigger arguments.
- `withBatch(actor, description, fn)` (data-model §9).
- `ge_revert_batch(p_batch uuid)` (PL/pgSQL, dynamic SQL, reverse order, conflict detection with SQLSTATE `GE409`), and a TypeScript wrapper `revertBatch(batchId, actor)` that runs it in a new batch with `reverts_batch_id`.
- An exported `AUDITED_TABLES` constant.
- An exported `CLONE_SPEC` constant (data-model §10), which lists every map-scoped table, its id columns and the columns to remap. It's only data for now; M7-T5 implements `cloneMap()` on top of it.

**Done when:**
- [ ] Introspection test: every table in `AUDITED_TABLES` has the trigger, and every table with `map_id` or an `entities` foreign key is in `AUDITED_TABLES` and in `CLONE_SPEC`.
- [ ] A write outside `withBatch` fails with `GE400`.
- [ ] A **generated** test, one case per audited table, inserts, updates and deletes a row, reverts each batch, then reverts the revert (redo). The row ends up in the expected state each time.
- [ ] Cascade test: delete a system that has child objects, group memberships, images and an event located on it. Reverting the delete restores everything exactly, apart from `updated_at`.
- [ ] Conflict test: update A, update A again, then revert the first batch → 409 `GE409`, and nothing changes.

### M1-T5 Entity service and rules

**Where:** `apps/api/src/services/`.

- A generic `entityService` with `create`, `get`, `list`, `update` and `delete` for any registered kind:
  - writes the base row and extension row in one batch;
  - reads them joined, with aspects included on request (`include=facts,images,links,relations,location`).
- Aspect services: images, links, facts, relations, location, group members.
- `sanitizeRichTextFields(input)` applies `sanitize-html` with `RICH_TEXT_POLICY` to every RichText in the input, wherever it is, by walking the Zod schema. It also derives the `*_plain` fields.
- `rules/`, all driven by the registries:
  - the parent's type is allowed, with `'map'` meaning a top-level object;
  - same universe and same map;
  - `explorable` only for types that have a view;
  - group-type nesting;
  - the one-group-per-type conflict produces a friendly `RuleViolation` that names the current group;
  - relation endpoint kinds;
  - the location mode and the target place's kind;
  - a field definition applies to the entity it's used on;
  - writes into a draft map aren't blocked, but anonymous reads exclude them.
- `visibleTo(actor)` filters drafts (data-model §8).
- Version checks: a stale `version` gives `VersionConflict` (409) with the current row.

**Done when:**
- [ ] Every rule has a table-driven test covering both the allowed and the rejected case.
- [ ] An XSS corpus test passes: `<script>`, `onerror=`, `javascript:` and `data:` links, SVG payloads, `style` attributes and nested-encoding tricks are all neutralized on write.

### M1-T6 Generated REST routes

**Where:** `apps/api/src/routes/`.

- `registerEntityRoutes(app, entityKinds)` and `registerConfigRoutes(app, configResources)` generate the routes in architecture §5, including:
  - `PUT …/{plural}/by-key/{externalKey}` upserts;
  - list filters (`parentId`, `baseType`, `status`, `q` on `name_plain` with ILIKE until M7);
  - cursor pagination;
  - `spoilers=exclude`.
- Hand-written route modules, each small:
  - universes and maps;
  - the aspects under `/entities/{id}/…`;
  - `/groups/{id}/members`.
- OpenAPI tags per kind, stable `operationId`s, and descriptions written for LLM readers: what the resource is, its units, and an example.
- The **generic contract suite** (`apps/api/test/contract/`) runs once for every registered kind and every config resource:
  1. create, then read back;
  2. list with filters;
  3. update with the right version, then with a stale version → 409;
  4. spoiler flags round-trip;
  5. `spoilers=exclude` blacks out the flagged content;
  6. the `X-GE-Batch-Id` header is present;
  7. revert restores the previous state;
  8. delete.

**Done when:**
- [ ] The contract suite passes for all kinds and config resources, without a single per-kind test file.
- [ ] Swagger UI shows every route grouped by tag, and the OpenAPI document validates.

### M1-T7 Batch endpoint

**What:** `POST /api/v1/batch`, many operations in one transaction and one change batch. This is how the editor saves multi-object drags and how LLM agents build structures in one call.

- Operations:
  - `create`, `update`, `delete` and `upsert` for any kind;
  - `setLocation`, `addMembers`, `removeMembers`, `setFacts`, `addLink`, `addRelation`.
- **Temporary references:** an operation can refer to an entity created earlier in the same batch as `"$op:3"`. For example, "create a system, then create planets whose `parentId` is `$op:0`".
- `dryRun: true` runs everything, collects the would-be results plus an **impact summary** (rows touched per table, read from the batch's `change_log` rows before rollback), then rolls back. The editor uses it for delete confirmations (M3-T5).
- Limit: 1,000 operations per batch.

**Done when:**
- [ ] One batch creates a system, its star, three planets and a group with members, and the temporary references resolve.
- [ ] If operation 37 of 50 fails, nothing is written, and the problem response names the operation index.
- [ ] A dry run leaves the database unchanged and returns the results plus `impact`.

### M1-T8 History endpoints

- `GET /universes/{id}/history` lists batches newest first, with filters for actor and time range and cursor pagination.
- `GET /history/{batchId}` summarizes the batch per entity: "Gudrun: x 120→140, name changed".
- `POST /history/{batchId}/revert` returns the new batch id. On a conflict it returns 409 listing the conflicting entities.

**Done when:**
- [ ] Integration tests cover listing, detail, revert, revert-of-revert (redo) and the 409 response shape.

### M1-T9 View payload endpoints

- `GET /maps/{mapId}/views/galaxy`, `GET /objects/{id}/views/system` and `GET /objects/{id}/views/orbit`, returning the shapes in architecture §6, with:
  - appearance resolved with `resolveAppearance`;
  - drafts filtered for anonymous actors;
  - no rich-text bodies;
  - the orbit view including pins: places and events whose location is on the subject.
- Requesting the system view of a non-system, or the orbit view of a type without one, returns 400 with a clear problem.

**Done when:**
- [ ] Snapshot tests pass against the demo seed.
- [ ] With the stress seed (5,000 objects), the galaxy payload builds in under 300 ms locally and is under 500 kB gzipped.

### M1-T10 API client package

- `pnpm api:generate`:
  1. builds the server in-process (`buildServer` with a dummy config, no network);
  2. writes `packages/api-client/openapi.json`;
  3. runs `openapi-typescript` to produce typed paths.
- `createApiClient({ baseUrl, getAuthHeader? })` wraps `openapi-fetch`, unwraps the `data` envelope, and throws typed errors for problem+json.
- CI regenerates the client and fails if the result differs from what's committed.

**Done when:**
- [ ] A test calls the health and objects endpoints through the typed client.
- [ ] Changing a route schema without regenerating fails CI.

### M1-T11 Seeds

- **`pnpm db:seed demo`** builds "Example Universe" (slug `example-universe`, distance unit "ly"), one map (slug `main`), and galaxy settings. Its contents:
  - about 25 objects: 6 systems, each with a star; planets, a few explorable; 2 moons; an asteroid belt; a station; a nebula; an anomaly;
  - group types Sector › Sub-sector, with 1 sector holding 2 sub-sectors;
  - 3 event categories;
  - 2 places and 4 events across the location modes;
  - 2 characters with participant relations;
  - at least one example of **every spoiler flag** in data-model §7;
  - text in all three formats, including inline spoilers.

  Every row has an `external_key`, so re-running the seed is idempotent (it upserts).
- **`pnpm db:seed stress --objects 5000 --groups 300 --routes 50`** generates content deterministically from a seed: positions follow the galaxy density function, and groups are spatial clusters. Routes are skipped until M4.
- `pnpm db:reset` now ends by seeding demo.

**Done when:**
- [ ] Running either seed twice yields identical data.
- [ ] Later e2e and performance tests use these seeds.

---

## Milestone acceptance

- [ ] All tasks are checked off, and `pnpm check` and integration tests are green in CI.
- [ ] The demo works from Swagger UI alone.
- [ ] `docs/plan/decisions.md` is updated if any schema detail changed from data-model.md, and so is data-model.md itself.
