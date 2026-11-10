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
- [ ] E2E:
  - a series of wheel events over an explorable system enters it;
  - over a non-explorable object, zoom stops at the stop distance and the panel opens;
  - zooming out in a system view exits it;
  - a burst of 60 small wheel deltas, imitating trackpad inertia, causes **exactly one** transition.

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
- [ ] A system with 1 star, 12 planets, 2 belts and 5 stations stays within 80 draw calls; so does a triple-star system with 12 planets, lit by all three stars (D-29).
- [ ] Hover, selection and labels behave as in the galaxy view (shared e2e helpers).
- [ ] Screenshots are reviewed by the owner against the references.

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
- [ ] E2E: inside a system, adding a star, three planets and a belt works; moving a planet moves its orbit ring; undo restores it.
- [ ] E2E, a binary: add stars A and B either side of the center, a planet around both and a planet with Orbits set to B. The second planet's ring centers on B; moving B moves that planet and its ring, as one undo step.
- [ ] Integration: `orbitCenterId` must name a star with the same parent (422 otherwise), and deleting the star clears it.
- [ ] Code review confirms no `if (level === 'system')` inside `src/editor/`.

### M5-T5 Resource lifecycle and performance gate

- Audit disposal across the view code (rendering.md §13).
- A leak test drives 20 galaxy ↔ system round trips through `__GE_TEST__` and asserts that `renderInfo().geometries` and `.textures` return to within ±5 % of their starting values.
- Extend `pnpm perf` with the system-view phases and the transitions.

**Done when:**
- [ ] The leak test passes in CI (Chromium) and locally (WebKit).
- [ ] The performance report covers the galaxy view, the system view and transitions, all within rendering.md §2.

---

## Milestone acceptance

- [ ] All tasks are checked off; CI is green.
- [ ] The performance report is committed.
- [ ] The owner has entered and left systems with mouse and trackpad and finds the push threshold neither twitchy nor sticky. Tuning changes are recorded in `tuning.ts` comments.
