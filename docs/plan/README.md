# Galaxy Explorer: implementation plan

Galaxy Explorer is a browser app for building and exploring galaxies from any fictional universe. Warhammer 40,000 is the first. The owner builds each galaxy by hand in 3D: places star systems, nebulae and stations; groups them into sectors and territories; describes everything in rich text with images and facts; and pins places and events on planet globes. Visitors explore the result at three levels:

- the **galaxy view**;
- a **system view**;
- an **orbit view** of a single planet or moon, like Google Earth but from orbit.

Spoilers stay hidden until a visitor asks to see them.

The stack is TypeScript throughout, managed with pnpm workspaces and Turborepo:
- **Web:** React, React Three Fiber (three.js) and drei.
- **API:** Fastify.
- **Data:** PostgreSQL 18 with Drizzle ORM.
- **Schemas:** Zod for every shape.

It runs locally first, then on one DigitalOcean droplet.

## Principles

1. **Built by hand, in 3D.** All content is created, moved and edited directly in the three views. Nothing is imported automatically, but there are helpers: fill from wiki, CSV import, and an API for LLMs.
2. **Any universe.** Nothing is Warhammer-specific. Group types, subtypes, facts, event categories, date formats and units are all set per universe.
3. **DRY through registries.** Entity kinds, object types, view levels, relation types and settings resources are each described once. Routes, forms, hooks, MCP tools, import/export and tests are derived from them ([architecture.md §3](architecture.md#3-registries-the-dry-core)).
4. **Performance is a feature.** A similar fan map pegged the owner's Mac GPU and zoomed sluggishly. Here, nothing renders when nothing moves, and every 3D milestone must pass a measured budget ([rendering.md §2](rendering.md#2-performance-budget)).
5. **Spoiler-safe by default.** Anything can be flagged; hidden content is blacked out, not removed; one click reveals it ([ux.md §6](ux.md#6-spoilers)).
6. **Every change can be reverted.** One audit mechanism covers undo, redo, history rollback, and reverting work done by LLM agents ([data-model.md §9](data-model.md#9-history-batches-audit-trigger-revert)).
7. **Built mostly by AI agents, maintained by a human.** The code is conventional, typed, tested and commented, and 3D state can be tested through hooks. The agent rules are in [AGENTS.md](../../AGENTS.md).

## How to use these docs

| Doc | Read it for |
|---|---|
| [decisions.md](decisions.md) | every product answer (T1–X6) and technical decision (D-01 onward), with where each one lands |
| [architecture.md](architecture.md) | packages, registries, the API and its conventions, the rich text and visibility pipelines, configuration, the testing strategy, deployment |
| [data-model.md](data-model.md) | the PostgreSQL schema, jsonb documents, coordinates, spoiler flags, history and revert, cloning, deletion rules |
| [rendering.md](rendering.md) | a three.js primer, the performance budget, how each view is drawn, picking, labels, camera, transitions, test hooks |
| [ux.md](ux.md) | layout, modes, **input bindings**, shortcuts, editing interactions, spoilers, rich text, accessibility, visual direction |
| [milestones/](milestones/) | the work itself: one file per milestone, broken into tasks with acceptance criteria |

**Agents:** read [AGENTS.md](../../AGENTS.md), this README, then the milestone file for your task and the doc sections it lists under "Read first".

**The owner:** this README, decisions.md, then each milestone's goal and demo before starting it.

## Scope

**Proof of concept: M0–M6, running locally with no login.**
- The galaxy view: procedural background, objects as tiny spheres, labels, selection, info panel, spoiler handling.
- Editing in place: create, place, move, describe and delete objects; multi-select; undo, redo and history; image uploads; a reference-image underlay.
- Groups with universe-defined types, nesting, layers and colored outlines; nebulae and warp storms; routes.
- The system view and orbit view, with fly-in transitions; planets with presets or uploaded textures, atmosphere, clouds, rings and night lights.
- Places and events as pins on globes, or in systems and deep space, with categories, dates, images, links and the people involved.
- A generic REST API with OpenAPI docs, usable by LLM agents from M1 on.

**After the proof of concept:**
- **M7, content tools:** custom facts and subtypes, fill from wiki, import and export, map cloning for other eras, search, the MCP server.
- **M8, going public:** owner login with two-factor codes, API tokens, security hardening, droplet deployment, backups, moving local content over.

**Not planned (non-goals):**
- street-level or surface exploration below orbit;
- physically accurate orbits or a simulation clock;
- reader accounts or reading-progress tracking;
- several people editing at the same time;
- editing on touch devices;
- book or "content pack" features.

Each of these can be revisited later, and the registries leave room for them.

## Glossary

| Term | Meaning |
|---|---|
| Universe | a fictional setting (Warhammer 40,000). Owns maps, settings and characters. |
| Map | one galaxy at one point in time (U7). Cloning a map makes another era. |
| Entity | anything the author writes about: an object, group, route, place, event or character. Shares name, summary, description, spoiler flag, status and the aspects. |
| Object | a celestial object, of a **base type** (system, star, planet, moon, asteroid belt, station, nebula, anomaly, black hole, marker) and optionally a universe-defined **subtype** (Hive World). |
| Explorable | an object that opens its own view: systems open a system view; planets and moons open an orbit view. |
| View | one of the three levels: **galaxy view**, **system view**, **orbit view**. The **subject** is the object a view is about. |
| Group / group type / layer | a named set of objects drawn as an outline (Helican Sub-sector); its universe-defined type (Sub-sector, whose parent type is Sector); and the layer the type belongs to (Administrative). |
| Region | a nebula or anomaly (such as a warp storm): an object with a radius, drawn as a cloud. |
| Route | an ordered line through objects (a warp route). |
| Place / event | a lasting pin (a city or fortress) / something that happened, located on a surface, an object, in space or at a place. |
| Aspects | images, links, facts, relations and location, which work the same for every entity kind. |
| Fact | a value of a universe-defined field (Population: 5 billion). |
| Spoiler / redaction | content flagged as a potential spoiler / how it looks when hidden (blacked out). |
| Draft | unpublished content, hidden from the public by the server. |
| Batch | one user action or API request, as recorded in history. Reverting a batch is how undo works. |
| Appearance | how an object looks: color, size per view, planet preset and effects. Stored as sparse overrides on type and subtype defaults. |
| Bake | rendering a procedural texture once, to reuse every frame. |
| Underlay | a reference image shown under the galaxy in edit mode for tracing positions. |

## Milestones

| | Milestone | Goal | Depends on |
|---|---|---|---|
| [M0](milestones/M0-foundation.md) | Foundation | repository, monorepo, Docker Postgres, API and web skeletons, on-demand canvas, CI | — |
| [M1](milestones/M1-data-core.md) | Data core and API | the full schema, registries, generated CRUD API, batches and revert, rich text and spoiler foundations, seeds | M0 |
| [M2](milestones/M2-galaxy-view.md) | Galaxy view | background, bodies, camera and bindings, picking, labels, info panel, spoilers, **first performance gate** | M1 |
| [M3](milestones/M3-galaxy-editing.md) | Galaxy editing | edit mode, create, move, forms, rich text editor, multi-select, undo/redo, uploads, underlay, outliner | M2 |
| [M4](milestones/M4-groups-regions.md) | Groups, regions and routes | settings page, groups from selection, outlines, layers, nebulae and warp storms, routes, a look per kind of body, shortcut help | M3 |
| [M5](milestones/M5-system-view.md) | System view | navigation and transitions, zoom thresholds, system rendering, editing in systems, leak test | M3 |
| [M6](milestones/M6-orbit-view-events.md) | Orbit view and events | geo math, planet baking, globes, pins, places, events, characters, events list; **proof of concept complete** | M5 (M4 recommended) |
| [M7](milestones/M7-content-tools.md) | Content tools and LLM access | facts, subtypes, fill from wiki, import/export, map cloning, search, MCP server, LLM guide | M6 (T7–T8: M1 only) |
| [M8](milestones/M8-go-public.md) | Going public | login with two-factor codes, tokens, hardening, containers, droplet, deploy, backups, content migration, guided tours | M6, M7-T4 |

```
M0 ──▶ M1 ──▶ M2 ──▶ M3 ──┬──▶ M4 ───────────────┐
         │                └──▶ M5 ──▶ M6 ──▶ M7 ─┴──▶ M8
         └──────────────────────────▶ M7-T7, M7-T8 (MCP server and LLM guide: any time after M1)
```

## Working with coding agents

- **One task per session, committed straight to `main`** ([D-22](decisions.md)). Each task's commit message starts with its ID, so `git log --oneline` reads as the task list. A good prompt: *"Implement M2-T4 from docs/plan/milestones/M2-galaxy-view.md. Follow AGENTS.md. Stop and ask if anything in the plan is ambiguous or wrong."*
- **Order:** tasks run in order within a milestone unless a task says otherwise. M4 and M5 can run in parallel. M7-T7 and M7-T8 can start any time after M1.
- **Review checklist for the owner:**
  - the task's "Done when" boxes are honestly checked;
  - new tests exist and pass (in CI once M0-T7 lands);
  - there's no per-kind copy-paste (registries are used);
  - rendering commits report their HUD numbers;
  - docs and decisions are updated when something changed.
- **When reality disagrees with the plan,** the agent updates the plan in the same commit and says so. The plan is a living document, not a contract.

## Open items

| Item | Needed by | Owner |
|---|---|---|
| 3–6 reference screenshots in `docs/design/references/` (Sins of a Solar Empire, Mass Effect galaxy map, anything else) | M2-T3 | owner |
| Adjusting the input bindings after trying them | end of M2 | owner + agent |
| Icon set for categories and pins (Lucide or game-icons.net) | M6-T4 | owner |
| License for the code, and a fan-site disclaimer text | before M8 | owner |
| Domain name, DigitalOcean account and Spaces bucket | M8 | owner |

## Status

- **2026-11-01:** plan written from the planning Q&A ([decisions.md](decisions.md)).
- **2026-11-01:** M0-T1 done: the private repository [vault21inc/galaxy-explorer](https://github.com/vault21inc/galaxy-explorer) holds the plan.
- **2026-11-01:** M0-T2 done: the pnpm and Turborepo workspace, shared configs, stub packages, and layering enforced by lint.
- **2026-11-07:** M0-T3 done: dev and test Postgres 18 in Docker on ports 5442 and 5443.
- **2026-11-07:** M0-T4 done: the Fastify API on port 3100 with config validation, problem+json errors, OpenAPI docs at `/api/docs` and `/api/health`.
- **2026-11-07:** work moves straight to `main` (D-22).
- **2026-11-07:** M0-T5 done: Drizzle, `pnpm db:migrate` and `db:reset`, and `withTestDb`, which gives each integration test its own migrated database.
- **2026-11-07:** M0-T6 done: the web app on port 5173 with an on-demand canvas, a 5,000-star placeholder sky, the `?perf=1` HUD and `window.__GE_TEST__`. Idle renders 0 frames.
- **2026-11-07:** M0-T7 done: Playwright e2e tests (Chromium and WebKit; idle = 0 frames, axe clean) and GitHub Actions CI on every push to `main`, plus Dependabot.
- **2026-11-07:** M0-T8 done: `AGENTS.md` commands checked and a commit message checklist added, the reference machine and first baseline in [docs/perf/README.md](../perf/README.md), and the README's getting-started section rewritten.
- **2026-11-07:** **M0 complete.**
- **2026-11-07:** M1-T1 done: ids, colors, units, `RichText`, plain-text extraction, Markdown and HTML inline spoilers, `RICH_TEXT_POLICY` and spoiler redaction in `@ge/domain`.
- **2026-11-07:** M1-T2 done: the registries (view levels, object types, entity kinds, relation types, config resources), the jsonb document schemas, `schemasFor` and `resolveAppearance`.
- **2026-11-07:** M1-T3 done: the full schema except routes, citations and auth, in one migration with deferrable foreign keys, plus constraint and registry-consistency tests.
- **2026-11-07:** M1-T4 done: the audit trigger on every content table, `withBatch`, `revertBatch` (undo, and redo as the revert of a revert, with conflict detection), `AUDITED_TABLES` and `CLONE_SPEC`.
- **2026-11-07:** M1-T5 done: the generic entity service, aspect services, registry-driven rules, HTML sanitizing (XSS corpus), draft visibility and typed errors.
- **2026-11-08:** M1-T6 done: REST routes generated from the registries (83 operations in Swagger), hand-written universe, map, aspect and member routes, and the generic contract suite for every kind and config resource.
- **2026-11-08:** M1-T7 done: `POST /api/v1/batch` runs up to 1,000 operations as one change, with `$op:N` references, errors naming the failing operation, and dry runs that report their impact.
- **2026-11-08:** M1-T8 done: history list, per-entity batch summaries, and revert/redo over HTTP with a 409 that lists every conflicting entity.
- **2026-11-08:** M1-T9 done: galaxy, system and orbit view payloads with resolved appearance, pins, draft filtering and `spoilers=exclude`; 5,000 objects build in 51 ms and gzip to 389 kB.
- **2026-11-08:** M1-T10 done: the typed API client generated from the OpenAPI document (`pnpm api:generate`), with `createApiClient`/`unwrap`/`ApiError`, and a CI check that fails when it's stale.
- **2026-11-08:** M1-T11 done: `pnpm db:seed demo` and `pnpm db:seed stress`, both idempotent; `db:reset` seeds the demo.
- **2026-11-08:** **M1 complete.**
- **2026-11-08:** M2-T1 done: routes with loading, error and empty states, universe and map switchers, the quality setting, and query hooks generated from the registries.
- **2026-11-08:** M2-T2 done: the galaxy background (a baked disc, 20,000 depth stars from a Web Worker, core glows, an infinitely distant sky) in 4 draw calls.
- **2026-11-08:** M2-T3 done: every body in one instanced draw that keeps objects 8–40 px tall, regions in one more, the renderer registry, and spoiler objects in the redaction color.
- **2026-11-08:** M2-T4 done: the input bindings table (macOS and Windows), per-press camera actions, wheel and pinch normalization, camera keys, and clipping planes that follow the camera.
- **2026-11-08:** M2-T5 done: screen-space picking (0.16 µs per pick among 5,000), hover and selection rings, `?select=` links, double-click and F to fly to objects.
- **2026-11-08:** M2-T6 done: the label layer (hover, groups and all; L and Space), with no overlaps and 0.7 ms per update at 200 labels.
- **2026-11-08:** M2-T7 done: the info panel, one rich-text renderer for all three formats (D-26), and spoilers hidden by default, revealed per item or with the toggle.
- **2026-11-08:** M2-T8 done: `pnpm perf`; every galaxy-view budget met in Chrome, WebKit and the owner's Safari ([report](../perf/2026-11-08-M2.md)).
- **2026-11-08:** **M2 complete.**
- **2026-11-08:** M3-T1 done: edit mode (✎ and E), box selection, the edit toolbar, drafts and marked spoilers in edit mode, and `authMode` in `/api/health`.
- **2026-11-08:** M3-T2 done: the Add menu (and N), a placement ghost on the galaxy plane, optimistic creation with rollback, a name field for renaming, and toasts.
- **2026-11-08:** M3-T3 done: dragging the selection across the plane (Shift snaps to the grid), a height gizmo, typed positions, and one batch per move.
- **2026-11-08:** M3-T4 done: edit forms generated from the registry (D-27), a rich-text editor with CodeMirror, Preview and Mark as spoiler, save on blur, and the "Changed elsewhere" dialog.
- **2026-11-08:** M3-T5 done: ⌘/Ctrl + A, delete with a dry-run impact dialog, ⌘/Ctrl + D duplicates as one batch, and the right-click menu (Rename, Duplicate, Delete).
- **2026-11-08:** M3-T6 done: undo and redo (⌘/Ctrl + Z, ⌘/Ctrl + Shift + Z) over this session's batches, and the History panel with Revert on any batch.
- **2026-11-08:** M3-T7 done: image uploads (WebP variants, metadata stripped, deduplicated), the image library and picker, and the Images section with captions, credits, cover and spoiler blur.
- **2026-11-09:** M3-T8 done: Map settings with seven galaxy presets, sliders previewed live (one reused 512² bake), a central bar in the sampler and the disc, and a reference underlay in edit mode.
- **2026-11-09:** M3-T9 done: the outliner, an ARIA tree of the view's objects that mirrors the canvas selection, with a filter; always on the left in edit mode, behind List in view mode. All M3 tasks are done; the milestone acceptance (an edit-mode perf run, the owner's real map) remains.
- **2026-11-10:** M3 edit-mode performance check passed: `pnpm perf --edit` ([report](../perf/2026-11-10-M3-edit.md)). What remains of M3 is the owner's real-map trial.
- **2026-11-10:** D-28: each kind of body gets its own look in the galaxy view (systems as stars with their planets, black holes as lensed discs, stations and markers as icons), planned as M4-T8.
- **2026-11-10:** D-29: multi-star systems (binaries, triples) and S-type orbits through a new `orbitCenterId`; planned in M4-T8 (galaxy look) and M5 (data, editing, lighting).
- **2026-11-10:** M4-T8 done: systems are drawn as stars with their planets (binaries and triples in each star's color), black holes as lensed discs, and stations and markers as icons, each in one instanced draw. Galaxy draw calls go from 6 to 8 on the stress map.
- **2026-11-10:** M4-T1 done: the universe settings page at `/u/:universeSlug/settings`, with the universe details and a table for each config resource (group types, event categories, object subtypes, field definitions), generated from the registry, edited in place and ordered by drag.
- **2026-11-10:** M4-T2 done: grouping the selection (⌘/Ctrl + G) in a dialog, with the move question for objects already in a group of that type; Add to group and Remove from group; a group's members panel with each membership's spoiler flag; and deleting a group with its impact.
- **2026-11-10:** M4-T3 done: group outlines (hull, rounded offset, Chaikin smoothing) nest around their sub-groups, with fills and centred labels in each group's color, in 3 draw calls for any number of groups.
- **2026-11-10:** M4-T4 done: group labels and outliner rows select groups; a group's panel shows its members, parent and child groups, and its members get rings; the outliner is a tree of layers, group types and groups.
- **2026-11-10:** D-30: help. The `?` shortcut panel, generated from the bindings registry, is planned as M4-T9; guided reader and editor tours, the editor's in a practice universe, as M8-T10.
- **2026-11-10:** M4-T5 done: the Layers popover shows or hides each layer and group type, remembered per browser, with a legend of the groups shown; outlines and their labels follow it.
- **2026-11-10:** M4-T6 done: regions take four shapes (round and flat clouds, storms seen from above with a baked or uploaded picture, and rifts along a curve), edited with a radius handle and rift point handles on the map; all regions draw in three calls.
- **2026-11-10:** M4-T7 done: routes, the first kind added after M1 (a registry entry and a migration): the Route tool, Create route from a selection, a waypoints panel with drag reordering, and lines that follow a dragged waypoint, in two draw calls for any number of routes.
- **2026-11-10:** labels get a dark outline so they read over bright parts of the galaxy, and the quality popover gains Galaxy stars sliders (number and brightness), remembered per browser.
- **2026-11-10:** M4-T9 done: `?` or the Help button opens the keyboard shortcuts, generated from the binding tables for this platform and mode. All M4 tasks are done; the milestone's acceptance checks remain.
- **2026-11-10:** M4 performance reports committed (view and edit mode, every budget met). The last M4 acceptance item is the owner's: recreating a real sector structure by tracing the underlay.
- **2026-11-10:** M5-T1 done: the navigation stack with saved camera poses, view URLs that rebuild it (Back and Forward enter and leave), breadcrumbs, Esc going up a view, the levels registry with the system view and an orbit placeholder, and the fly, fade, swap and ease between views (one quick fade with reduced motion).
- **2026-11-10:** M5-T2 done: zooming in on an explorable system stops at its enter distance, and pushing on fills a progress ring and enters it; zooming out of a system pushes back out; other objects stop zooming and open their info; double-click and Enter enter at once; a momentum guard keeps trackpad inertia from crossing two views.
- **2026-11-10:** M5-T3 done: the system view draws stars in their temperature's color, with granulation and a glow, lighting the system (up to three stars); lit planets with rings; orbit rings; belts of seeded rocks; icons; and a faint galaxy band, in 7 to 9 draw calls. The owner's screenshot review remains.
