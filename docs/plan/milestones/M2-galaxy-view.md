# M2: Galaxy view

**Goal:** a galaxy view that is smooth, good-looking and light on the GPU. You can navigate it, hover objects to see labels, select them to read their details, and spoilers are handled. Nothing is editable yet. This milestone is where the performance budget is first enforced.

**Depends on:** M1.
**Read first:** [rendering.md §1–6, §10–14](../rendering.md), [ux.md §1–4, §6–7, §9–11](../ux.md).
**Demo at the end:**
1. Open `/u/example-universe/main` (demo seed). Orbit, pan and zoom with mouse and trackpad.
2. Hover objects to see labels, press L to cycle the label modes, and hold Space to see all labels.
3. Click a system and read its description, where a spoiler is blacked out. Click the bar to reveal it, then toggle "Spoilers: Shown".
4. Switch to the stress map (5,000 objects): still 60 fps.
5. Leave the page alone: the GPU goes idle.

**Out of scope:** editing (M3), group outlines (M4), entering systems (M5).

---

### M2-T1 App shell, routing and data hooks

**Where:** `apps/web/src/app/`, `src/api/`, `src/state/`.

- Routes as in ux.md §9:
  - `/` lists universes and has a "New universe" form (allowed while `GE_AUTH_MODE=none`);
  - `/u/:universeSlug` redirects to the default or first map;
  - `/u/:universeSlug/:mapSlug` is the galaxy view;
  - `/u/:universeSlug/:mapSlug/view/:objectId` is wired in M5; for now it redirects to the galaxy view with the object selected.
- Top bar (ux.md §1):
  - universe and map switchers;
  - breadcrumbs ("Galaxy" only for now);
  - the spoiler toggle (M2-T7);
  - quality settings popover.
- Query hooks **generated from the registries**: `useEntity(kind, id)`, `useEntityList(kind, scope, filters)`, `useViewPayload(level, subjectId)`, with the key convention `[kind | 'view', …params]`. No per-kind hook files.
- Loading, error and empty states for every route.

**Done when:**
- [ ] An e2e test opens the demo map URL, sees the canvas and the map name, switches maps, and checks that the URL follows and that Back and Forward work.

### M2-T2 Galaxy background

**Where:** `apps/web/src/render/galaxy/`, `src/render/bake/`, `src/workers/`.

- `generateGalaxyPoints(settings, count)`: pure and seeded (`mulberry32` or similar). It samples the density from data-model §4's `GalaxySettings` (log-spiral arms + bulge + thin disc) and runs in a Web Worker, transferring `Float32Array`s back.
- `bake()`, the generic render-to-texture helper from rendering.md §9, introduced here. It bakes the disc texture.
- The disc plane, depth-star `Points` (capped point size), 1–3 core glows and sky points, all driven by `map.galaxySettings` with defaults (rendering.md §6).

**Done when:**
- [ ] Unit test: the same seed gives the same first 1,000 points (hash compared); a different seed gives different points.
- [ ] The background uses at most 5 draw calls. The PR includes the HUD numbers and a screenshot, compared with the references in `docs/design/references/` if they exist.

### M2-T3 Bodies and regions

**Where:** `apps/web/src/render/bodies/`, `src/render/regions/`, `src/render/registry.ts`.

- `InstancedBodies` with the shader that clamps on-screen size between a minimum and a maximum (rendering.md §6). Per-instance attributes come from the view payload; buffers are rebuilt only when the payload or spoiler policy changes; states are normal, redacted and draft.
- `RegionCloud` for nebulae and anomalies: one instanced draw for all regions.
- The renderer registry (rendering.md §4) with its `galaxy` entries.

**Done when:**
- [ ] The stress map's bodies take **one** draw call, and regions take one more.
- [ ] Zoomed out to the maximum, every object is still at least `MIN_BODY_PX` tall. An e2e test checks it with `screenPositionOf` and the projected radius.
- [ ] Spoiler objects render in the redaction color while spoilers are hidden.

### M2-T4 Camera and input bindings

**Where:** `apps/web/src/input/`, `src/render/camera/`.

- `bindings.ts`: the table from ux.md §3 as data. `resolveBinding(gesture, modifiers, mode, target, platform)` is a pure function.
- `useInputBindings()`: reassigns camera-controls' `mouseButtons` and `touches` when modifiers or modes change, suppresses the context menu on the canvas, and decides click versus drag with a 4 px threshold.
- Camera setup for the galaxy view per rendering.md §5 and §12:
  - limits;
  - the near plane updated dynamically;
  - `dollyToCursor`;
  - wheel normalization (`deltaMode`, ctrl+wheel for pinch);
  - keyboard camera keys (arrows, `+`/`−`, H/Home).

**Done when:**
- [ ] Unit tests cover every row of the bindings table on macOS and Windows. Cmd and Ctrl must swap correctly, and Ctrl-click on a Mac must never be treated as multi-select.
- [ ] E2E checks:
  - left-drag changes the azimuth;
  - right-drag and Cmd/Ctrl-drag move the target;
  - the wheel over an off-center object moves the target toward it;
  - arrow keys pan.
- [ ] The PR notes a manual check with a mouse and with a trackpad in Chrome and Safari.

### M2-T5 Picking, hover and selection

**Where:** `apps/web/src/render/picking/`, `src/state/selection.ts`.

- `ScreenPicker` (rendering.md §10), rebuilt only after frames in which the camera or data changed.
- Hover:
  - the pointer cursor;
  - a hover ring;
  - the hovered id kept in a transient store, never in React state.
- Selection:
  - a click selects;
  - Shift-click or Cmd/Ctrl-click toggles;
  - Esc clears;
  - a click on empty space clears;
  - the selection syncs to `?select=`.
- A double-click flies to the object (`fitToSphere`); entering views comes in M5.
- Fill in the `__GE_TEST__` hooks `selectedIds`, `hoveredId`, `screenPositionOf`, `cameraPose`, `flyTo`.

**Done when:**
- [ ] E2E: clicking an object selects it, Shift-click adds a second, and Esc clears both. The selection survives a reload through the URL.
- [ ] Micro-benchmark: picking among 5,000 items takes under 1 ms per pointer move.

### M2-T6 Label layer

**Where:** `apps/web/src/render/labels/`.

- `solveLabels(candidates, viewport, measure)`: pure; priority and greedy placement without overlap (rendering.md §11).
- `LabelLayer`: a pool of 200 DOM elements; it updates only transforms per frame and text only when an element is reassigned.
- Modes: hover, groups and all. L cycles them; holding Space shows all. The mode is remembered per browser.
- `labelText(item, spoilerPolicy)` produces redaction bars for hidden names.
- Group labels are supported by the solver now and fed by M4.

**Done when:**
- [ ] Unit tests cover priority order, overlap rejection and the 200 cap.
- [ ] E2E: hovering shows exactly one label; L cycles the modes; holding Space shows many labels and none of their bounding boxes overlap.
- [ ] Updating the label layer takes at most 2 ms per frame with 200 labels on the reference Mac.

### M2-T7 Info panel, rich text and spoilers

**Where:** `apps/web/src/panels/`, `src/richtext/`, `src/state/spoilers.ts`.

- The info panel for the selection fetches the full entity with its aspects. Its sections come from the panel-sections registry (architecture §3.5):
  - header (name, type, subtype);
  - summary;
  - description;
  - facts;
  - links;
  - relations;
  - an images placeholder until M3.
- `RichTextView` handles all three formats (architecture §9), including the `remark-spoiler` plugin and the HTML spoiler mapping.
- `<Redactable>`: blacks out hidden content; a click reveals that item for the session.
- The spoiler policy store: default hidden; the top-bar toggle and Shift + S; remembered per browser in `localStorage` (wrap access in try/catch); per-item reveals.

**Done when:**
- [ ] Component tests cover each row of ux.md §6 that applies to the panel (text, whole entity, fact, link, relation).
- [ ] E2E:
  - a spoiler in the demo seed is hidden by default;
  - clicking the bar reveals only that item;
  - the toggle reveals everything;
  - a reload keeps the toggle state.
- [ ] Hostile HTML planted in the seed renders inert, checked with an `alert` spy.

### M2-T8 Performance gate

**Where:** `scripts/perf/`, `docs/perf/`.

- `pnpm perf`:
  1. Seeds the stress map.
  2. Runs Playwright headed on Chrome, then WebKit.
  3. Follows the scripted path from rendering.md §14 (galaxy-only parts for now).
  4. Writes `docs/perf/<date>-M2.md` with median and p95 frame times, draw calls, idle frames and the first-frame time.
- Wire up the quality settings (rendering.md §13): `PerformanceMonitor` stepping down, `AdaptiveDpr`.
- Fix whatever misses the budget.

**Done when:**
- [ ] The galaxy view meets **every** galaxy-view row of rendering.md §2 on the reference Mac in Chrome and Safari, and the report is committed.

---

## Milestone acceptance

- [ ] All tasks are checked off; CI is green.
- [ ] The performance report is committed.
- [ ] The owner has tried the demo with their own mouse and trackpad, and any adjustments to the bindings are recorded under D-12 in decisions.md.
