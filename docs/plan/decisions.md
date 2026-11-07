# Decisions

This file lists every product and technical decision behind the plan and where each one lands in the build.

- **T1–X6** are the question IDs from the planning conversation (31 Oct – 1 Nov 2026). "Lean" means the owner accepted the recommended answer.
- **D-01 onward** are technical decisions made while writing the plan. They follow from the answers but weren't asked directly. Change them freely.

To change a decision, edit its entry, keep the old text on a `Superseded:` line, and update the docs it points to.

## Feedback that shaped the plan

**Performance is a release gate.** The owner tried Cartographia Imperialis, a fan-made 3D map of the 40k galaxy that is close to this concept. On their Mac it pegged the GPU, and scrolling and zooming were slow with a low frame rate. So every rendering task has measurable budgets ([rendering.md §2](rendering.md#2-performance-budget)), and every milestone that touches 3D ends with a performance check.

## Product decisions

### Conflicts settled first

- **T1 Spoilers.** Reader progress is not tracked. The author flags any detail or event as a potential spoiler. Flagged content is hidden by default and shown by clicking "Show potential spoilers". See D-06, [data-model.md §7](data-model.md#7-spoiler-flags), [ux.md §6](ux.md#6-spoilers).
- **T2 View levels.** There are three levels:
  - Galaxy view shows everything in the galaxy.
  - System view shows all objects in one system.
  - Orbit view shows one body with its moons and orbiting objects.

  Objects form a containment tree: map › system › body › moon or station. See [rendering.md §5–8](rendering.md#5-coordinate-frames-and-cameras).
- **T3 Navigation.** Use widely used 3D navigation conventions across operating systems, mice and trackpads. See D-12, [ux.md §3](ux.md#3-input-bindings).
- **T4 Placing objects.** Lean, with one refinement:
  - Objects slide on the galactic plane.
  - Height is set with the vertical arrow of the move gizmo, the standard handle in 3D editors, instead of Shift-drag. Shift stays free for "add to selection", which is universal.
  - Exact coordinates can be typed in the side panel.
- **T5 Group names.** Lean:
  - Each universe defines its own group types, such as Segmentum › Sector › Sub-sector.
  - Groups can nest.
  - An object can belong to one group of each group type. Separate layers, such as administrative and political, can therefore overlap.
- **T6 Who edits.** Lean: only the owner. Login with a password and two-factor codes comes before going public; roles come later. The local proof of concept has no login. See D-15.

### Universe and data model

- **U1 Universes.** Lean: several universes per installation, with all data scoped to a universe.
- **U2 Object types.** Lean: a fixed set of base types decides how objects are drawn. Each universe adds its own subtypes (Hive World, Webway Gate) and custom fields.
- **U3 Size and depth.** Each object has an adjustable size for each view: galaxy, system and orbit. The earlier "category" idea becomes one **Explorable** switch, offered only on objects whose type has a deeper view:
  - systems open a system view;
  - planets and moons open an orbit view.

  Objects mentioned only in passing leave the switch off and stay as dots.
- **U4 Text and media.** Every text field, including names, supports plain text, Markdown and HTML. Images can be uploaded. A "Fill from wiki" option copies a wiki page's info box and lead section. See D-07, [M7](milestones/M7-content-tools.md).
- **U5 Characters, factions, species, gods.** Lean: not in the proof of concept, except a minimal **character** kind, because events need "people involved" (E1). Factions, species and gods are later entity kinds; the schema already supports them.
- **U6 Areas and lines.**
  - Territories are groups with a colored outline. The owner selects objects by box-drag or Cmd/Ctrl-click, groups them, picks an outline color, and gives the group full details like any other entry.
  - Nebulae and warp storms are region objects with a size.
  - Routes between objects (warp routes, lanes, journeys) are lines.
- **U7 Time.** The data has no time dimension. Instead the owner can clone a whole map and relabel it, for example "M41, before the Rift" → "M42, after the Rift". Each copied object remembers the object it was cloned from. See D-17.

### Events

- **E1 Event fields.** All of: title, description, date, images, links, people involved, and a category with an icon.
- **E2 Dates.** Each event has a free-text date plus an optional number for sorting. The universe's details describe how its dates are written.
- **E3 Where events happen.** Lean: an event can be at a spot on a surface, on a body without a spot, inside a system, in deep space, or at a place.
- **E4 Places.** Lean: lasting places, such as cities and fortresses, are pins too. Events can happen at a place.

### Galaxy view

- **G1 Background.** Lean: a procedurally generated spiral per map. In edit mode, a reference image can be shown underneath for tracing positions.
- **G2 Rotation.** Lean: the camera rotates around the selection or the point being zoomed toward. The galactic plane stays level, with no roll.
- **G3 Clicks and zoom.** Lean: a click selects an object and shows its info. A double-click flies to it and enters it if it's explorable. Zoom moves toward the cursor.
- **G4 Look.**
  - Objects are tiny spheres.
  - Labels appear on hover or with keyboard keys.
  - Groups are drawn as colored outlines with labels.
  - Visual references: Sins of a Solar Empire (strategic zoom, readability at any distance) and the Mass Effect galaxy map (cluster › system › planet, orbit rings, holographic UI).
- **G5 Scale.** Hundreds to thousands of objects. The design target is 5,000 objects per map, with headroom.

### Moving between views

- **S1 Zoom limits.** Lean:
  - Zooming toward an object that isn't explorable stops at a minimum distance and opens its info.
  - Zooming toward empty space stops at a fixed limit.
  - The distance at which a view switches grows with the object's size.
- **S2 Transitions.** Lean:
  - Entering is a short fly-in followed by a fade.
  - You leave by zooming out, pressing Esc, or using the breadcrumb or the browser's back button.
  - The camera returns to where you were.

### Orbit view

- **O1 Planet looks.** Lean: presets (ice, desert, ocean, lava, gas giant, city-covered, forge…) with adjustable colors, plus an optional uploaded surface image. Atmosphere, clouds, rings and night-side city lights are on/off switches.
- **O2 Stars.** Lean: stars have no orbit view.
- **O3 Other bodies.** Lean: only globes in the proof of concept. A renderer registry leaves room for stations, ships, asteroid fields and uploaded 3D models later.
- **O4 Moons.** Lean: moons are visible and clickable, and can have their own orbit view.
- **O5 Pins.** Lean: pins first; drawn areas later.

### Editing

- **A1 One app.** Lean: one app with an edit mode. The editing tools appear only for the owner.
- **A2 History.** Lean: undo and redo while editing, plus a permanent change history with rollback. See D-05.
- **A3 Drafts.** Lean: edits go live immediately in the proof of concept. The schema already has a draft status.
- **A4 Bulk data and LLM access.**
  - Lean: bulk import and export.
  - New: an API that LLMs can use for create, read, update and delete operations. See D-08 and D-18.
- **A5 Images.** Image uploads with source, credit and license fields.

### Spoiler details

- **P1 What can be hidden.** Everything: maps, objects, groups, routes, places, events, characters, any text field, part of a text, facts, images, links, relations, group memberships and locations.
- **P2 How hidden things look.** Blacked out, not removed. A hidden location is the exception: showing the pin would reveal the location.
- **P3 Default.** First-time visitors see a spoiler-free version, and one click shows everything.

### Process and operations

- **X1 Proof of concept.** Lean, extended to three levels. The proof of concept is milestones M0–M6, listed in [README.md](README.md#milestones).
- **X2 Who maintains the code.** Mostly AI coding agents. The owner is a software developer with 25 years of experience who is new to three.js. The code must therefore be readable, extensible and maintainable, with 3D math and shaders explained in comments. See [AGENTS.md](../../AGENTS.md).
- **X3 Tools.** Docker and Node.js are installed.
- **X4 Repository.** Set up git and a private GitHub repository first (M0-T1).
  - Done 2026-11-01: [vault21inc/galaxy-explorer](https://github.com/vault21inc/galaxy-explorer), private.
  - Commits use the account's GitHub noreply address (`24880568+vault21inc@users.noreply.github.com`), set in the repository's local git config. That keeps real email addresses out of the history if the repository goes public.
- **X5 Hosting.** Lean. Budget is not a concern yet. Local content moves to production through export and import (M8-T8).
- **X6 Stack and plan format.** Confirmed:
  - The TypeScript stack.
  - The quality bar: automated tests, accessible menus, 60 fps on ordinary laptops.
  - The plan format: this folder.

## Technical decisions

- **D-01 Monorepo.** pnpm workspaces plus Turborepo:
  - `packages/domain`: pure TypeScript, Zod schemas and registries.
  - `packages/db`: Drizzle schema, migrations and data primitives.
  - `packages/api-client`: generated.
  - `apps/api`: Fastify.
  - `apps/web`: Vite, React and React Three Fiber.
  - `apps/mcp`: MCP server.

  Layering rules are in [architecture.md §2](architecture.md#2-packages-and-layering).
- **D-02 Database.**
  - PostgreSQL 18, chosen for its built-in `uuidv7()`, which gives time-ordered ids.
  - Drizzle ORM, with migrations from drizzle-kit.
  - snake_case in SQL; camelCase in TypeScript and JSON.
- **D-03 One table for everything the author writes about.** Class-table inheritance: an `entities` table holds what all kinds share (objects, groups, routes, places, events, characters), and each kind has an extension table. Shared "aspects" (images, links, facts, relations, location) work for every kind. A new kind needs only a registry entry and a migration.
- **D-04 Relational first.**
  - Relationships, and anything that is filtered or joined, are columns with foreign keys. Composite keys guarantee that related rows belong to the same map.
  - jsonb is used only for Zod-validated documents about presentation and settings, such as appearance, galaxy settings and styles.
- **D-05 History.**
  - An audit trigger on every content table logs row changes into a **change batch**. Each user action or API request is one batch.
  - Undo, redo, rolling back history and reverting an LLM agent's work are all the same "revert batch" operation.
- **D-06 Spoilers vs. drafts.**
  - Spoilers aren't secrets. The API returns them with their flags, and clients black them out, which makes the toggle instant.
  - Drafts are secrets, so the server filters them out.
  - One shared redaction function serves the page text, the 3D labels and the optional server-side `spoilers=exclude`.
- **D-07 Rich text.**
  - Stored as `{format, source, spoiler}`.
  - HTML is cleaned on the server against one allowlist; Markdown is rendered without raw HTML.
  - A plain-text version is stored for labels, sorting and search.
- **D-08 API contract.** Zod schemas → Fastify routes → OpenAPI 3.1 → a generated TypeScript client. The web app, the MCP server and outside LLM agents all use the same REST API under `/api/v1`.
- **D-09 Rendering stack.**
  - React Three Fiber plus drei on WebGL2.
  - `camera-controls` through drei's `<CameraControls>`.
  - Frames are rendered on demand, never continuously when nothing moves.
  - WebGPU later, once drei supports it fully.
- **D-10 Bake, don't recompute.**
  - The galaxy disc, planet surfaces, clouds and night lights are rendered into textures once and then reused.
  - No noise shaders run every frame.
  - No full-screen post-processing by default.
- **D-11 Picking and labels.**
  - Hover and selection project object centers to the screen and pick within a generous pixel radius, because tiny spheres are hard to hit with ray casts.
  - Labels are a pooled overlay of page elements with decluttering, not one HTML element per object.
- **D-12 Input bindings.**
  - The standard web 3D viewer mapping: left-drag rotates, right-drag pans, the wheel and pinch zoom toward the cursor.
  - Option/Alt-drag and middle-drag also rotate; Cmd/Ctrl-drag also pans.
  - Edit mode takes over only plain left-drag: on empty space it draws a selection box, and on a selected object it moves it.
  - Cmd replaces Ctrl on Macs, where Ctrl-click opens the context menu.
  - All of this lives in one bindings table in code; see [ux.md §3](ux.md#3-input-bindings).
- **D-13 Frontend libraries.**
  - React Router (single-page mode).
  - TanStack Query for server data.
  - zustand for app and 3D state, with transient updates.
  - shadcn/ui (Radix primitives plus Tailwind) for accessible components.
  - react-hook-form with Zod for forms.
  - CodeMirror 6 for editing Markdown and HTML.
- **D-14 Testing.**
  - Vitest for unit tests.
  - Integration tests against a real Postgres.
  - Playwright (Chromium and WebKit), with a `window.__GE_TEST__` hook that exposes 3D state.
  - A local `pnpm perf` script that checks frame-time budgets.
- **D-15 Auth.**
  - Locally: `GE_AUTH_MODE=none`, with the API bound to 127.0.0.1.
  - In production: one owner account with an argon2id-hashed password, TOTP two-factor codes and a session cookie.
  - LLM agents use scoped API tokens.
- **D-16 Media.**
  - Uploaded files live on a local disk volume behind a `BlobStore` interface; S3 or DigitalOcean Spaces can come later.
  - sharp re-encodes every upload, which strips metadata, and generates size variants.
- **D-17 Time through cloned maps (U7).** A map is one galaxy at one point in time. Cloning copies all of its content and records which object each copy came from, so an object can be followed across eras.
- **D-18 LLM access.**
  - An MCP server whose tools are generated from the same registries and call the REST API.
  - Every agent action is a labelled batch that can be reverted.
  - The batch endpoint supports dry runs.
- **D-19 Hosting.** Docker Compose, locally and on one DigitalOcean droplet:
  - Caddy, which provides automatic HTTPS;
  - an API container and a Postgres container;
  - nightly backups to Spaces.
- **D-20 Tool versions** (M0-T2, 2026-11-01).
  - Node 26 (LTS) from `.nvmrc`. pnpm 12, pinned in `packageManager` and run through Corepack.
  - Every tool version is pinned once, exactly, in the `catalog:` section of `pnpm-workspace.yaml`. Packages refer to it as `"catalog:"`.
  - TypeScript 6.0, not 7: typescript-eslint 8 supports only TypeScript below 6.1. Move to TypeScript 7, the native compiler, once typescript-eslint supports it.
  - ESLint 10 with typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked`; Prettier 3; Vitest 5 with Vite 8; Turborepo 2.
  - pnpm's default one-day minimum release age stays on as a supply-chain safeguard. A version published in the last 24 hours can't be pinned yet.
- **D-21 Internal packages export TypeScript source.**
  - domain, db and api-client have no build step; whatever runs them compiles them.
  - The API runs its TypeScript directly with Node's built-in type stripping (M0-T4), so code uses only erasable syntax and relative imports end in `.ts`.
  - Node refuses to strip types from files inside `node_modules`. The production image (M8-T4) must therefore keep the workspace layout, or bundle the API.
  - Turborepo's `transit` task keeps cached results correct across packages ([architecture.md §2](architecture.md#2-packages-and-layering)).
- **D-22 Work goes straight to `main`** (2026-11-07, after M0-T4).
  - The owner is the only reader for now, so task branches and PRs added steps without adding review. M0-T2 to M0-T4 went through PRs #1–#3; everything after is committed directly.
  - Each task is one commit (or a few) whose message starts with the task ID and records what the plan asks to report. `main` must pass `pnpm check` and the integration tests at every commit.
  - CI (M0-T7) runs on every push to `main`. A failing experiment goes on a throwaway branch, not on `main`.
  - Revisit when someone else contributes, or when `main` starts deploying to production (M8-T6): then PRs and branch protection come back.
