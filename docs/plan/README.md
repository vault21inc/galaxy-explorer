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
| [M4](milestones/M4-groups-regions.md) | Groups, regions and routes | settings page, groups from selection, outlines, layers, nebulae and warp storms, routes | M3 |
| [M5](milestones/M5-system-view.md) | System view | navigation and transitions, zoom thresholds, system rendering, editing in systems, leak test | M3 |
| [M6](milestones/M6-orbit-view-events.md) | Orbit view and events | geo math, planet baking, globes, pins, places, events, characters, events list; **proof of concept complete** | M5 (M4 recommended) |
| [M7](milestones/M7-content-tools.md) | Content tools and LLM access | facts, subtypes, fill from wiki, import/export, map cloning, search, MCP server, LLM guide | M6 (T7–T8: M1 only) |
| [M8](milestones/M8-go-public.md) | Going public | login with two-factor codes, tokens, hardening, containers, droplet, deploy, backups, content migration | M6, M7-T4 |

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
