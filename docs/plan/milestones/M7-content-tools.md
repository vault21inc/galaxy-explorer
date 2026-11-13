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
  - **create:** what matches is used as it is; a map slug or entry key already used is a conflict.
  - **merge:** matches are updated; entries are upserted by key, and those without a key are left out. For an entry it updates, each aspect the file lists replaces the entry's, and an aspect left out stays.
  - **One batch,** through the entity, aspect, config and container services, so every rule applies. Each record runs in a savepoint: one the services refuse becomes a conflict in the report, and the import goes on to find the rest.
  - **The report:** creates, updates, kept and left out per kind of record; conflicts and references to nothing (either blocks the import: a blocked real import writes nothing and answers 409 with the report); entries left out; notes. A dry run does everything and rolls back.
  - **CSV:** an empty cell leaves a field as it is. `group_key` puts the object in that group, moving it out of another group of the same type.
- **Settings page:** an "Import and export" section. It has export links (the universe, or a chosen map) and an import form: file, "Add as new" or "Update by key", the map for a CSV, then **Check** (the dry run's report) and **Import**, enabled once a check passes.
- **Speed:** `pnpm perf` now times a 5,000-row CSV import (`scripts/perf/import.spec.ts`) against the 30 s budget, as D-33 keeps speed checks there. On the owner's Mac, beside the stress map: 14.7 s as new objects, 23.2 s as an update by key; a dry run costs about what the import does. An update reads each entry before and after writing it (the services' upsert), which is where its extra time goes; that is the place to look if bigger imports get slow.
- **Dependency:** fflate 0.8.3 for the zips.
- **Tests:**
  - `packages/domain/test/export-format.test.ts`: references, the schemas and CSV parsing;
  - `apps/api/test/exchange/exchange.int.test.ts`: the "Done when" items, entries without keys, image files, CSV, blocked imports, the preview's roles;
  - `apps/web/e2e/import-export.spec.ts`: export from the settings page and import into another universe, and a CSV.

### M7-T5 Cloning a map

- `cloneMap()` per data-model §10, using `CLONE_SPEC` (complete since M1-T4, extended in M4-T7 and M7-T3).
- `POST /maps/{id}/clone` with `{ slug, name, sortKey }`.
- UI: "Clone map as…" in the map switcher, plus a **"Same object on other maps"** switcher in the info panel that follows `cloned_from_entity_id` in both directions and navigates to the counterpart.

**Done when:**
- [ ] Integration test: cloning the demo map copies every row of every table in `CLONE_SPEC`, with ids remapped, the map id changed, lineage set, assets shared and universe-scoped rows untouched.
- [ ] Reverting the clone batch removes it completely.
- [ ] E2E: clone, move a system in the clone, and switch between the two maps from the info panel.

### M7-T6 Search and command palette

- Migration: `entities.search_public` and `search_all` (`tsvector`, simple configuration plus `unaccent`), with GIN indexes. The service maintains them on write:
  - `search_all` is built from the name, summary, description, text facts and relation roles;
  - `search_public` is built from the same sources after `redactEntity` with spoilers hidden.
- `GET /universes/{id}/search?q=…&spoilers=include|exclude` returns ranked results with the kind, a location path and a snippet. The snippet comes from the public text when spoilers are excluded.
- **Command palette** (⌘/Ctrl + K): search results plus commands such as "Toggle spoilers", "Go to map…" and "New system". Choosing a result navigates through the views and selects it.

**Done when:**
- [ ] Tests show that a spoiler-only word isn't found with `spoilers=exclude` and is found with `include`.
- [ ] E2E: ⌘K, type "gud", Enter lands on Gudrun.

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
- [ ] Integration test: an MCP client in the test calls `objects_create` with a temporary-reference batch to create a system and its planets, then calls `history_revert`, and the database returns to its starting state.
- [ ] Adding a registry kind automatically yields its tools; a test asserts the tool list against the registry.

### M7-T8 LLM guide

- `docs/api/llm-guide.md`, also linked from `/api/docs`, covers:
  - the concepts (universe, map, object tree, groups, locations, frames and units);
  - the rules an agent must follow: use `externalKey` for idempotency, use `batch` with temporary references for structures, dry-run first, never delete without being asked;
  - worked examples (create a system with planets; place an event on a surface; group objects; fill facts);
  - how to revert.
- An `llms.txt` at the site root points to the guide and the OpenAPI document.

**Done when:**
- [ ] A fresh Claude Code session, given only the guide and the MCP server, builds the M7 demo content without help. Record the transcript summary in the commit message.

---

## Milestone acceptance

- [ ] All tasks are checked off; CI is green.
- [ ] The demo works end to end.
- [ ] decisions.md and data-model.md are updated with any changes, such as the export format version.
