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
- [x] An e2e test opens the demo map URL, sees the canvas and the map name, switches maps, and checks that the URL follows and that Back and Forward work.

**Notes (done 2026-11-08):**
- **Routes** (`src/app/router.tsx`), all inside `AppShell`, so the canvas survives navigation:
  - `/` lists universes and has the "New universe" form;
  - `/u/:universeSlug` redirects (with `replace`, so Back skips it) to `settings.defaultMapId` or the first map by `sortKey`;
  - `/u/:universeSlug/:mapSlug` loads the galaxy view payload; M2-T2 and M2-T3 draw it;
  - `…/view/:objectId` redirects to `?select=:objectId`;
  - anything else is "Page not found".
- **Slugs resolve on the client:** the API has no lookup by slug, so `useUniverseRoute` finds the universe in the universe list and the map in its maps. The top bar and the pages share the cache, so it's two requests per universe.
- **"New universe" also creates a first map**, "Main" (slug `main`), and opens it. A universe without a map has nothing to show until M3 adds map editing. The address follows the name (`slugify`) until it's edited, and is checked with the domain's `Slug` schema.
- **Data hooks** (`src/api/`), one per access pattern, never one per kind:
  - `useEntity(kind, id, { include, spoilers })`, `useEntityList(kind, scope, filters)` and `useViewPayload(level, subjectId)`;
  - their paths come from the registries (`requests.ts`); a unit test checks every kind's and level's path, path parameters and query parameters against `openapi.json`, which `@ge/api-client` now exports;
  - result types come from the domain: the new `EntityReadOf<K>`, and `ViewPayload<L>` from the new `viewPayloads` map;
  - keys follow `[kind | 'view', …params]`, with universes and maps as `['universe', …]` and `['map', …]`;
  - the universe and map hooks (`containers.ts`) use the generated client's literal paths.
- **Requests retry only what might work next time:** 5xx and network failures get two more tries (1 s, 2 s); a 4xx shows at once.
- **Top bar:**
  - universe and map switchers (Radix dropdown menus), which stay usable on an unknown map slug, so the reader can recover;
  - "Galaxy" breadcrumbs;
  - the quality popover: Low, Medium and High, from `QUALITY_PRESETS` in `tuning.ts`, remembered per browser. The DPR range applies at once; MSAA applies on the next load, because WebGL fixes it when the context is created. M2-T8 adds stepping down automatically.
- **The `?perf=1` HUD flag** follows switches; `?select=` doesn't, because it belongs to its map.
- **Loading, error (with Retry) and empty states** use one `StatusPanel`, on every route.
- **Not yet spoiler-aware:** the switchers show map names as they are, including the spoiler-flagged "After the Fall". The spoiler policy arrives in M2-T7, which must cover the switchers too.
- **shadcn/ui:** added button, popover, dropdown-menu, input and label. The CLI imported `cn` from an npm package called `cn`, and installed it; that was removed and the imports point at `@/lib/utils`.
- **Bundle:** initial JavaScript is 437 kB gzipped, up from 362 kB, within the 600 kB budget. Most of the increase is Zod, which the browser now loads with the registries, and Radix.
- **Tests:**
  - 7 e2e tests in `e2e/navigation.spec.ts`: switching maps with Back and Forward; the universe redirect; the object-link redirect; unknown universes, maps and pages; a failed request with Retry; creating a universe; the invalid-address check;
  - the e2e database is now seeded with the demo, and the existing e2e and axe tests use its URL;
  - 24 unit tests: the request paths against `openapi.json`, query keys, and `slugify`.

### M2-T2 Galaxy background

**Where:** `apps/web/src/render/galaxy/`, `src/render/bake/`, `src/workers/`.

- `generateGalaxyPoints(settings, count)`: pure and seeded (`mulberry32` or similar). It samples the density from data-model §4's `GalaxySettings` (log-spiral arms + bulge + thin disc) and runs in a Web Worker, transferring `Float32Array`s back.
- `bake()`, the generic render-to-texture helper from rendering.md §9, introduced here. It bakes the disc texture.
- The disc plane, depth-star `Points` (capped point size), 1–3 core glows and sky points, all driven by `map.galaxySettings` with defaults (rendering.md §6).

**Done when:**
- [x] Unit test: the same seed gives the same first 1,000 points (hash compared); a different seed gives different points.
- [x] The background uses at most 5 draw calls. The commit message includes the HUD numbers and a screenshot, compared with the references in `docs/design/references/` if they exist. *4 draw calls; the screenshot is `docs/perf/screenshots/2026-11-08-M2-T2-galaxy.jpg`, linked from the commit. There are no references yet.*

**Notes (done 2026-11-08):**
- **Four draw calls:** the sky, the disc, the core glows (one mesh for both) and the depth stars. The stress map's objects don't change this; M2-T3 adds their own calls.
- **The disc** is a bake of the same density the stars and the stress seed sample (`sampleGalaxyPosition`):
  - an exponential disc, logarithmic spiral arms, dust lanes along each arm's inner edge, a Gaussian bulge, and value-noise mottling, all run once at bake time;
  - its constants now live in `GALAXY_SHAPE` in `@ge/domain`, which the sampler and the shader share;
  - 2,048² with mipmaps and 8× anisotropic filtering, drawn additively without writing depth;
  - the texture stores the square root of linear light, and the draw shader squares it, so the dim outer disc doesn't band in 8 bits per channel.
- **`bake()`** (`render/bake/bake.ts`) renders a generator shader into a render target with mipmaps. `BakeCache` holds up to 48 targets, least recently used first out, and disposes what it evicts. A map's disc survives leaving the map, so returning reuses it.
- **Depth stars:** `generateGalaxyPoints(settings, count)` runs in a Web Worker and transfers its arrays back.
  - Its seed is offset from the map's, so it doesn't replay the stress seed's random sequence.
  - Sizes are in light-years, clamped to 1–3 px on screen; stars smaller than a pixel fade instead of shrinking.
  - The count is the map's `starPoints`, capped by the quality setting (20,000 on Medium).
- **The core glow:** two camera-facing squares in one mesh, with a Gaussian falloff, capped at 480 px on screen to bound fill rate.
- **The sky is now infinitely far away:** the shader turns star directions with the camera but ignores its position, and draws them first without depth testing. The same sky works at every scale, so `PlaceholderSky` is gone and the universe list shows this sky too.
- **`@ge/domain/galaxy`:** a new subpath export with only the density and random functions. The package root also loads the rich-text parsers, and one of their dependencies touches `document`, which workers don't have.
- **Galaxy settings defaults:** `GALAXY_DEFAULTS` now includes a seed (1) and colors (core `#ffd9a0`, arm `#a9c8ff`, dust `#3b2a1e`). data-model §4 named no color defaults.
- **The view plumbing from rendering.md §4, introduced here** because the background needs it:
  - the levels registry (`src/levels/registry.ts`), with the galaxy view lazy-loaded as its own chunk (5.5 kB gzipped);
  - `<ViewHost>` in the canvas;
  - a navigation store that the map page sets.
- **A minimal galaxy camera:**
  - it starts 2.2 radii out, tilted 50° from straight down;
  - distance limits are 20 ly to 3 radii, and polar limits 5°–175°;
  - near and far are fixed (radius ÷ 5,000 and 6 radii).

  M2-T4 adds the dynamic near plane, keyboard, wheel and bindings.
- **Not done:** the underlay (edit mode, M3).
- **Tests:**
  - 8 unit tests: the seeded point hash (pinned), different seeds, finite buffers, LRU eviction and disposal, and the disc's bake key;
  - 4 e2e tests: draw calls and points within budget, idle at 0 frames, the starting camera pose, and switching maps (one cached disc per map, no leaked geometries).

### M2-T3 Bodies and regions

**Where:** `apps/web/src/render/bodies/`, `src/render/regions/`, `src/render/registry.ts`.

- `InstancedBodies` with the shader that clamps on-screen size between a minimum and a maximum (rendering.md §6). Per-instance attributes come from the view payload; buffers are rebuilt only when the payload or spoiler policy changes; states are normal, redacted and draft.
- `RegionCloud` for nebulae and anomalies: one instanced draw for all regions.
- The renderer registry (rendering.md §4) with its `galaxy` entries.

**Done when:**
- [x] The stress map's bodies take **one** draw call, and regions take one more.
- [x] Zoomed out to the maximum, every object is still at least `MIN_BODY_PX` tall. An e2e test checks it with `screenPositionOf` and the projected radius.
- [x] Spoiler objects render in the redaction color while spoilers are hidden.

**Notes (done 2026-11-08):**
- **The renderer registry** (`render/registry.ts`): galaxy → `default: InstancedBodies`, `nebula` and `anomaly: RegionCloud`. `partitionByRenderer` groups a view's objects by renderer, and the galaxy level draws each renderer once with its objects. The draw calls are one per renderer, not per object.
- **`InstancedBodies`:**
  - one icosphere (80 triangles) instanced per object, with `aCenter`, `aRadius`, `aColor` and `aState` per instance;
  - the vertex shader is rendering.md §6's, keeping bodies between `GALAXY_BODY_MIN_PX` (8) and `GALAXY_BODY_MAX_PX` (40) tall;
  - a lit-core-and-rim fake, with no scene lights;
  - drafts are a checkerboard of skipped pixels, so they stay in the one opaque draw call.
- **Spoilers:** a hidden spoiler object is drawn in `REDACTION_COLOR` at the minimum size, so neither its color nor its size gives it away.
  - `state/spoilers.ts` holds the policy, hidden by default. M2-T7 adds the toggle, persistence and per-item reveals.
  - Buffers rebuild only when the payload or the policy changes.
- **`RegionCloud`:** 6–20 billboards per region, by density, scattered by a generator seeded with the region's id, all in one instanced draw.
  - The soft-noise sprite is baked once (256²) through `bake()`.
  - Premultiplied-alpha blending lets one draw call both add light (nebulae) and cover (anomalies, darker tints), per instance.
  - Billboards are clamped to 3–320 px.
- **The scene index** (`render/scene-index.ts`): each renderer publishes what it drew (center, radius, clamp, state, color). The new test hooks read it: `screenPositionOf`, `screenRadiusOf` and `drawnObject` (rendering.md §14). M2-T5's picker will read it too. `body-scale.ts` is the shader's clamp on the CPU.
- **`screen-scale.ts`** moved from `render/galaxy/` to `render/`, since every renderer uses it.
- **The e2e database now has the stress map too:** Playwright's API server seeds demo, then stress.
- **For M2-T4:** zooming toward the cursor with the wheel can carry the target through the disc and below the galactic plane, leaving the camera looking away from the galaxy. Keep the target on the plane, or on the hovered object.
- **Tests:**
  - 15 unit tests: body buffers and spoilers, the size clamp, renderer partitioning, region billboards (counts, bounds, determinism, blending, spoilers);
  - 3 e2e tests: the stress map's 6 draw calls in all, minimum size at maximum zoom-out, and spoiler redaction;
  - `galaxy.spec.ts` now measures the background on the empty "After the Fall" map, and expects the region sprite's texture.

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
- [x] Unit tests cover every row of the bindings table on macOS and Windows. Cmd and Ctrl must swap correctly, and Ctrl-click on a Mac must never be treated as multi-select.
- [x] E2E checks:
  - left-drag changes the azimuth;
  - right-drag and Cmd/Ctrl-drag move the target;
  - the wheel over an off-center object moves the target toward it;
  - arrow keys pan.
- [x] The commit message notes a manual check with a mouse and with a trackpad in Chrome and Safari. *2026-11-08: the owner checked drag, right-drag, Cmd- and Option-drag, wheel, trackpad scroll and pinch, and the camera keys in Chrome and Safari, and reported that all of it feels right. No bindings or speeds changed.*

**Notes (done 2026-11-08):**
- **`input/bindings.ts`** holds ux.md §3 as 23 rows of data, first match wins, plus the camera keys of ux.md §4. `resolveBinding(gesture, keys, mode, target, platform)` is pure.
  - "Primary" is Cmd on macOS and Ctrl elsewhere.
  - On a Mac, Ctrl-click is the context menu in edit mode and nothing in view mode; Ctrl-drag does nothing. It's never multi-select.
  - `detectPlatform()` reads `navigator.userAgentData` or the user agent ("Macintosh" covers Safari and iPads). The test hooks expose it, so e2e tests press the key the app expects.
- **`useInputBindings`** applies the table to camera-controls, which has a fixed action per mouse button and no notion of modifier keys:
  - **Per press:** on each pointer press, just before camera-controls sees it, the press's action is looked up with the keys held at that moment and assigned to that button. This replaces "reassign `mouseButtons` when modifiers change": it can't be stale and needs no key tracking.
  - **Touch:** one finger rotates; two fingers pan and pinch-zoom together.
  - **Wheel:** events become pixels (`deltaMode` lines and pages, 200 px cap) and are re-sent without `ctrlKey`. camera-controls turns ctrl+wheel (a trackpad pinch) into a field-of-view zoom rather than a dolly.
  - **Safari pinch:** `gesturestart`/`gesturechange` become the same wheel events at the pinch point. A pinch is scaled to zoom as fast as scrolling: 200 px per unit of ln(scale), and ctrl+wheel × 2.
  - **Right-click:** the browser's menu is suppressed on the canvas.
- **`useCameraKeys`:** arrows pan by 10 % of the distance, `+`/`−` zoom by 25 %, and H or Home eases back to the view's starting pose.
  - Ignored with Cmd/Ctrl/Alt held, which keeps the browser's page zoom.
  - Ignored in text fields and in widgets with their own arrow keys (menus, trees, dialogs, sliders, radio groups).
- **The camera:**
  - **Clipping:** near and far follow the camera on every camera-controls update. Near is distance ÷ 1,000 (at least 0.01 ly); far is distance + 3 radii.
  - **Target bounds:** the target is kept inside a box 1.2 radii across and ±0.05 radii high (`setBoundary`). This fixes M2-T3's finding that zooming toward the cursor could carry the target under the disc.
  - `ViewCameraConfig` carries the clipping rule and the bounds; `resetViewCamera` uses the stored starting pose.
- **`input/click.ts`** has the 4 px click-versus-drag test for M2-T5's selection.
- **Tests:**
  - 75 unit tests: every table row on both platforms, the Cmd/Ctrl swap, Ctrl-click on a Mac, platform detection, wheel and pinch normalization, click versus drag;
  - 8 e2e tests: rotate, right-drag pan, primary-drag pan, the suppressed menu, wheel toward an object, the keys, keys ignored while typing, and the target staying near the plane.

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
- [x] E2E: clicking an object selects it, Shift-click adds a second, and Esc clears both. The selection survives a reload through the URL.
- [x] Micro-benchmark: picking among 5,000 items takes under 1 ms per pointer move. *0.16 µs per pick; a full rebuild takes 0.82 ms (`apps/web/test/screen-picker.test.ts`, owner's Mac).*

**Notes (done 2026-11-08):**
- **`ScreenPicker`** (`render/picking/screen-picker.ts`):
  - projects every drawn object from the scene index to a screen circle, using its renderer's clamp and at least 10 px;
  - buckets the circles in a 64 px grid, where each circle goes into every cell it overlaps, so a pick checks one cell;
  - among overlapping circles, bodies beat regions (`pickPriority`), then the nearer center wins, then the nearer depth;
  - `pickRect` is ready for M3's box selection.
- **Rebuilt lazily** (`picking.ts`): on a pick, only if the view-projection matrix, the canvas size or the scene index changed since the last build. That meets "only after frames in which the camera or data changed" without rebuilding on frames nobody picks in.
- **Hover:** a vanilla zustand store outside React (`state/hover.ts`). The pointer cursor and the rings subscribe to it directly, and pointer moves are ignored while a button is held. The e2e test checks that hovering renders nothing while the pointer is still.
- **Selection:** a zustand store whose `select(ids, { add, toggle })` is the one way to select (`state/selection.ts`). `useSelectionUrlSync` keeps it in step with `?select=` both ways:
  - it uses `replace`, so Back moves between maps, not clicks;
  - a new map's address has no `select`, so switching maps clears the selection;
  - leaving the map page clears it too.
- **Input:**
  - a press released within 4 px is a click and resolves through the bindings table: select, toggle (Shift, or Cmd/Ctrl), or clear on empty space;
  - each press now also passes its real target (empty, object or selected) to `resolveBinding`;
  - a double-click flies to the object with `fitToSphere`, framing at least 1,500 ly. Entering views is M5.
  - Keys: Esc clears the selection; F frames it (ux.md §4).
- **`SelectionRings`:** hover and selection rings, instanced camera-facing squares in one draw call on top of everything. Each ring is drawn by the fragment shader at the object's clamped on-screen radius + 4 px, and its buffers rewrite only when the hover, the selection or the drawn objects change.
- **Accessibility:** an `aria-live` region announces "Selected Aster, System" (ux.md §10), with hidden spoiler names kept hidden.
- **Test hooks:** `selectedIds`, `hoveredId` and `flyTo` are added; `screenPositionOf` and `cameraPose` already existed.
- **Tests:**
  - 6 unit tests for the picker, including the benchmark;
  - 6 e2e tests: click, Shift-click, Esc and the URL; reload; empty-space click and Cmd/Ctrl toggle; hover cursor, ring and idle; double-click fly-to; F;
  - `galaxy.spec.ts` now expects the rings' geometry.

### M2-T6 Label layer

**Where:** `apps/web/src/render/labels/`.

- `solveLabels(candidates, viewport, measure)`: pure; priority and greedy placement without overlap (rendering.md §11).
- `LabelLayer`: a pool of 200 DOM elements; it updates only transforms per frame and text only when an element is reassigned.
- Modes: hover, groups and all. L cycles them; holding Space shows all. The mode is remembered per browser.
- `labelText(item, spoilerPolicy)` produces redaction bars for hidden names.
- Group labels are supported by the solver now and fed by M4.

**Done when:**
- [x] Unit tests cover priority order, overlap rejection and the 200 cap.
- [x] E2E: hovering shows exactly one label; L cycles the modes; holding Space shows many labels and none of their bounding boxes overlap.
- [x] Updating the label layer takes at most 2 ms per frame with 200 labels on the reference Mac. *0.7 ms median, 1.1 ms p95 with 160–200 labels on the stress map while orbiting and zooming (headed Chromium, owner's Mac).*

**Notes (done 2026-11-08):**
- **`solveLabels(candidates, viewport, metrics, count)`** is pure.
  - **Ranking:** each candidate's rank is one number, highest first: selected, hovered, groups (larger first), then label priority, then on-screen size in half pixels.
  - **Sorting:** ranks and positions are packed into one double, and a typed array is sorted natively. A comparison function took about 1 ms per frame for 5,000 candidates.
  - **Placement:** greedy, 4 px right of the body's drawn radius, vertically centered, wholly inside the view. Overlaps are found through a 64 px grid, and it stops at 200.
- **The label text** comes from the renderers. They publish `label` (from `labelText(item, spoilerPolicy)`) and `labelPriority` with each drawn object. A hidden whole-item spoiler gets a redaction bar; otherwise hidden spoilers show the redacted name.
- **`LabelLayer`:** 200 pooled `<div>`s above the canvas, `aria-hidden`.
  - A label keeps its element across frames, so text and style change only when an element is reassigned. Each frame writes only `transform: translate3d`.
  - Object labels are white at 85 % with a dark text shadow (ux.md §10). The group style (uppercase, 0.08em) is ready for M4.
- **`LabelDriver`** runs in R3F's after-render callback (`addAfterEffect`), when the camera matrices match the frame just drawn. A mode, hover or selection change asks for one frame.
  - **`all` mode:** candidates come from the picker's projection, which now builds its grid only when something picks. That made projecting for labels cheap.
  - **`hover` and `groups` modes:** only the hovered and selected objects are projected.
  - Candidate objects are reused between frames, and text widths are cached per kind.
- **Modes:** `hover` (the default), `groups` (shows nothing extra until M4) and `all`, remembered per browser (`state/labels.ts`).
  - L cycles them, and holding Space shows all. Space is ignored when it would press a focused button, and it's released on window blur.
- **Test hooks:** `visibleLabels`, `labelStats` and `resetLabelStats`.
- **Measuring the budget:** WebKit rounds `performance.now()` to whole milliseconds, so the budget test runs in Chromium only.
  - Headless browsers draw the stress map in software (about 185 ms per frame), and parallel workers share the CPU, so the e2e test only guards against regressions, locally, at 5 ms.
  - The 2 ms budget itself was measured headed, and M2-T8's `pnpm perf` will check it. CI only logs the timing: GitHub's shared runners measured 5 ms median and 13–25 ms p95 on the same code.
- **Tests:**
  - 12 unit tests: placement, priority order, overlap rejection with 2,000 candidates, the 200 cap, the view's edges, `labelText` and the mode cycle;
  - 4 e2e tests: one label on hover; L cycles the modes and they're remembered; Space shows labels with no overlapping boxes and Erebus as a redaction bar; the update-time guard.

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
- [x] Component tests cover each row of ux.md §6 that applies to the panel (text, whole entity, fact, link, relation).
- [x] E2E:
  - a spoiler in the demo seed is hidden by default;
  - clicking the bar reveals only that item;
  - the toggle reveals everything;
  - a reload keeps the toggle state.
- [x] Hostile HTML planted in the seed renders inert, checked with an `alert` spy.

**Notes (done 2026-11-08):**
- **Rich text is rendered from a tree, not from HTML (D-26).** `richTextTree(richText)` in `@ge/domain` turns all three formats into one small tree that holds only what `RICH_TEXT_POLICY` allows.
  - **Markdown** goes through the existing `parseMarkdown` (GFM and `||spoiler||`). Raw HTML is skipped, headings start at h2, and disallowed links and images keep their text.
  - **HTML** goes through htmlparser2. Disallowed tags are unwrapped, and `script`, `style`, `iframe` and the like are dropped with their content. No attribute survives except a checked `href`, `src` or `alt`.
  - **Plain** text splits into paragraphs and line breaks.
  - Inline spoilers are numbered in document order, nested ones belonging to the outer, as in `markdownToPlainText`.

  `RichTextView` turns the tree into React elements and never sets HTML, so react-markdown, DOMPurify and html-react-parser weren't needed; architecture.md §9 is updated.
- **`<Redactable>`** shows a hidden item as a bar about as long as its text, a button with "Potential spoiler: click to reveal". Shown spoiler content carries an eye-slash marker.
- **Spoiler policy** (`state/spoilers.ts`): the domain's `SpoilerPolicy`, with `showAll` remembered per browser (try/catch storage) and `revealed` kept for the session.
  - The top-bar "Spoilers: Hidden / Shown" toggle and Shift + S switch `showAll`.
  - The bodies, regions, labels, announcer and switchers now read the same policy. Revealing an entity in the panel also reveals its body and label; revealing its name reveals the label.
- **The switchers and the home page** show hidden spoiler universe and map names as bars. This closes the gap noted in M2-T1: "After the Fall" is a bar by default. The navigation and galaxy e2e tests start with spoilers shown.
- **The info panel** (`panels/`) is lazy-loaded on the first selection, as its own chunk of 63.7 kB gzipped (it holds the rich-text parsers).
  - **Sections:** the panel-sections registry lists header, summary, description, images (a count until M3), facts, links and relations. A kind gets an aspect's section only if the entity-kinds registry gives it that aspect, and the sections it shows decide `include`.
  - **Layout:** collapsible and closable; a bottom sheet under 768 px.
  - **Several selected objects** show a list.
- **Relations name their other end:** `RelationRead.other` = `{ id, kind, namePlain, isSpoiler, nameSpoiler }`, from the reading entity's side.
  - A relation whose other end the viewer can't see (a draft, for readers) is left out, so drafts no longer leak through relations.
  - `spoilers=exclude` blacks out a hidden other-end name (`redactEntity`).
  - New `useConfigList(resource, universeId)`, derived from the config-resources registry, supplies field definitions and subtypes.
- **Hostile HTML in the seed:** Brennan's description carries an `onerror` image, a script, a `javascript:` link and a spoiler span with `onclick`. The server's sanitizer removes them on write, and the tree renderer would drop them anyway; a unit test feeds it the raw HTML.
- **Tests:**
  - 7 domain unit tests for `richTextTree`, including hostile HTML;
  - 8 component tests: the ux.md §6 rows, rendered to static markup with explicit policies, plus `RichTextView` formats and hostile HTML;
  - 2 more `labelText` cases and the config-list request paths;
  - 1 API integration test (other ends, spoiler names under `exclude`, draft ends left out);
  - 5 e2e tests in `spoilers.spec.ts` and an axe check with the panel open.

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
