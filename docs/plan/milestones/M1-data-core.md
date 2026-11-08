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
- [x] Migrating from empty succeeds in CI.
- [x] Constraint tests pass. Each one tries the bad write and expects the right error:
  - a parent from another map is rejected;
  - an object can't be in two groups of the same type;
  - each of the four location modes rejects invalid combinations;
  - a character with a `map_id` is rejected;
  - `external_key` is unique per map but may repeat across maps;
  - color, slug and URL formats are checked.

**Notes (done 2026-11-07):**
- **Schema:** `packages/db/src/schema/` defines the 19 tables of data-model §3.1–3.7, without routes, route waypoints, citations or the auth tables. It's one migration, `migrations/0000_init.sql`, generated by drizzle-kit, with the hand-written part appended at the end.
- **Foreign keys** (38 of them) are all in that hand-written part. Each must be deferrable, Drizzle can't declare that, and a half-declared set would drift, so the Drizzle schema declares none. `migrations/README.md` explains the workflow, and a test checks every key is `DEFERRABLE INITIALLY IMMEDIATE`. The `nulls not distinct … where` index on `external_key` is hand-written for the same reason. The location `case` check, the `in (…)` lists and the formats fit in Drizzle's `check()`.
- **Generated, not typed by hand:**
  - check lists from the registries: kinds, base types, statuses, relation types, field value types, image roles, location modes and actor types;
  - the "characters have no map" check, from each kind's `scope`;
  - format checks (slug, hex color, field key, http(s) URL) from shared patterns in `@ge/domain` (`patterns.ts`), which the Zod schemas now use too.
- **Constraints are named** `<table>_<what>_<fk|uq|check>`, so a failure says which rule broke. The tests check each name.
- **Plan corrections:**
  - `maps.underlay_asset_id` is `on delete restrict`, as §11 says ("blocked while … a map underlay uses it"); §3.1 said `set null`.
  - The location check also requires the unused coordinate columns of each mode to be null (y, z, lon). data-model §3.4 is updated to match.
- **Tests:** 68 new integration tests.
  - Constraints: the six listed cases, plus a self-parent, an extension row in the wrong map, a misstated group type, a parent group from another map, valid and invalid combinations for each location mode, latitude and longitude ranges, and per-universe external keys for characters.
  - Consistency: 13 check lists against the registries, every foreign key deferrable, and every table with `map_id` constrained on it.
  - A throwaway test confirmed the error helper fails when a bad write succeeds or breaks a different constraint.
- **Also added to `@ge/domain`:** `IMAGE_ROLES`, `LOCATION_MODES`, `ACTOR_TYPES` and the `AssetVariants` schema.

### M1-T4 Audit trigger, batches and revert

**Where:** a custom migration, plus `packages/db/src/audit/`.

- `ge_audit()` and its triggers on every table in data-model §9, with primary-key columns as trigger arguments.
- `withBatch(actor, description, fn)` (data-model §9).
- `ge_revert_batch(p_batch uuid)` (PL/pgSQL, dynamic SQL, reverse order, conflict detection with SQLSTATE `GE409`), and a TypeScript wrapper `revertBatch(batchId, actor)` that runs it in a new batch with `reverts_batch_id`.
- An exported `AUDITED_TABLES` constant.
- An exported `CLONE_SPEC` constant (data-model §10), which lists every map-scoped table, its id columns and the columns to remap. It's only data for now; M7-T5 implements `cloneMap()` on top of it.

**Done when:**
- [x] Introspection test: every table in `AUDITED_TABLES` has the trigger, and every table with `map_id` or an `entities` foreign key is in `AUDITED_TABLES` and in `CLONE_SPEC`.
- [x] A write outside `withBatch` fails with `GE400`.
- [x] A **generated** test, one case per audited table, inserts, updates and deletes a row, reverts each batch, then reverts the revert (redo). The row ends up in the expected state each time.
- [x] Cascade test: delete a system that has child objects, group memberships, images and an event located on it. Reverting the delete restores everything exactly, apart from `updated_at`.
- [x] Conflict test: update A, update A again, then revert the first batch → 409 `GE409`, and nothing changes.

**Notes (done 2026-11-07):**
- **Migration `0001_audit.sql`** (hand-written) contains `ge_audit()`, its trigger on each of the 17 tables in `AUDITED_TABLES`, and `ge_revert_batch()` with three small helpers. The trigger lines were printed from `AUDITED_TABLES`, whose primary keys are read from the Drizzle schema, and a test checks that the triggers and the list still match.
- **`withBatch(db, actor, description, fn, { universeId?, revertsBatchId? })`** returns `{ result, batchId }`. It sets `ge.batch_id` for its transaction only, and a test checks that the setting doesn't leak to the next write on the same connection.
- **`revertBatch(db, batchId, actor)`** runs `ge_revert_batch` in a new batch described as "Revert: …", and returns the new batch id and the number of rows changed. Postgres errors become `RevertConflictError` (GE409, with the table and primary key) and `BatchNotFoundError` (GE404), ready for the API to map to 409 and 404.
- **"Unchanged" ignores `version` as well as `updated_at`:**
  - this applies both when checking for conflicts and in the cascade test;
  - every restore bumps `version`, so comparing versions would make any batch that touched a row twice impossible to revert;
  - the conflict test still fails as required, because the content differs.
- **`CLONE_SPEC`** lists, per table, the columns that get fresh ids, the columns remapped through `clone_ids`, and how its rows are selected: by map, by an entity in the map, or (relations) by either end in the map.
- **Deleting an object (for M1-T5):** the database cascade removes the children's `celestial_objects` rows but not their `entities` rows, because `entities` doesn't reference its extension. The entity service must therefore delete the whole subtree's entities in one statement, as the cascade test does with a recursive query.
- **Tests that aren't about history** can call `withTestDb(fn, { ambientBatch: true })`. Every connection then starts inside one pre-made batch, through Postgres's `options` connection setting. The M1-T3 constraint tests use it.
- **Tests:** 29 new database integration tests (99 in all):
  - introspection: triggers and their key arguments, every content table audited, map-scoped tables in both lists, `CLONE_SPEC` columns exist;
  - `withBatch`: GE400, the log contents, no leaking, rollback;
  - the generated test, one case per audited table, which fails if a table has no case;
  - cascade, conflict and an unknown batch.
  - A throwaway test confirmed that replacing `ge_revert_batch` with a no-op makes the assertions fail.

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
- [x] Every rule has a table-driven test covering both the allowed and the rejected case.
- [x] An XSS corpus test passes: `<script>`, `onerror=`, `javascript:` and `data:` links, SVG payloads, `style` attributes and nested-encoding tricks are all neutralized on write.

**Notes (done 2026-11-07):**
- **Layout:** in `apps/api/src/services/`:
  - `entity-service.ts`: `createEntity`, `updateEntity`, `deleteEntity`;
  - `entity-read.ts`: `getEntity`, `listEntities`;
  - `aspects/`: images, links, facts, relations, location, group members;
  - `rules/`;
  - `sanitize.ts`, `visibility.ts`, `errors.ts`, `lookup.ts`.

  Writes take an `Executor` (a transaction from `withBatch`) instead of opening their own batch, so the routes (M1-T6) and the batch endpoint (M1-T7) decide what one undoable change is.
- **Generic over kinds:** the services handle every kind the same way. The base and extension fields are split by the registry. `EXTENSION_TABLES` in `@ge/db` binds each kind to its table, and a test checks the binding against the registry. The only per-kind code is the rule dispatch in `rules/entities.ts`.
- **Reads:**
  - `include=` takes `facts`, `images`, `links`, `relations`, `location`, and `members` for groups;
  - relations are listed from both ends;
  - lists filter by extension fields (`parentId: null` means top level), status and a name substring, and page with an id cursor.
- **Aspect shapes** (`ImageWrite`/`Read`, `LinkWrite`, `FactWrite`, `RelationWrite`, `LocationWrite`, a discriminated union per mode, `MemberWrite`, and `ENTITY_INCLUDES`) are in `@ge/domain`, ready for the routes.
- **Sanitizing:**
  - `sanitizeRichTextFields(schema, input)` walks the Zod schema, so rich text is found inside unions (text facts) and lists, and look-alike objects elsewhere are left alone;
  - HTML is cleaned with sanitize-html and `RICH_TEXT_POLICY`, and every link is checked again with `isAllowedLinkUrl`;
  - images outside `/media/` are dropped, and SVG, MathML, iframes and similar tags are removed with their contents;
  - Markdown and plain text are stored as written. The Markdown renderer (M3) must ignore raw HTML and use `isAllowedLinkUrl` for link targets.
  - `<b>` and `<i>` were added to the policy on 2026-11-08 at the owner's request, so bold and italic pasted from wikis keep their formatting (ux.md §8).
- **How the rules were interpreted:**
  - **Group types with no parent type** make top-level groups only.
  - **Cycles:** a group or object can't end up inside itself. Self-nesting group types such as a Region inside a Region make this reachable for groups.
  - **Base type changes:** changing an object's base type must keep its children allowed.
  - **Group type changes:** changing a group's type must keep its members in one group per type and its subgroups nested correctly.
  - **`surface` locations** need a body that has an orbit view (planet, moon). **`space` locations** use the frame of a body that has a system view (a system), or the galaxy.
  - **Relations** may cross maps within a universe; characters relate to events anywhere.
- **Drafts:** `visibleTo(actor, { includeDrafts })` honors `includeDrafts` only for editors. An anonymous reader gets no draft, nothing on a draft map, and no descendant of a draft object, at any depth.
- **Errors:** `RuleViolation` → 422 (with the field's path), `NotFound` → 404, `VersionConflict` → 409 with `current`, and `RevertConflictError` → 409 with `conflict`. Database constraint errors that slip past the rules map to 409 (unique) or 422 (foreign key, check). Zod errors map to 400.
- **Also changed:**
  - `drizzle-orm` moved to the shared catalog, since db and api both use it;
  - the API gained `sanitize-html` 2.18.1;
  - the shared ESLint config now treats `_`-prefixed names, and fields dropped with `...rest`, as intentionally unused.
- **Tests:** 75 new API tests:
  - 31 rules, each allowed and rejected (62 tests), checking the error's field path and, where it matters, its wording, including the friendly "Gudrun is already in Helican, another Sector";
  - a 32-payload XSS corpus, and confirmation that allowed HTML passes unchanged;
  - service tests for create (batch, HTML cleaning, `namePlain`), includes, versions and conflicts, subtree delete, lists and cursors, and drafts at every depth;
  - the error mapping.

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
- [x] The contract suite passes for all kinds and config resources, without a single per-kind test file.
- [x] Swagger UI shows every route grouped by tag, and the OpenAPI document validates.

**Notes (done 2026-11-08):**
- **Generated routes:** `routes/entities.ts` and `routes/config.ts` loop over the registries; neither names a kind.
  - **Entity routes:** list, create, `PUT …/by-key/{externalKey}`, get, update and delete.
  - **List filters** are derived per kind: `status`, `q`, and every extension field that is an id or a choice (`parentId`, `baseType`, `subtypeId`, `groupTypeId`, `parentGroupId`, `categoryId`). An id field that may be empty accepts `null`, so `parentId=null` lists the top level.
  - **Reads** take `include=` and `spoilers=exclude`.
  - **Docs:** Swagger shows 83 operations under 17 tags. Each tag and operation is described for LLM readers, from new `description` and `example` fields in the entity-kind and config registries. A test checks every example against its create schema.
- **Hand-written modules:**
  - `routes/containers.ts`: universes and maps, with new `UniverseCreate/Update/Read` and `MapCreate/Update/Read` schemas in `@ge/domain`;
  - `routes/content-routes.ts`: images, links, facts and relations;
  - `routes/placement-routes.ts`: location and group members.
  - Aspect item routes nest under the entity: `PATCH/DELETE /entities/{entityId}/links/{linkId}`, `…/images/{assetId}/{role}`, `…/relations/{relationId}`, and `PUT/DELETE …/facts/{fieldDefinitionId}`. They return their rows with spoiler flags; the redacted view is the entity read with `include` and `spoilers=exclude`.
- **Writes:**
  - every mutating request is one batch (`http/batch.ts`), which honors `X-GE-Batch-Description` and returns `X-GE-Batch-Id`;
  - with `GE_AUTH_MODE=none` the actor is the local owner;
  - a new universe's creation batch is linked to that universe once it exists. `withBatch` callbacks now receive the batch id for this.
- **Upsert by key** creates on the first call (201) and updates on later ones (200), with no version needed. A key already used by another kind is a 422.
- **Config resources** got a generic service (`services/config-service.ts`) and `CONFIG_TABLES` in `@ge/db`, tested against the registry. Settings have no version, so the last write wins.
- **The contract suite** (`test/contract/`) runs the same steps for each of the 5 entity kinds (9 steps) and 4 config resources (6 steps), 69 tests in all.
  - The steps: create and read back; list with every derived filter; update and a stale-version 409; spoiler round-trip; `spoilers=exclude`; batch headers; upsert by key; revert (through `revertBatch`; the HTTP route is M1-T8); delete.
  - Request bodies come from the registry examples. Reference ids are filled from `REFERENCE_FIXTURES`, keyed by field name (such as `groupTypeId`), not by kind.
- **A leak the contract suite found and fixed:** with `spoilers=exclude`, a hidden entity's (or map's) `namePlain` still held its name. Redaction now rebuilds `namePlain` from the redacted name, with unit tests in `@ge/domain`.
- **Lint:** tests may now use `any`, as `AGENTS.md` allows ("no `any` … outside tests"), so they can read JSON responses loosely.
- **Tests:** 76 new API tests: the 69 contract tests, plus 7 for universes and maps, aspects, members, 422 problem+json and batch descriptions. The OpenAPI test now checks registry coverage, and that operationIds are unique and every operation has a declared tag and a description.

### M1-T7 Batch endpoint

**What:** `POST /api/v1/batch`, many operations in one transaction and one change batch. This is how the editor saves multi-object drags and how LLM agents build structures in one call.

- Operations:
  - `create`, `update`, `delete` and `upsert` for any kind;
  - `setLocation`, `addMembers`, `removeMembers`, `setFacts`, `addLink`, `addRelation`.
- **Temporary references:** an operation can refer to an entity created earlier in the same batch as `"$op:3"`. For example, "create a system, then create planets whose `parentId` is `$op:0`".
- `dryRun: true` runs everything, collects the would-be results plus an **impact summary** (rows touched per table, read from the batch's `change_log` rows before rollback), then rolls back. The editor uses it for delete confirmations (M3-T5).
- Limit: 1,000 operations per batch.

**Done when:**
- [x] One batch creates a system, its star, three planets and a group with members, and the temporary references resolve.
- [x] If operation 37 of 50 fails, nothing is written, and the problem response names the operation index.
- [x] A dry run leaves the database unchanged and returns the results plus `impact`.

**Notes (done 2026-11-08):**
- **The request shape**, `BatchRequest`, is in `@ge/domain` (`schemas/batch.ts`), one strict shape per operation.
  - Entity operations: `create` (with `mapId` or `universeId`), `update` (`id`, `version`), `delete` (`id`, `version`), `upsert` (`externalKey`, plus a scope).
  - Aspect operations: `setLocation`, `addMembers`, `removeMembers` (a list of object ids), `setFacts` (a list) and `addLink`, `addRelation`.
  - `data` is the same body as the matching single-resource route. It's checked by that route's service once references are resolved.
- **Temporary references:** `"$op:N"` is replaced anywhere in an operation (`id`, `mapId`, or deep inside `data`) by the id operation N returned: the entity, link or relation it created or changed. Only earlier operations can be referred to.
- **Execution** (`services/batch-service.ts`): operations run in order in one `withBatch`, through the same services as the single routes, so every rule applies. The batch is listed in the universe of the first entity it touches.
- **Errors:** any failure rolls everything back. The problem response carries `operationIndex`, a detail such as "Operation 37 (create): …", and error paths pointing into the request (`/operations/37/data/parentId`, or `/operations/0/mapId` for an operation's own fields).
- **Dry run** executes everything, reads the impact (rows per table and operation) from the batch's `change_log`, then rolls back by throwing a sentinel. It returns `batchId: null` and no `X-GE-Batch-Id` header.
- **The response** is `{ data: { dryRun, batchId, results: [{ index, op, kind?, id, data }], impact? } }`.
- **Tests:** 7 integration tests:
  - the system with star, planets and group, ending in one revertable batch;
  - 50 operations where number 37 fails: nothing written, index named;
  - a validation error inside `data`;
  - a dry run delete, which shows the cascade to the child;
  - every operation type in one request;
  - forward and self references;
  - request validation: unknown op, unregistered kind, missing scope, more than 1,000 operations.

### M1-T8 History endpoints

- `GET /universes/{id}/history` lists batches newest first, with filters for actor and time range and cursor pagination.
- `GET /history/{batchId}` summarizes the batch per entity: "Gudrun: x 120→140, name changed".
- `POST /history/{batchId}/revert` returns the new batch id. On a conflict it returns 409 listing the conflicting entities.

**Done when:**
- [x] Integration tests cover listing, detail, revert, revert-of-revert (redo) and the 409 response shape.

**Notes (done 2026-11-08):**
- **The list** (`GET /universes/{id}/history`) sorts newest first by batch id: ids are UUIDv7, so id order is time order and the cursor is an id. It filters by `actorType`, `actorLabel`, `from` and `to`. Each batch shows `revertsBatchId` and `revertedBy` (the batches that reverted it).
- **The detail** (`GET /history/{batchId}`) groups the change log by entity. Extension-table rows count as the entity's own fields. Aspect rows roll up to the entity they belong to, as "2 members added", "link removed" or "location set". Simple values show old→new ("Gudrun: x 120→140, name changed"); rich text and documents show "changed". Deleted entities are named from the log. Changes to universes, maps, settings and assets are listed separately under `other`. The wording logic is pure (`services/history-summary.ts`) and unit-tested.
- **Revert** (`POST /history/{batchId}/revert`) returns 201 with the new batch id (also in `X-GE-Batch-Id`).
  - On a conflict it returns 409 with `conflicts: [{ table, primaryKey, entityId, name }]` listing every conflicting row, not only the first one the database stopped at. The list comes from applying `ge_revert_batch`'s rules to each row's last change in the batch, compared with the current rows.
  - The single-row `conflict` field from M1-T5 became this `conflicts` list.
- **Bug fixed:** batches from the generated entity routes weren't linked to their universe, so plain object or place edits were missing from the universe's history. Creates now take the universe from the map (or path), and updates and deletes from the entity. A new contract step (6c) checks this for every kind and config resource.
- **Tests:**
  - 4 unit tests for the summary wording;
  - 6 integration tests: listing with every filter and cursor pages; detail for an edit, a creation and a universe; revert and redo; restoring a deleted object with its child; a 409 listing two conflicting entities with nothing changed; 404;
  - 9 contract tests for step 6c.

### M1-T9 View payload endpoints

- `GET /maps/{mapId}/views/galaxy`, `GET /objects/{id}/views/system` and `GET /objects/{id}/views/orbit`, returning the shapes in architecture §6, with:
  - appearance resolved with `resolveAppearance`;
  - drafts filtered for anonymous actors;
  - no rich-text bodies;
  - the orbit view including pins: places and events whose location is on the subject.
- Requesting the system view of a non-system, or the orbit view of a type without one, returns 400 with a clear problem.

**Done when:**
- [x] Snapshot tests pass against the demo seed. *The seeds arrive later, in M1-T11, so the snapshot uses a deterministic fixture built in the test; M1-T11 switches it to the demo seed.*
- [x] With the stress seed (5,000 objects), the galaxy payload builds in under 300 ms locally and is under 500 kB gzipped. *Measured on a generated map of the stress seed's size: **51 ms median, 389 kB gzipped** (2.1 MB raw), on the owner's Mac.*

**Notes (done 2026-11-08):**
- **Payload schemas** (`GalaxyView`, `SystemView`, `OrbitView` and their parts) are in `@ge/domain`, so M1-T10's client and the web app share them.
- **Additions to architecture §6:**
  - every record carries `nameRedacted`, its plain-text name with every spoiler blacked out. A whole-record spoiler is a full bar, and inline name spoilers become bars in place. 3D labels need it: `namePlain` alone can't show which part of a name to hide;
  - objects carry `size`, the resolved size in the view's unit, or null where the type isn't drawn as a body;
  - system and orbit payloads include `map` and `ancestors` (outermost first) for breadcrumbs.
- **Galaxy:** top-level objects only, all groups with their members, the universe's group types, and `routes: []` until M4. Members whose object the reader can't see (drafts) are left out, so they don't shape outlines.
- **System and orbit:** the subject and its direct children, resolved for that view. The subject's base type must open the requested view; otherwise the 400 says which view it opens, if any, for example "Gudrun I is a planet, which opens the orbit view, not the system view." The `explorable` flag isn't enforced here; it governs navigation in the UI.
- **Pins** (orbit only) are places and events located on the subject's surface or at the body, plus events located at one of those places, which take the place's coordinates. `locationSpoiler` is set if either location is a spoiler.
- **Drafts** are filtered for readers who don't ask for them, using the same rules as entity reads.
- **`spoilers=exclude`:** `namePlain` becomes `nameRedacted`, spoiler memberships are removed, and pins with a spoiler location aren't sent.
- **Tests:** 7 integration tests:
  - a snapshot of all three payloads for a 20-operation fixture (ids replaced by stable labels);
  - galaxy contents and drafts;
  - system children with subtype ← object appearance layering;
  - orbit pins, including events at places, and moon breadcrumbs;
  - `spoilers=exclude`;
  - the 400 and 404 cases;
  - the 5,000-object benchmark, which prints its numbers and has a looser time budget in CI.

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
- [ ] Later e2e and performance tests use these seeds, starting with M1-T9's view snapshot (`apps/api/test/views.int.test.ts`) and stress benchmark (`views-stress.int.test.ts`), which use stand-in fixtures until the seeds exist.

---

## Milestone acceptance

- [ ] All tasks are checked off, and `pnpm check` and integration tests are green in CI.
- [ ] The demo works from Swagger UI alone.
- [ ] `docs/plan/decisions.md` is updated if any schema detail changed from data-model.md, and so is data-model.md itself.
