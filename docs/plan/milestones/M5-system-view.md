# M5: System view and moving between views

**Goal:** the second view level and the machinery that moves between views:
- zooming into an explorable system flies into its system view, with its star, planets, orbit rings and belts;
- zooming out, Esc, breadcrumbs and Back return to where you were;
- every editing tool from M3 works inside a system without new editor code.

**Depends on:** M3. M4 is not required.
**Read first:** [rendering.md §4–5, §7, §12–13](../rendering.md), [ux.md §9](../ux.md#9-moving-between-views), [architecture.md §3.3](../architecture.md#33-view-levels-registryview-levelsts).
**Demo at the end:**
1. Mark a system as Explorable.
2. Zoom toward it until the progress ring fills and the camera flies in.
3. Add a star, three planets and an asteroid belt; move a planet and watch its orbit ring follow.
4. Press Esc to return to the galaxy at the same camera position.
5. Paste a deep link to the system into a new tab; it opens directly in the system view.

**Out of scope:** orbit views and planet textures (M6). Until M6, planets in the system view are flat-colored spheres.

---

### M5-T1 Navigation framework

**Where:** `apps/web/src/state/navigation.ts`, `src/levels/registry.ts`, `src/render/view-host.tsx`, `src/render/transition/`.

- Navigation store:
  - `stack: [{ level, subjectId, cameraPose }]`;
  - actions `enter(objectId)`, `exit()`, `goTo(objectId | null)`, `restore(pose)`;
  - the level is derived from the subject's base type through `explorableAs` (architecture §3.3).
- URL sync (ux.md §9):
  - opening `/view/{objectId}` directly loads the object's ancestors and builds the stack;
  - Back and Forward map to exit and enter.
- Breadcrumbs are built from the stack plus ancestor names, and redacted when spoilers are hidden.
- `ViewHost` and the levels registry: galaxy (existing), system (this milestone), orbit (a placeholder until M6).
- The transition controller and `TransitionOverlay` (rendering.md §4): fly, fade, swap, ease in. It saves and restores the camera pose and honors `prefers-reduced-motion`.
- The `__GE_TEST__` hooks `level()`, `enter()`, `exit()`.

**Done when:**
- [x] Unit tests cover the state machine: enter, exit, goTo across levels, rebuilding from a deep link, and Back/Forward.
- [x] E2E: a deep link opens the system view with correct breadcrumbs; Back returns to the galaxy view at the saved pose (`cameraPose` within a tolerance).

**As built:**
- **The URL is the source of truth.** `state/navigation-stack.ts` is the pure state machine (`goTo`, `enter`, `exit`, `moveBetween`), and `state/navigation.ts` holds the stack and how the camera should arrive. `state/use-view-sync.ts` resolves each address (`state/view-resolve.ts`) into a chain of views and hands it to the transition controller (`render/transition/transition-controller.ts`), which flies, fades, commits the chain behind the black and fades back once the new view's camera is placed. A link, Back, Forward, a breadcrumb and Esc all take that one path.
- **Navigator actions.** `enter(objectId)`, `exit()` and `goTo(objectId | null)` are in `state/view-navigator.ts`, and change the address. Entering pushes a history entry marked with the view it came from. Leaving goes back through history when the previous entry is that view; otherwise, for a view opened from a link, it pushes the parent view with the view just left selected. The plan's `restore(pose)` became the arrival logic in `use-view-camera.ts`.
- **Where the camera arrives.** It goes to the saved pose; else, leaving a view opened from a link, to a pose looking at the object just left (`focusPose`); else to the view's default pose. Entering, the camera starts 1.8 times farther and eases in; leaving, it starts at 0.45 of the distance and eases out.
- **One page for both addresses.** `/view/{id}` uses the map page itself, so moving between views doesn't remount the page.
- **Resolving an object.** Its level comes from its base type and its `explorable` flag. Objects that open no view (stations, nebulae, systems not marked explorable) open the view they sit in, with themselves selected. An object on another map redirects to that map, and an unknown one shows "No such object on this map". Entering from a view needs only the new view's payload, because the object is already in a cached payload; a cold link first reads the object.
- **Breadcrumbs** (`app/breadcrumbs.tsx`) come from the stack, with names from the top view's ancestors through `labelText`, so hidden spoilers are redacted.
- **The system level** (`levels/system-level.tsx`) draws children with the registry's system entries: spheres and icons until M5-T3. Its camera is `render/system/system-camera.ts`: extent from the farthest child, exit distance at 3 extents, fixed 0.01 / 10,000 su planes. The orbit level is a placeholder (sky only, and a notice). F and double-click take their minimum framing radius from the current view.
- **Test hooks:** `level()` (`subjectId` null for the galaxy view), `enter()`, `exit()` and `transitioning()`.

### M5-T2 Zoom thresholds and entering

**Where:** `apps/web/src/render/camera/thresholds.ts`, `src/render/transition/progress-ring.tsx`.

- The **zoom target** is the object under the cursor, otherwise the selection. While the cursor is over an object, the orbit point moves to it.
- The distance functions `enterDistance`, `stopDistance` and `exitDistance`, plus the accumulated push hysteresis, the progress ring and the 400 ms momentum guard, all as rendering.md §4 describes, with constants in `tuning.ts`.
- A double-click or Enter on an explorable object enters immediately. On a non-explorable object it flies to it and opens its info.

**Done when:**
- [x] E2E:
  - a series of wheel events over an explorable system enters it;
  - over a non-explorable object, zoom stops at the stop distance and the panel opens;
  - zooming out in a system view exits it;
  - a burst of 60 small wheel deltas, imitating trackpad inertia, causes **exactly one** transition.

**As built:**
- **The zoom gate.** `render/camera/zoom-gate.ts` decides every wheel and pinch step (`input/use-input-bindings.ts`). The pure parts are in `render/camera/thresholds.ts`: the distance functions, `Push` (the hysteresis) and `MomentumGuard`.
- **Zooming toward the target.** Instead of moving the orbit point and letting camera-controls zoom, the gate moves the camera along the line to the target with the same step size as camera-controls. The target stays exactly under the pointer and the camera stops exactly at the limit. Turning the camera to face the target, the first approach, slid the target out from under the pointer.
- **The distances** are multiples of the target's drawn radius per view. In the galaxy view, a system enters from 12 radii (1,440 ly for a 120 ly system) and other bodies stop at 6. In the system view, planets enter from 8 radii and other bodies stop at 3. The exit distance is the system camera's farthest distance (3 extents). The push takes 120 px of wheel either way and lapses after 500 ms. The system camera's target may now sit up to half an extent off the plane, since zooming toward an off-center planet puts it at the planet's depth.
- **The momentum guard.** The plan's 400 ms wasn't enough: trackpad inertia lasts about a second. The guard also ignores the rest of any wheel stream that was flowing when the change started, until a 150 ms pause. Every wheel event feeds it, even those the transition overlay catches.
- **Prefetching.** An explorable target's view is resolved (payload cached) as soon as it becomes the target.
- **The progress ring** is a DOM SVG (`render/transition/progress-ring.tsx`) around the target, or around the middle of the screen when leaving.
- **Double-click** enters an object that opens a view. On anything else it selects the object and flies to it. **Enter** does the same for a single selection. `DrawnObject.opensView` marks what can be entered.
- **The system view now shows the info panel** for a selected child, so zooming to a station opens its info there too. The rest of M5-T4's panels are still to come.
- **A fix.** The selection now re-reads `?select=` whenever the path changes. A double-click's selection update could otherwise outlive the move into the system view.

### M5-T3 System view rendering

**Where:** `apps/web/src/levels/system/`, `src/render/stars/`, `src/render/orbits/`, `src/render/belts/`, `src/render/icons/`.

- `useViewPayload('system', id)` feeds the renderers registered under `system` (rendering.md §4, §7):
  - **stars:** color from temperature (a blackbody lookup table), a glow billboard and a point light;
  - **planets:** flat color until M6;
  - **orbit rings:** merged, honoring `showOrbit`;
  - **belts:** instanced;
  - **stations and markers:** instanced icon billboards.
- The **icon atlas** (`render/icons/atlas.ts`): rasterizes Lucide icons into one texture at startup. M6 adds category icons to it.
- Labels, picking, hover and selection reuse the M2 modules with the system-view camera limits.
- The system background: sky points and a dim galaxy band.

**Done when:**
- [x] A system with 1 star, 12 planets, 2 belts and 5 stations stays within 80 draw calls; so does a triple-star system with 12 planets, lit by all three stars (D-29).
- [x] Hover, selection and labels behave as in the galaxy view (shared e2e helpers).
- [x] Screenshots are reviewed by the owner against the references. (Approved on 2026-11-10: "Looks good". No reference images exist in `docs/design/references/`, so the review was by eye.)

**As built:**
- **Renderers.** The registry's `system` entries are `StarBodies` (`render/stars/`), `PlanetBodies` with `PlanetRings` (`render/planets/`), `AsteroidBelts` (`render/belts/`) and the existing `IconSprites`; anything else is a small sphere. `OrbitRings` (`render/orbits/`) and `GalaxyBand` (`render/system/`) belong to the level, like the galaxy view's outlines. Stars and planets share `bodies/use-instanced-spheres.ts`: one instanced sphere per renderer, with the move preview and the scene index.
- **Draw calls.** The e2e test systems use 9 (Sol: sky, band, orbit rings, star spheres, star glows, planets, planet rings, belts, icons) and 7 (Trinity), against a budget of 80. All belts share one draw call, rather than one per belt.
- **Star colors** come from a blackbody table in `@ge/domain` (`appearance/blackbody.ts`) inside `resolveAppearance`, unless the star or its subtype sets a color, so the galaxy glyph and the system view agree. The demo's stars now show their temperatures in the galaxy view too.
- **Stars.** The granulation is baked once (512 × 256, cellular noise computed on the sphere so it has no seam) and darkened toward the limb. The glow is an additive billboard, at least 26 px.
- **Lighting.** The stars' lights are uniforms of the planet and belt shaders (`stars/system-lights.ts`), not three.js `PointLight`s: only those two custom shaders are lit, they keep a minimum on-screen size, and the lighting is schematic (no falloff, no shadows). Up to 3 stars light, largest first, following a dragged star. A system without stars is lit from its center.
- **Planets** are 32 × 16 spheres in their flat color with diffuse light and a faint rim, at least 4 px. Rings are an instanced band sized to the planet as drawn.
- **Orbit rings** are one `LineSegments2`, 1 px, depth-tested, around the center through each body with `showOrbit`. The selected body's ring is in the selection color, and a dragged body's ring follows it. `orbitCenterId` comes in M5-T4.
- **Belts** are 1,200 seeded, faceted, lit rocks each, in a Gaussian band. A belt is picked along its middle circle (as rifts are), with a lower priority than the bodies inside it.
- **The background** is the sky plus a procedural galaxy band at infinity, aimed to cross the starting view diagonally. It isn't the map's baked disc texture: the system payload doesn't carry galaxy settings, and a faint band shows little of the disc's detail.
- **Icons** are still the built-in station and marker shapes. D-28 moved the Lucide-based icon atlas to M6-T4, which chooses the icon set.
- **Default sizes** in the system view are smaller: stars 0.6 su (was 1) and planets 0.25 su (was 0.35), so a planet 1 su out doesn't touch its star.
- **Test hook:** `systemLights()`.
- **The momentum-guard test** now stamps its synthetic wheel events with the times they would have had, every 16 ms. The heavier system view can stall the page while it first compiles, and events stamped at dispatch time then looked like a new scroll. Real trackpad events carry their hardware time.

### M5-T4 Editing inside a system

- Every M3 tool works in the system view **through the same code**:
  - the Add menu, now filtered by `parents` containing `'system'`;
  - placement on the ecliptic plane;
  - move and the gizmo;
  - forms, delete, duplicate, undo and redo;
  - the outliner.

  Any level-specific branching belongs in the level registry, not in the tools.
- New fields: `showOrbit` in the appearance editor; the explorable switch on planets and moons. A planet with it on shows "Orbit view coming in M6" until M6.
- **Multiple stars and S-type orbits (D-29):**
  - A migration adds `celestial_objects.orbit_center_id`: an optional star with the same parent, with a composite foreign key, `on delete set null`. The rule service checks it's a star in the same system and not the object itself, as for parents.
  - The edit form gains an **Orbits** select for a system's non-star children: "the system's center" or one of its stars. It needs a new select source for sibling objects of a base type, added to the form metadata; no per-kind code.
  - Moving a star with the move tool moves every object that orbits it, by the same offset, in the same batch ("Moved Alpha Centauri B and 2 orbiting objects").

**Done when:**
- [x] E2E: inside a system, adding a star, three planets and a belt works; moving a planet moves its orbit ring; undo restores it.
- [x] E2E, a binary: add stars A and B either side of the center, a planet around both and a planet with Orbits set to B. The second planet's ring centers on B; moving B moves that planet and its ring, as one undo step.
- [x] Integration: `orbitCenterId` must name a star with the same parent (422 otherwise), and deleting the star clears it.
- [x] Code review confirms no `if (level === 'system')` inside `src/editor/`.

**As built:**
- **The editor reads its view, not the galaxy.** The levels registry (`levels/registry.ts`) gives each editable view a `LevelEdit`: the Add menu's heading, the parent of new objects, the work-plane limit, the default grid, the duplicate offset, the placement ghost's size clamp, whether groups, routes and Map settings belong there, and what an empty view says. `levels/use-edit-view.ts` gives the tools the view on top of the stack with its payload and objects. `objectsIn` and `withObject` read and extend either payload shape (`objects` or `children`).
- **Shared tools and panels.** Placement and the move tool are mounted together as `EditTools` in both levels. The page's panels (outliner, toolbar, editor actions, History, info panel, Map settings where allowed) are `pages/view-panels.tsx`, used over the galaxy and over a system. `src/editor/` has no level checks.
- **Groups and routes stay in the galaxy view.** In a system the Group, Route and Map buttons are shown disabled with a reason, the context menu leaves them out, and ⌘/Ctrl + G does nothing.
- **Grid sizes** are per view: 10 ly in the galaxy, 0.5 su in a system. The toolbar's Grid field edits the current view's.
- **`orbitCenterId`.** Migration `0004_orbit-center` adds the column, a check against orbiting itself, an index, and a composite foreign key with `on delete set null (orbit_center_id)`, so deleting the star clears only that column. It's in `CLONE_SPEC`'s remap.
- **The rules** (422 on `/orbitCenterId`): the object must orbit a star, in the same system, and not itself. Also, a star that others orbit can't stop being a star.
- **Payloads.** `ViewObject` carries `orbitCenterId` in every view payload.
- **The form.** The object form gains **Orbits**, a select of the sibling stars (the new `siblings` option source, "The system's center" as its empty choice), and **Orbit ring** (`appearance.showOrbit`). Both show only for an object in a system (the new `systemChild` condition), and Orbits not for stars (the new `{ path, notIn }` condition). The explorable switch already showed for planets and moons. Entering an explorable planet opens the orbit placeholder.
- **Orbiting objects move with their star.** A move carries every object orbiting a moved star, in the same preview and the same batch: "Moved B and 1 orbiting object". Orbit rings center on the star, following it during a drag.
- **Test hook:** `orbitRing(id)`.

### M5-T5 Resource lifecycle and performance gate

- Audit disposal across the view code (rendering.md §13).
- A leak test drives 20 galaxy ↔ system round trips through `__GE_TEST__` and asserts that `renderInfo().geometries` and `.textures` return to within ±5 % of their starting values.
- Extend `pnpm perf` with the system-view phases and the transitions.

**Done when:**
- [x] The leak test passes in CI (Chromium) and locally (WebKit).
- [x] The performance report covers the galaxy view, the system view and transitions, all within rendering.md §2.

**As built:**
- **The leak test** (`e2e/leaks.spec.ts`) makes one warm-up round trip on the demo map, then 20 more, and compares `renderInfo()` geometries and textures: 11 / 4 before and after, in Chromium and WebKit. The warm-up exists because the first entry bakes the star granulation into the bake cache, which keeps it for the page by design. Reduced motion keeps each trip short; the views swap the same way.
- **The disposal audit** found nothing to fix. Every view's `new` geometries, materials and lines are disposed on unmount or replacement; JSX-created materials are R3F's to dispose. The leak test and `pnpm perf`'s round trips both stay level.
- **`pnpm perf`** gains `scripts/perf/system-path.ts`. In view mode it makes the stress map's first system busy through the API (explorable, 1 star, 12 planets, one ringed, 2 belts, 5 stations), times 3 entries and exits, orbits and zooms inside the system, and checks GPU memory over 20 round trips. The report adds the system view's frame times and draw calls (budget 80), the transition times (700 ms, judged with data cached; the first entry is shown) and the memory drift (±5 %). System phases don't count toward the galaxy view's draw-call budget.
- **Transitions shortened.** The plan's step lengths (fly 350, fade 150, ease 300 ms) took about 835 ms, over the 700 ms budget. They're now 260, 120 and 220 ms, and entering or leaving takes 627–662 ms with data cached ([report](../../perf/2026-11-11-M5.md)).
- **The test hooks' `enter()` and `exit()`** resolve when the new view has faded in, which is what the transition times measure.

---

## Milestone acceptance

- [ ] All tasks are checked off; CI is green.
- [x] The performance report is committed ([2026-11-11-M5.md](../../perf/2026-11-11-M5.md)).
- [ ] The owner has entered and left systems with mouse and trackpad and finds the push threshold neither twitchy nor sticky. Tuning changes are recorded in `tuning.ts` comments.
