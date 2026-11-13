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
- [ ] E2E: creating a "Hive World" gives the city preset by default; changing the subtype's default color recolors every Hive World that hasn't overridden it.

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
- [ ] Unit tests on saved wikitext fixtures (Gudrun and Hubris; the two infobox templates noted in the planning research) extract the expected parameters.
- [ ] An integration test with a mocked HTTP server checks the rate limit, the User-Agent and redirects.
- [ ] E2E with fixtures: filling Gudrun sets population and sub-sector facts and a description, each with a citation, as one revertible batch.

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
- [ ] Round trip: export the demo universe, import it into an empty install, export again. The two exports are identical apart from timestamps.
- [ ] A merge import updates objects by key without duplicating them.
- [ ] A dry run changes nothing.
- [ ] Importing a 5,000-object CSV takes under 30 s.

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
