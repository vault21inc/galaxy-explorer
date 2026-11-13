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
  - Implemented in M2-T4 (`apps/web/src/input/bindings.ts`). The owner's manual check with a mouse and a trackpad in Chrome and Safari (2026-11-08) needed no changes to the bindings or the speeds.
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
  - Web (M0-T6): React 19, three.js 0.187, React Three Fiber 9, drei 10, React Router 8, TanStack Query 5, zustand 5, Tailwind 4 with shadcn/ui. The dev HUD is our own, not r3f-perf, which doesn't support React 19. React code is also linted with eslint-plugin-react-hooks.
  - Drizzle ORM 0.45 and drizzle-kit 0.31 (M0-T5), the stable releases. Drizzle 1.0, which changes the migrations folder layout and adds relational queries v2, is still a release candidate. Move to 1.0 once it's the `latest` release, ideally before M1-T1 writes the first migration, or with `drizzle-kit up` afterwards.
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
- **D-23 Schema details changed during M1** (2026-11-08). data-model.md is updated to match each one.
  - **Foreign keys are written in SQL,** not in the Drizzle schema, because every one must be deferrable and Drizzle can't declare that (M1-T3; packages/db/migrations/README.md).
  - **`maps.underlay_asset_id` is `on delete restrict`:** an asset in use can't be deleted (§11), not `set null` as §3.1 first said.
  - **The location check also requires each mode's unused columns to be null** (y, z, lon), not only some of them.
  - **Revert compares rows ignoring `version` as well as `updated_at`,** because every restore bumps the version (M1-T4).
  - **Deleting an object deletes its whole subtree's entities in the service:** the database cascade only reaches the children's extension rows (M1-T4, M1-T5).
  - **`<b>` and `<i>` are allowed** in rich-text HTML (owner's request, M1-T5; ux.md §8).
- **D-24 Galaxy shapes are editable, from presets** (2026-11-08, owner's request after M2-T2).
  - The owner edits each map's galaxy shape in the browser: M3-T8's Map settings panel gains a Galaxy section with named presets and sliders, previewed live.
  - Presets are data in `@ge/domain` (`galaxy/presets.ts`) that fill in `GalaxySettings`; the map stores only the settings, not which preset they came from.
  - `GalaxySettings` gains `barLengthRadii` (default 0) for barred spirals, the one common shape the M2 formula couldn't make. Ring and irregular galaxies are left for later presets.
  - Extends G1, which planned a procedural spiral per map without saying how its shape is chosen.
- **D-25 Region shapes for storms and rifts** (2026-11-08, owner's request after M2-T3).
  - The Eye of Terror seen from above is a ring-shaped storm: a bright rim, a darker core, radial filaments and a gap (the Cadian Gate). Round clouds of billboards can't show that, and the Great Rift is a band across the galaxy, which no round shape can.
  - Regions gain two shapes: `storm`, a flat disc with a baked or uploaded top-down texture, and `rift`, a band along a curve stored as points in `appearance.region.path`. Details in M4-T6 and data-model §4.
  - An uploaded image can stand in for a storm's texture, through a new image role, `region_texture`.
  - A swirling "vortex" shape was considered and dropped: from above the Eye reads as a ring, not a spiral, and animation stays opt-in.
  - All regions together stay within 3 draw calls.
- **D-26 Rich text renders from a policy-shaped tree** (2026-11-08, M2-T7).
  - `richTextTree()` in `@ge/domain` parses plain, Markdown and HTML into one tree holding only the elements and attributes `RICH_TEXT_POLICY` allows; the web app renders that tree as React elements.
  - This replaces the planned react-markdown, DOMPurify and html-react-parser: no HTML string reaches the page at all, there's one renderer instead of three, inline spoiler numbering matches `markdownToPlainText` by construction, and three dependencies aren't needed.
  - The server still sanitizes on write with sanitize-html (D-07 unchanged); the tree is the browser's second line of defense.
- **D-27 Editor forms are data in the entity-kinds registry** (2026-11-08, M3-T4).
  - Each kind's `form` lists its own fields with a widget name (`entity-forms.ts`); `formGroups` adds the shared ones (name, summary, description, status, spoiler flag) in the order of ux.md §5. Limits and nullability come from the kind's Zod update schema (`fieldSchema`), never from the form.
  - The web app maps widget names to components (`panels/entity-form/widgets.ts`), so a new kind needs no form code and a new widget is one name plus one component.
  - `X-GE-Batch-Description` is percent-encoded UTF-8 (`encodeURIComponent`), because header values are limited to Latin-1 and names and typographic quotes aren't. The API decodes it and falls back to the raw value.
- **D-28 Each kind of body has its own look in the galaxy view** (2026-11-10, owner's request after M3's trial).
  - Until now every body in the galaxy view was the same small shaded sphere, told apart only by color and size. Systems, planets, stations and markers, and black holes now each get a look of their own, so the map reads at a glance.
  - **A system is a star system:** a glowing star at its center with faint orbit rings, one small dot per planet it holds (up to 6). The star's color and size are the system's own appearance color and galaxy-view size, which the edit form already offers.
  - **Planets** at the top level (rogue planets) stay small shaded spheres, smaller than a system and without a glow.
  - **Stations and markers** are small icons: built-in shapes first, replaced by the icon set when M6-T4 chooses it.
  - **Black holes** follow NASA's visualization of a lensed accretion disc: a black shadow, a thin photon ring, a bright disc, its far side bent into an arch over the top and its underside into an arc below, and one side brighter from Doppler beaming. This is a baked approximation at a few viewing angles, not a ray-traced simulation.
  - Each look is one instanced draw call: about three more in the galaxy view, well inside the 50-call budget. Each look is baked into a texture atlas once (rendering.md §9), never generated per frame. Details are in M4-T8 and rendering.md §6.
- **D-29 Systems can have several stars, and a body can orbit one of them** (2026-11-10, owner's question about binaries and Alpha Centauri).
  - A system already holds any number of `star` objects, each placed in the system's frame. A binary is two stars either side of the system's center (their barycenter); a planet circling both (a circumbinary or "P-type" orbit) is a planet in the system, as before.
  - **New: `orbitCenterId`** on celestial objects, an optional star in the same system that the object orbits (an "S-type" orbit: Proxima b around Proxima, a planet around Alpha Centauri A). Positions stay in the system's frame, so the system view keeps one frame. The object's orbit ring centers on that star, and moving the star with the move tool moves its orbiting bodies with it, in the same batch. Null means the system's center.
  - **The system view lights every star:** one point light per star, up to 3 (more are drawn but unlit, which no real system needs).
  - **The galaxy-view look (D-28)** shows up to 3 stars when the system holds them, each in its own color and relative size. A system without star objects uses its own color and size, as D-28 says.
  - **Alpha Centauri**, as the worked example: one system with A and B about 23 AU apart. Proxima, about 13,000 AU away, is its own small system nearby in the galaxy, since a single system view can't show both scales; a triple system in one view also works.
- **D-30 Help: the shortcut panel now, guided tours before going public** (2026-11-10, owner's question about a usage guide or demo mode).
  - Until now the only help was ux.md's promise of a `?` overlay, which no task built, plus the empty-state hints and the demo universe to explore.
  - **Shortcut help (M4-T9):** `?`, or the Help button in the top bar, opens a panel generated from the input-bindings registry (ux.md §3–4). Each action gets a one-line description beside its binding, and an action without one is a type error, so the panel lists exactly the shortcuts and gestures that work, on this platform (⌘ or Ctrl) and in this mode.
  - **Guided tours (M8-T10):** two short tours, built last, once the views and tools they show have settled. Written earlier, they would be rewritten every milestone.
    - **The reader tour** runs on the map being viewed and changes nothing: moving around, selecting and the panel, labels, spoilers, the List, groups and layers, entering a system and a planet, the events list and search.
    - **The editor tour**, for the owner, runs in a **practice universe**: the demo universe's content (the demo seed, run into a new universe), whose maps are drafts so readers never see it. It covers edit mode and the toolbar; adding, moving and editing an object; box-select and grouping; undo and History; the settings page and map settings; regions and routes; and editing inside a system and on a globe. At the end it offers to delete the practice universe.
  - **Tours are data:** a tour registry lists each tour's steps. A step names its target (a control marked `data-tour`, or an object found through the scene index), its text, and what completes it: Next, or doing the thing itself, such as pressing L. A step whose feature or target is missing (no explorable system on this map, or search before M7-T6) is skipped, so a tour never points at nothing.
  - **Offered, never forced:** a dismissible "Take the tour" prompt on a reader's first visit and on the owner's first time in edit mode, remembered per browser. Both tours stay in the Help menu. Steps are non-modal popovers that keyboard and screen-reader users can follow. Highlights are DOM drawn over the canvas, so tours add no draw calls, and nothing renders while a step waits.
  - From M8-T10 on, a task that adds or changes a user-facing feature adds or updates its tour step, as part of AGENTS.md's definition of done.
- **D-31 A private preview before M8** (2026-11-10, owner's question about deploying for feedback).
  - Before logins exist, invited testers can explore the app on one server. The setup is in `docs/ops/preview.md`.
  - **Who can do what:** Caddy asks everyone for a password, either the owner's or a shared tester one. It passes the API an `X-GE-Role: editor` header for the owner only, overwriting whatever the browser sent.
  - **The API's side:** with `GE_PREVIEW_ROLES=on`, it refuses every other request's writes and draft reads, and `/api/health` gains `canEdit`, which now decides whether the web app offers edit mode. The API still listens on 127.0.0.1 only, so the header can't be forged from outside.
  - **What's left for M8:** logins, tokens, hardening, containers, the deploy pipeline and off-site backups. M8 replaces the preview; the `canEdit` field stays, answered by the owner's session.
- **D-32 Icons: both Lucide and game-icons.net** (2026-11-11, the owner's pick in M6-T4).
  - Event categories (and, later, stations, markers and subtypes) choose an icon from two bundled sets: **Lucide** (ISC), the clean UI icons the app's buttons already use, and **game-icons.net** (CC BY 3.0), about 4,100 thematic ones (weapons, ships, skulls, banners) that suit a Warhammer-style universe.
  - **A key names both:** `set:name`, such as `game-icons:crossed-swords` or `lucide:flag`. A key without a set is Lucide's, so the keys written before (`swords`, `flag`) stay valid. The category schema accepts only that pattern.
  - **Served by the API:** the sets come as their Iconify JSON packages (`@iconify-json/lucide`, `@iconify-json/game-icons`, pinned) in the API, which serves search (`GET /icons/search`) and the drawings of chosen keys (`GET /icons?keys=…`). The web app never downloads the 6 MB of the full sets: the picker searches, and the pins fetch only the icons in use, which are rasterized once into the pins' icon atlas.
  - **Credit:** game-icons.net's licence requires attribution. The help dialog credits both sets with links, from `ICON_CREDITS` in `@ge/domain`.
- **D-33 GPU timing is measured on the reference Mac, not in CI** (2026-11-11, M6-T3 to M6-T8, the owner's call on unreliable CI tests).
  - CI has no GPU: Chromium draws with SwiftShader, Chrome's software WebGL, and how fast it draws depends on the runner. Tests there that measured speed failed on slow runners while the app was fine.
  - **CI checks behaviour:** what's drawn, where, and what happens on a click, through `window.__GE_TEST__`. Tests heavy on the GPU get more time there (`test.slow()`). The one that measured speed (ambient motion's frames a second) keeps its upper bound everywhere, but its lower bound applies only with a GPU (`metadata.softwareRendering` in playwright.config.js).
  - **`pnpm perf` checks speed and memory** on the reference Mac, against every row of rendering.md §2. That includes the leak tests (20 galaxy ↔ system and 20 galaxy → system → orbit round trips), which moved out of CI, and since M6-T8 the orbit view's frame times, draw calls and transitions. Each milestone's report is committed in `docs/perf/`.
  - **Not even locally in e2e:** the full local e2e run has four workers in two browsers, so a speed check there measures the machine's load too. M6-T2's "a slider updates the globe within 200 ms" failed that way (257 ms beside other tests, 7 ms alone) and moved to `pnpm perf` on 2026-11-13. The e2e test still checks that the preview happens.
