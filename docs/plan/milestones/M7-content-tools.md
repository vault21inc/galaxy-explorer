# M7: Content tools and LLM access

**Goal:** make building a big universe fast:
- custom facts and subtypes per universe;
- "Fill from wiki";
- import and export;
- cloning a map for another era;
- search;
- an MCP server so LLM agents can create, read, update and delete content safely.

**Depends on:** M6. **M7-T7 and M7-T8 depend only on M1** and can be pulled forward at any time, for example to let an agent populate the galaxy while the 3D milestones are under way.
**Read first:** [data-model.md §3.4–3.5, §10, §12](../data-model.md), [architecture.md §3, §5](../architecture.md), [decisions.md U4, U7, A4](../decisions.md).
**Demo at the end:**
1. Define the facts "Population", "Tithe grade" and "Sub-sector" for planets, and the subtype "Hive World".
2. Use "Fill from wiki" on Gudrun: the infobox values and the lead paragraph come in with a citation.
3. Export the map, clone it as "M42", and move one system in the clone.
4. Press ⌘K, type "gud", and fly to the result.
5. In Claude Code with the MCP server, ask it to "add three moons to Gudrun"; then revert the agent's batch from the History panel.

---

### M7-T1 Custom fields (facts)

- Field definitions are managed in the settings table (M4-T1): key, label, value type, unit, which kinds, base types and subtypes they apply to, and wiki aliases.
- In the entity form, a **Facts** section shows the definitions that apply. Each value is edited with a widget chosen by `value_type`, and has a spoiler flag. It saves through `/entities/{id}/facts`.
- The info panel shows a facts table, blacked out per row when hidden. Empty facts are not shown.

**Done when:**
- [x] Contract tests for the facts aspect pass.
- [x] E2E: define "Population" (number, unit "billion"), set it on a planet, and see it in view mode; a spoiler fact is blacked out.

**As built:**
- **Mostly already there:** the API (definitions as a settings resource, `/entities/{id}/facts`, the rules that a value's type matches its definition and that the field applies to the entity's kind, base type and subtype) and the reading panel's facts table were built in M1 and M2.
- **Settings:** the Field definitions table gains the **Wiki aliases** column through a new `list` form widget (a comma-separated input, `fields/list-field.tsx`), so "Fill from wiki" (M7-T3) has its aliases.
- **The form's Facts section** (`panels/facts/`) replaces the facts table in edit mode. It has a row for each definition that applies (`definitionsFor`: the kind's, narrowed by base type and subtype, in the definitions' order), with an input for the value type:
  - a number, with its unit;
  - one line of text, keeping its format;
  - a date as the universe writes it, plus a sort key;
  - a link and its text.

  Once a row has a value, it gets a spoiler switch and a clear button. Each change saves at once (PUT or DELETE `/entities/{id}/facts/{fieldDefinitionId}`) as one history entry, such as "Edit Population of “Gudrun”". With no definitions for the kind, the section links to the universe settings.
- **Tests:**
  - `apps/api/test/contract/facts.contract.int.test.ts` runs the facts aspect for every kind with facts, derived from the registry: set, replace, list, read with `include=facts`, remove, the 422s (wrong value type, a field for another kind), spoilers=exclude and reverting batches. The contract suites now share `created` from the harness.
  - `apps/web/e2e/facts.spec.ts` covers the "Done when" flow through the settings table and the form.
  - `apps/web/test/facts-editor.test.ts` covers `definitionsFor` and `parseList`.
- **Later (2026-11-15, from the owner's M7 demo):** a new field definition's **Key** fills in from its **Label** when the label is left ("Tithe grade" is `tithe_grade`, `fieldKeyFrom` in `@ge/domain`), until a key is typed by hand. The settings registry declares it (`derived` on `field_definitions`), and only new rows follow it: an existing key is how imports and facts refer to the field. The key's error now says it must start with a letter. Tests: `packages/domain/test/settings-forms.test.ts`; `facts.spec.ts` relies on the filled-in key.

### M7-T2 Object subtypes

- Subtypes are managed in the settings table: base type, name, icon, description, and default appearance (edited with the appearance editor).
- The Add menu lists each base type's subtypes ("Planet ▸ Hive World"). Creating one sets `subtype_id`, and the subtype's defaults apply through `resolveAppearance`.
- The info panel header shows the subtype. Field definitions can apply to a single subtype.

**Done when:**
- [x] E2E: creating a "Hive World" gives the city preset by default; changing the subtype's default color recolors every Hive World that hasn't overridden it.

**As built:**
- **Already there:** subtypes as a settings resource; `subtypeId` on objects; subtype defaults between the base type's and the object's in `resolveAppearance`, on the server and in the browser; the subtype in the panel header ("Planet · Hive World"); field definitions for one subtype (M7-T1).
- **The settings table:**
  - the Icon column uses the icon picker (M6-T4);
  - a new **Look** column shows a summary of the default look (the preset and color) on a button. It opens a dialog with the subtype's **description** and its **default look**.
- **The default look reuses the object form's appearance fields** from the entity-kinds registry, less the per-object ones (the uploaded surface and the seed), through a new `defaultLook` form widget (`fields/default-look-field.tsx`). The fields are given a stand-in object of the subtype's base type whose `appearance` is the subtype's `defaultAppearance`, so:
  - the right fields show (a planet's preset and palette, a nebula's region);
  - the dimmed defaults are the base type's and the preset's;
  - each change is written back as `defaultAppearance`.

  No widget knows about subtypes. The form's show-conditions moved to `form-conditions.ts` to be shared.
- **The Add menu:** a base type with subtypes opens a submenu (Planet ▸ Planet, Hive World, Forge World), in the settings' order. The chosen subtype goes through the editor state (`placingSubtypeId`) to the placement:
  - the ghost and the optimistic object start with its defaults;
  - the object is created with its `subtypeId`, named "New Hive World";
  - the toolbar says "Click to place a Hive World".
- **Tests:** `apps/web/e2e/subtypes.spec.ts` (the "Done when" flow: a subtype made in settings, its look set in the dialog, two Hive Worlds placed from Add, one with its own color, then the subtype's color changed); the widget's schema check in `packages/domain/test/entity-forms.test.ts`.

### M7-T3 Fill from wiki

**Where:** `apps/api/src/wiki/`, `apps/web/src/panels/wiki-fill/`.

- A `WikiSource` interface with a `MediaWikiSource` adapter. Constructor: base API URL (for example `https://warhammer40k.fandom.com/api.php`), a User-Agent from `GE_WIKI_USER_AGENT`, and a rate limit of one request per second per host. Responses are cached for 24 h in memory.
- `GET /api/v1/wiki/search?source=…&q=…` uses `action=query&list=search`, following redirects.
- `GET /api/v1/wiki/preview?source=…&title=…`:
  - fetches the page with `action=parse&prop=wikitext|sections`;
  - extracts the **template parameters** of its info box with a wikitext parser such as `wtf_wikipedia`, which accepts other MediaWiki domains (verify this), or `wikiparser-node`. Infobox templates vary (`{{Planet}}` vs `{{Infobox Planet}}`), so treat the first template with named parameters as the candidate and let the user pick another;
  - converts the lead section to Markdown, with links reduced to plain text or optional links back to the wiki.
- **Mapping:** template parameter → field definition through `field_definitions.wiki_aliases`. Unmapped parameters are listed so the owner can add aliases from the dialog.
- **Dialog:**
  1. Search, then choose a page.
  2. A **diff preview**: current value vs. wiki value per field and for the description, each with a checkbox.
  3. Apply as one batch ("Filled Gudrun from warhammer40k.fandom.com").
- **Citations:** add the `citations` migration (data-model §3.4) with an audit trigger and `CLONE_SPEC` entry. Store one citation per filled target, with the source URL, title, license (from `meta=siteinfo&siprop=rightsinfo`) and retrieval time. The panel shows "Text from ‹page› (CC BY-SA 3.0)" under cited content, and a site-wide Attributions page lists all citations (M8-T9).
- **Never copy images:** wiki artwork is mostly Games Workshop's and isn't covered by the text license. The dialog offers a link instead.

**Done when:**
- [x] Unit tests on saved wikitext fixtures (Gudrun and Hubris; the two infobox templates noted in the planning research) extract the expected parameters.
- [x] An integration test with a mocked HTTP server checks the rate limit, the User-Agent and redirects.
- [x] E2E with fixtures: filling Gudrun sets population and sub-sector facts and a description, each with a citation, as one revertible batch.

**As built:**
- **Which wikis (D-35):** only those configured, `GE_WIKI_SOURCES` (JSON: id, label, API URL), with the Warhammer 40k Wiki as the default. The routes take a source **id**, never a URL, so the API can't be made to fetch an address a request names.
- **The client** (`apps/api/src/wiki/media-wiki.ts`) is the planned `WikiSource`:
  - one request a second per host, shared by every client of that host;
  - 24 h of cached answers;
  - `GE_WIKI_USER_AGENT` on every request;
  - redirects followed (`redirects=1`, reported as `redirectedFrom`);
  - a search also asks, in the same request, whether the query is itself a page's title, and lists that page first: Fandom's search leaves out the page titled exactly as the query, so "Cadia" found Cadian Sector but not Cadia;
  - a missing page answers 404, and a wiki that fails answers 502 (`UpstreamError`).
- **No parser library (D-35):** `apps/api/src/wiki/wikitext.ts` reads what's needed:
  - the top-level templates with named parameters, their values as plain text (`<br>` as a comma);
  - the lead section as Markdown, with bold and italic kept and links as plain text;
  - references, comments, files, categories, tables and nested templates left out.

  The tests run it on the real Gudrun and Hubris pages (`apps/api/test/fixtures/wiki`).
- **Routes:** `GET /wiki/sources`, `GET /wiki/search?source&q`, `GET /wiki/preview?source&title`. The preview returns the templates, the lead, the page's address and the wiki's licence from `meta=siteinfo`; the Warhammer 40k Wiki says "CC-BY-SA".
- **Mapping** is pure, in `@ge/domain` (`wiki/mapping.ts`), so the dialog redoes it as soon as an alias is added:
  - names compare loosely (`sub-sector`, `subsector` and `Sub-sector` are one name);
  - a field's key and label count as aliases too, so Population needs none;
  - each field is filled once;
  - filler such as "Unknown" fills nothing;
  - numbers are read with separators and scale words, and converted to the field's unit ("5,000,000,000" in a field of billions is 5).
- **Citations:**
  - the table, with its migration (0005), audit trigger and `CLONE_SPEC` entry;
  - routes: GET and POST `/entities/{id}/citations`, and DELETE for one;
  - `include=citations`, and an `addCitation` batch operation;
  - one citation per target and page: citing again updates its time.

  The panel shows "Text from Gudrun (CC-BY-SA)" under a cited description and a fact, and a **Sources** section lists the pages. The site-wide Attributions page is still M8-T9's.
- **The dialog** (`apps/web/src/panels/wiki-fill/`), from "Fill from wiki…" in the edit-mode panel:
  1. search, starting from the entry's name, and choose a page;
  2. see what each field says now and what the wiki says, with a tick each: an empty description and changed facts start ticked. Pick another info box if there are several; turn leftover parameters into a field's alias ("Use segmentum for…");
  3. apply as one batch, "Filled Gudrun from warhammer40k.fandom.com". It sets the description and the facts (keeping each fact's spoiler flag) and adds a citation per filled target. One undo takes it all back.

  Images are never offered; the dialog links to the page instead.
- **Tests:**
  - `apps/api/test/wiki/wikitext.test.ts` covers the two fixtures and edge cases;
  - `apps/api/test/wiki/wiki.int.test.ts` runs against the fixture wiki server (`test/fixtures/wiki/server.ts`): the User-Agent, a second between requests, the cache, redirects, the routes, and a fill batch that reverts as one;
  - `packages/domain/test/wiki-mapping.test.ts` and `apps/web/test/fill-plan.test.ts` cover the mapping and the dialog's logic;
  - `apps/web/e2e/wiki-fill.spec.ts` covers the "Done when" flow. The e2e run starts the fixture wiki on port 3102 and points its API there.

### M7-T4 Import and export

- **Export** (`GET /universes/{id}/export`, `GET /maps/{id}/export`): a zip containing
  - `manifest.json`: a format version, generator, time, and counts;
  - `universe.json`: settings, config resources and universe-scoped entities;
  - `maps/<slug>.json`: map-scoped entities, aspects, memberships, locations and waypoints, referenced by `externalKey` when present and by id otherwise;
  - `assets/<id>.<ext>` plus the asset metadata.

  The format is defined by Zod schemas in `packages/domain/src/export/`, and a JSON Schema generated from them is published at `/api/v1/export-schema.json`.
- **Import** (`POST /universes/{id}/import`, multipart zip):
  - modes **create** (new ids) and **merge** (upsert by `externalKey`, skipping rows without a key);
  - `dryRun` returns a report: creates, updates, conflicts and unresolved references;
  - the real import is one batch.
- **CSV import of objects**, for quick bulk placement: columns `name, base_type, x, y, z, parent_key, group_key, external_key`. It uses the same import pipeline.
- UI: Export and Import live in the universe settings, with the dry-run report shown before confirming.

**Done when:**
- [x] Round trip: export the demo universe, import it into an empty install, export again. The two exports are identical apart from timestamps.
- [x] A merge import updates objects by key without duplicating them.
- [x] A dry run changes nothing.
- [x] Importing a 5,000-object CSV takes under 30 s.

**As built:**
- **No ids in the file (D-36).** A file full of UUIDs couldn't round-trip, since an import into another universe makes new ids, and it would be hard to read or write by hand. Records are the API's create bodies with each id field swapped for a reference (`parentId` is `parent`):
  - an entry is referred to by its `externalKey`, or, without one, by a `ref` made from its name ("gudrun", then "gudrun-2");
  - a settings row by its name (a field definition by its key);
  - an asset by the SHA-256 of its upload, which also names its files: `assets/<sha256>/<variant>.webp`, the plan's `assets/<id>.<ext>` without the id.

  Which fields are ids is declared in the registries (`references` on each entity kind and settings resource; a test checks every id field is listed), so the format, the export and the import follow them on their own. The config service's reference checks now read them too.
- **The files:**
  - `manifest.json`;
  - `universe.json`: the universe's fields (not its slug), assets, one list per settings resource, the characters, and the relations between them;
  - `maps/<slug>.json`: the map's fields, one list per kind, each entry with its facts, images, links, citations, location, members and waypoints, and the relations with an end in the map.

  Nulls and empty lists are left out, and entries are ordered parents first. Exporting, importing into an empty universe and exporting again gives the same files apart from the export's time. The schemas are in `@ge/domain` (`export/`), published as JSON Schema at `GET /api/v1/export-schema.json`.
- **Export:** `GET /universes/{id}/export` and `GET /maps/{id}/export`. A map export carries the universe's settings, assets and characters too. Drafts and spoilers are included, so on the private preview only the editor may export. An image file the media folder lacks (the demo seed's placeholders) is left out, and the import recreates the asset without it, noting so.
- **Import** (`POST /universes/{id}/import?mode&dryRun&mapId`, multipart): the zip, or a CSV of objects (the plan's columns; `mapId` names its map).
  - **Matching:** assets by hash, settings rows by name, maps by slug.
  - **create:** what matches is used as it is; a map slug or entry key already used is a conflict (since 2026-11-15, an empty map of the slug is filled instead: see "Later" below).
  - **merge:** matches are updated; entries are upserted by key, and those without a key are left out. For an entry it updates, each aspect the file lists replaces the entry's, and an aspect left out stays.
  - **One batch,** through the entity, aspect, config and container services, so every rule applies. Each record runs in a savepoint: one the services refuse becomes a conflict in the report, and the import goes on to find the rest.
  - **The report:** creates, updates, kept and left out per kind of record; conflicts and references to nothing (either blocks the import: a blocked real import writes nothing and answers 409 with the report); entries left out; notes. A dry run does everything and rolls back.
  - **CSV:** an empty cell leaves a field as it is. `group_key` puts the object in that group, moving it out of another group of the same type.
- **Settings page:** an "Import and export" section. It has export links (the universe, or a chosen map) and an import form: file, "Add as new" or "Update by key", the map for a CSV, then **Check** (the dry run's report) and **Import**, enabled once a check passes.
- **Speed:** `pnpm perf` now times a 5,000-row CSV import (`scripts/perf/import.spec.ts`) against the 30 s budget, as D-33 keeps speed checks there. On the owner's Mac, beside the stress map:
  - first, 14.7 s as new objects and 23.2 s as an update by key; a dry run costs about what the import does;
  - M7-T6's search refresh pushed the update to 26–32 s;
  - since then, the import writes through `insertEntity` and `applyEntityUpdate`, the services' create and update without reading the entry back, and updates use the keys, kinds and versions it read once: 8–10 s as new objects, 13.5 s as an update by key.
- **Dependency:** fflate 0.8.3 for the zips.
- **Tests:**
  - `packages/domain/test/export-format.test.ts`: references, the schemas and CSV parsing;
  - `apps/api/test/exchange/exchange.int.test.ts`: the "Done when" items, entries without keys, image files, CSV, blocked imports, the preview's roles;
  - `apps/web/e2e/import-export.spec.ts`: export from the settings page and import into another universe, and a CSV.
- **Later (2026-11-15, the owner's M7 demo):** "Add as new" into a universe made on the home page always conflicted: the home page starts a universe with an empty `main` map, the slug most exports' map has, and the site has no way to delete a map. Now a map of the file's slug that holds no entries (drafts included) is filled as the file's map; one with entries is still a conflict. Tests: `exchange.int.test.ts` imports the demo into a universe with an empty `main`; `import-export.spec.ts` starts its target universe the way the home page does.
- **Later (2026-11-15, found restoring the owner's Eisenhorn universe from the old preview):** an export with citations couldn't be imported. Citations' `retrievedAt` was the only timestamp column read as text (`mode: 'string'`), so the API and exports gave it as Postgres prints it, `2026-11-14 00:07:56.818+00`, which the import's ISO 8601 check refused. The demo has no citations, so the round-trip test never had one. The column is now a Date like every other, the services write it as ISO 8601, and `CitationRead` says so. The import also reads the old form in zips exported before the fix (`exchange/legacy-dates.ts`). The round-trip test now carries a citation, and an old-form date.

### M7-T5 Cloning a map

- `cloneMap()` per data-model §10, using `CLONE_SPEC` (complete since M1-T4, extended in M4-T7 and M7-T3).
- `POST /maps/{id}/clone` with `{ slug, name, sortKey }`.
- UI: "Clone map as…" in the map switcher, plus a **"Same object on other maps"** switcher in the info panel that follows `cloned_from_entity_id` in both directions and navigates to the counterpart.

**Done when:**
- [x] Integration test: cloning the demo map copies every row of every table in `CLONE_SPEC`, with ids remapped, the map id changed, lineage set, assets shared and universe-scoped rows untouched.
- [x] Reverting the clone batch removes it completely.
- [x] E2E: clone, move a system in the clone, and switch between the two maps from the info panel.

**As built:**
- **Two halves:**
  - `cloneMapContent()` in `packages/db/src/clone/clone-map.ts` copies the content. It's generic: a temporary `clone_ids` table, then one `INSERT … SELECT` per `CLONE_SPEC` table, with the columns read from the live schema, so a new column is copied without a change.
  - `cloneMap()` in the API (`services/clone-service.ts`) makes the new map row through the map service, which handles its rich-text name, then calls it. This differs from data-model §10's single function in `packages/db`, because the db package doesn't sanitize rich text.
- **The new map** takes the original's description, galaxy settings, underlay, spoiler flag and status, and goes after it in the switcher unless the request gives `sortKey`. It records `cloned_from_map_id`. The batch is "Clone map “M41” as “M42”".
- **What's copied:** every entity row and aspect row, with:
  - ids remapped, and new ids made in the old ids' order, so the copies sort as their originals;
  - `version` reset to 1;
  - `cloned_from_entity_id` set;
  - keys kept;
  - images sharing their assets;
  - a relation with a character copied, pointing at the copy of its map-side end.
- **Lineage:** `include=counterparts` on any entity read lists the same entry on other maps. A recursive query climbs to the oldest original still there, then takes everything cloned from it at any depth: originals, other copies, and copies of copies. Drafts are hidden from readers.
- **UI:**
  - "Clone map as…" in the map switcher (editors) opens a dialog with the name and an address that follows it, then opens the copy.
  - The panel's **On other maps** section lists the other maps the entry is on. Choosing one opens that map where the entry is shown, selected: an object in its parent's view, a place or event wherever it's located.
- **Tests:**
  - `apps/api/test/clone.int.test.ts` covers the "Done when" items: every spec table had rows to copy (a citation is added first), remapped ids, lineage one for one, shared assets, untouched characters, and a revert back to the same census. It also covers counterparts across two generations, and refusing a taken slug.
  - `apps/web/e2e/clone-map.spec.ts` covers clone, move, and switching from the panel both ways.

### M7-T6 Search and command palette

- Migration: `entities.search_public` and `search_all` (`tsvector`, simple configuration plus `unaccent`), with GIN indexes. The service maintains them on write:
  - `search_all` is built from the name, summary, description, text facts and relation roles;
  - `search_public` is built from the same sources after `redactEntity` with spoilers hidden.
- `GET /universes/{id}/search?q=…&spoilers=include|exclude` returns ranked results with the kind, a location path and a snippet. The snippet comes from the public text when spoilers are excluded.
- **Command palette** (⌘/Ctrl + K): search results plus commands such as "Toggle spoilers", "Go to map…" and "New system". Choosing a result navigates through the views and selects it.

**Done when:**
- [x] Tests show that a spoiler-only word isn't found with `spoilers=exclude` and is found with `include`.
- [x] E2E: ⌘K, type "gud", Enter lands on Gudrun.

**As built:**
- **Indexes (migration 0006, D-37):** `search_public` and `search_all` on `entities`, `to_tsvector('simple', unaccent(…))`, with GIN indexes. The text comes from `searchText()` in `@ge/domain`:
  - the name, summary and description, text facts, and the roles of relations at either end;
  - for the public index, the same after `redactEntity` with spoilers hidden, inline spoilers blacked out, so a hidden entry has no public text at all.
- **Kept by the batches, not by each service:** `withBatch` refreshes every entity the batch touched (its row, its facts, its relations) before it commits (`packages/db/src/search/refresh.ts`). So imports, seeds, clones and reverts keep search current with no code of their own.
  - The columns are derived, not content: the audit trigger doesn't log an update that changes only them, revert compares rows without them, and history doesn't list them. Re-indexing an entity therefore never blocks undoing an older change to its facts.
  - `pnpm db:migrate` fills rows that have no index yet (the rows from before 0006).
- **`GET /universes/{id}/search?q&spoilers&includeDrafts&limit`:**
  - each word of `q`, folded like the index, matches words that start with it ("gud" finds Gudrun);
  - ranking puts names that start with the first word first, then `ts_rank`, then shorter names; with spoilers excluded, a hidden name earns no place;
  - each result carries its kind, map and parent (to go there), a path (the map, then the objects it's inside) and a snippet around the match. With spoilers excluded, names, paths and snippets come from public text.
- **The palette** (`apps/web/src/palette/`), opened by ⌘/Ctrl + K on every page (a global binding in the bindings registry, so the shortcut help lists it) or the top bar's **Search** button:
  - search results, following the reader's spoiler setting, with drafts in edit mode;
  - commands: show or hide spoilers, go to another map, new system and edit mode on a map (editors), universe settings, keyboard shortcuts, all universes.

  It's an ARIA combobox: the arrow keys move through results and commands, and Enter runs one. A result goes to its entry through the views (`showEntity`, shared with "On other maps"): Gudrun, a planet, opens its system's view with Gudrun selected. It's built without a palette library: it's one list and an input.
- **Tests:**
  - `apps/api/test/search.int.test.ts`: the spoiler-only word with `include` and `exclude`; whole hidden entries; public snippets; prefixes, accents and ranking with paths; text facts and relation roles; a fact's batch reverting after a rename, leaving search current; drafts;
  - `apps/web/e2e/search.spec.ts`: the "Done when" path, commands, the Search button and the arrow keys.

### M7-T7 MCP server

**Where:** `apps/mcp/`.

- Built on the official MCP TypeScript SDK, over stdio for local use. A Streamable HTTP transport arrives with tokens in M8-T2.
- Configuration: `GE_API_URL`, and `GE_API_TOKEN` once auth exists.
- **Tools are generated from the registries** (D-18):
  - per entity kind: `<plural>_list`, `<plural>_get`, `<plural>_create`, `<plural>_update`, `<plural>_delete`, `<plural>_upsert_by_key`;
  - per config resource: list, create, update and delete;
  - shared: `batch` (with `dryRun`), `history_list`, `history_revert`, `search`, `view_galaxy`, `view_system`, `view_orbit`, `universes_list`, `maps_list`, `import_dry_run`.

  Input schemas come from the same Zod schemas, and descriptions come from the OpenAPI descriptions. All calls go through `@ge/api-client`.
- Every mutating tool sends `X-GE-Batch-Description: "MCP: <tool> — <summary>"` (percent-encoded, D-27) and returns the batch id, so the owner can revert anything an agent did from the History panel.
- `apps/mcp/README.md` explains how to add the server to Claude Code (`claude mcp add …`) and Claude Desktop, with example prompts.

**Done when:**
- [x] Integration test: an MCP client in the test calls `objects_create` with a temporary-reference batch to create a system and its planets, then calls `history_revert`, and the database returns to its starting state.
- [x] Adding a registry kind automatically yields its tools; a test asserts the tool list against the registry.

**As built:**
- **`apps/mcp`** on the official SDK (`@modelcontextprotocol/sdk` 1.32.2), over stdio: `pnpm mcp`, or `node apps/mcp/src/main.ts` with `GE_API_URL` (and `GE_API_TOKEN` from M8). `apps/mcp/README.md` covers Claude Code (`claude mcp add …`), Claude Desktop and example prompts.
- **62 tools:**
  - `src/tools.ts` generates 61 from the registries: 6 per entity kind, 4 per settings resource, and the 9 shared ones that map to an operation;
  - `import_dry_run` takes a CSV's text or a zip in base64, since its route takes an upload.
- **Inputs and descriptions come from the OpenAPI document** (`@ge/api-client/openapi.json`) rather than from `@ge/domain`'s Zod schemas directly, though the document is generated from those schemas:
  - each tool's input is its operation's path and query parameters plus its body's fields;
  - the components it refers to are copied into `$defs`, so each schema stands alone;
  - a body field named like a parameter (an upsert's `externalKey`) gives way to the parameter.

  The API validates every call with the same Zod schemas. The tools are served by the protocol server under the SDK's `McpServer`, given JSON Schema directly.
- **Writes are labelled batches:** `X-GE-Batch-Description: MCP: <tool> — <name, key or id>` (percent-encoded). `batch` prefixes its own description the same way, since that route takes it from the body. Results are JSON: the item, or a list's page, and for a write `{ batchId, result }`. A problem response becomes a tool error that reads like the API's ("409 …").
- **Tests:**
  - `apps/mcp/test/tools.test.ts`: the tool list against the registries, each tool's operation, standalone schemas, labels;
  - `apps/mcp/test/mcp.int.test.ts`, an MCP client over an in-memory transport against the real API in its own process (port 3105, database `ge_mcp_test`). It builds a system with `batch` and `$op:0` references, adds an object with `objects_create`, checks both labels in `history_list`, reverts both, and the database's rows match the start (read with `pg`). It also covers upserts without duplicates, a version update, `search`, `view_galaxy`, a stale version's 409 as a tool error, and `import_dry_run`.
- **Shared test helper:** starting the API for another package's tests moved from the API client's tests to `@ge/config/test-api`, now used by both.
- **API docs:** entity route summaries say "an object", "an event": agents read them.

### M7-T8 LLM guide

- `docs/api/llm-guide.md`, also linked from `/api/docs`, covers:
  - the concepts (universe, map, object tree, groups, locations, frames and units);
  - the rules an agent must follow: use `externalKey` for idempotency, use `batch` with temporary references for structures, dry-run first, never delete without being asked;
  - worked examples (create a system with planets; place an event on a surface; group objects; fill facts);
  - how to revert.
- An `llms.txt` at the site root points to the guide and the OpenAPI document.

**Done when:**
- [x] A fresh Claude Code session, given only the guide and the MCP server, builds the M7 demo content without help. Record the transcript summary in the commit message.

**As built:**
- **The guide,** `docs/api/llm-guide.md`:
  - concepts: kinds, the object tree and which parents each base type allows, frames and units, rich text, settings, and aspects through `batch` operations;
  - eight rules: find first, external keys and upserts, one batch with `$op` references, dry runs, versions, no deletes unless asked, report the batch ids, read errors;
  - worked examples: a system with planets, moons, an event on a surface, a sub-sector, facts and a subtype;
  - how to undo, and the read tools.

  The API serves it at `/api/llm-guide.md`, the API reference's description points agents to it, and `/llms.txt` at the site root (`apps/web/public/llms.txt`) lists it, the OpenAPI document and the export format.
- **Kept true by tests:**
  - `apps/api/test/llm-guide.test.ts` checks it's served and linked, and that its base-type table matches the registry;
  - `apps/mcp/test/tools.test.ts` checks that every tool its examples call exists.
- **The trial** (2026-11-14): `claude -p` from an empty folder, with no built-in tools (`--tools ""`), only this MCP server (`--strict-mcp-config`, 62 tools), the guide as its only briefing, and a fresh database holding an empty "Warhammer 40,000" universe with an "M41" map. Its task was the demo content, in plain words:
  - three planet facts and a Hive World subtype;
  - the Gudrun System at x 1200, z −400 with a star and four planets, Gudrun a Hive World with its three facts;
  - the Hubris System;
  - a Helican sub-sector holding both;
  - "The siege of Gudrun" (240.M41) on Gudrun's surface;
  - three moons, then undo only the moons.

  It took 21 turns, 20 tool calls, no errors, 69 s and $1.08.
  - **What it did:** it looked things up first, made the settings rows, dry-ran one 14-operation batch (both systems, Gudrun's subtype and facts, the group and its members, the event and its location) and ran it, added the moons as a second batch, reverted that one, then read the orbit view, Gudrun and the group back.
  - **Checked in the database:** all of it as asked, Gudrun's three facts, the event at 20°, 30° on Gudrun, no moons, and the history labelled "MCP: …" with the moons' revert.
- **Found by the trial:** writes to settings were labelled by their universe's id ("MCP: field_definitions_create — <id>"), because the label looked only for an entity's rich-text name. They're now named by a setting's plain name, label or key.

---

## Milestone acceptance

- [ ] All tasks are checked off; CI is green.
- [ ] The demo works end to end.
- [ ] decisions.md and data-model.md are updated with any changes, such as the export format version.
