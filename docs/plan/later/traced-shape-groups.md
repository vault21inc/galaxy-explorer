# Later: traced-shape groups

**Status:** a plan to come back to, written 2026-11-18. Not scheduled, and nothing here is decided yet. The task IDs (`L2-T1` and so on) are provisional: renumber them if this joins a milestone.

**Goal:** a group can be drawn as a closed curve the owner traces by hand, instead of an outline worked out from its members. That makes irregular territories possible: Star Wars's regions as the published map draws them, Hutt Space, or any border that is neither a blob around its systems nor a circle.

**Depends on:** M4 (done) and ring-shaped groups, L1-T1 (done, D-53), whose shared drawing form this reuses. It touches no M8 work.
**Read first:** [rendering.md §6](../rendering.md#6-galaxy-view) (group outlines, ring groups, rifts), [data-model.md §4](../data-model.md) (`GroupStyle`), [the ring plan](ring-shaped-groups.md) and D-53, [M4-T6](../milestones/M4-groups-regions.md) as built (rift points and their handles), `packages/domain/src/geo/` (`outline.ts`, `ring.ts`, `rift.ts`).

## Why

A group has two shapes today, and both are worked out, not drawn:

- a **hull** is the padded convex hull of the members, so it can't be concave, C-shaped or wrap around another group;
- a **ring** (D-53) is the band between two circles around a centre, so it only fits regions that really are concentric.

The Star Wars map showed the gap. On its published grid, Naboo (Mid Rim) is 48,600 ly from the centre and Mandalore (Outer Rim) 20,700 ly. Rings that follow their members overlap, and pinned rings put worlds in the wrong band. So the live `star-wars` universe keeps its regions as facts until this is built (the owner's call, 2026-11-18).

The same gap will show for any territory with a real border: a faction's space that bends around a rival's, a region with a bay cut into it, or a border the owner wants exactly where a reference map has it.

## The approach (recommended)

A third value for `GroupStyle.shape`: `'traced'`. A traced group is a closed curve through points the owner places, as a rift is an open one (M4-T6).

- **The curve goes exactly through the points.** No padding and no hull: the outline is where the owner clicked. It doesn't follow the members when they move.
- **Members stay what they are:** the group's list, its rings on selection, its `group_key` in imports. They no longer decide the shape. The form says when members lie outside the outline, and one action adds the systems inside it (L2-T3).
- **Tracing over a reference map** is the main way in: the edit-mode underlay (M3) shows the published map, and the owner clicks along a border.
- **Nested regions cut each other out, with nothing extra to draw.** A traced group's fill leaves out any group of the same type that lies wholly inside it. So the Mid Rim is one curve, its outer border, and its inner border is the Expansion Region's own outline. Each border is traced once, and fills don't stack into one muddy tint. See "Holes" below.
- **A traced group with no points yet draws as a hull,** so switching the shape never makes a group vanish, and the tool can start from that hull.

### Data

`GroupStyle` in `packages/domain/src/schemas/styles.ts`:

```ts
shape: z.enum(['hull', 'ring', 'traced']),
traced: z.object({
  points: z.array(z.tuple([z.number(), z.number()])).min(3).max(128), // [x, z] in ly, map coordinates
  labelAt: z.tuple([z.number(), z.number()]),                         // missing = worked out (see Label)
}).partial(),
```

- **jsonb, as a rift's path is,** so no migration: run `pnpm api:generate` and commit the client. The document holds no ids, so import/export references (D-36) and `CLONE_SPEC` don't change, and a cloned map keeps its outlines.
- **Map coordinates, not relative ones.** A rift's path is relative to its object's position; a group has no position, so the points are absolute.
- **128 points at most.** A rift allows 64. A border around a whole galaxy needs more, but every point is a handle on screen and two numbers in the galaxy view's payload: 128 points is about 2 kB a group once coordinates are rounded to whole light-years, which the tool does on save.
- **Validation:** at least 3 points; every number finite; no two neighbouring points the same; and the polygon through the points must not cross itself (128 points is about 8,000 pairs of sides to test, in a Zod refinement). A crossing outline has no clear inside, which the fill, the holes and "add the systems inside" all need.
- **A table of points was weighed** and left out: it would give per-point history, but needs a migration, the audit trigger, clone and import rules and its own routes, for nothing a reader sees. History keeps the whole style per edit either way.

### Geometry

A new pure module, `packages/domain/src/geo/traced.ts`, unit-tested, returning the same `GroupFigure` as `outlineForGroup()` and `ringForGroup()` (loops, fill triangles, label):

- **The curve:** a closed Catmull-Rom spline through the points, sampled a fixed number of steps per span (`tuning.ts`; 8 steps makes 128 points about 1,000 segments, three rings' worth).
  - `catmullRom()` in `rift.ts` is open and uniform. Closing it is small: the neighbours wrap around instead of clamping at the ends.
  - **Centripetal, not uniform.** A uniform spline overshoots and can loop where points are unevenly spaced, which a hand-traced border always is. The centripetal form never makes a cusp or a loop inside a span. Rifts stay uniform, so existing rifts don't change.
- **The fill:** a traced curve can be concave and can have holes, so the hull's fan from the centroid and the ring's strip of quads don't apply. It needs a real triangulation.
  - **Recommended: `earcut`** (3.2.4, ISC, no dependencies, about 3 kB gzipped), pinned in `@ge/domain`. It's the algorithm three.js carries inside it, it handles holes and awkward input without failing, and it runs only when a group changes, never per frame.
  - **Not three.js's `ShapeUtils.triangulateShape`:** `@ge/domain` must stay free of three.js (AGENTS.md, layering), and triangulating in the web app would split the shape between two packages and break the "one form" that D-53 set up.
  - **Not hand-written ear clipping:** simple for one loop, but holes need bridging and care with collinear points. That's the real work a dependency should remove.
- **Holes:** `cutContained()` takes every group's outer loop with its type, and for each traced group returns the loops to cut out: those of the same group type lying wholly inside it, but not inside another loop that is itself inside it (so the Outer Rim cuts out the Mid Rim only, not everything within the Mid Rim).
  - "Wholly inside" is every point of the inner loop passing a point-in-polygon test, and no sides crossing. For a few dozen traced groups that is a few hundred thousand cheap tests, only on rebuild.
  - Any shape can be the inner one: a ring's disc for the Deep Core inside a traced Core Worlds cuts a hole too, since every shape gives loops.
  - Borders that cross aren't "wholly inside", so the fills stack there. That shows the owner where two borders disagree.
  - The line is only the group's own outer loop. The inner border is drawn by the group inside, in its own color.
- **The label:** the centroid of a C-shaped or hollow region falls outside it. Use the **pole of inaccessibility**: the point inside the shape farthest from any edge, holes included, found by a coarse grid search refined a few times (about 60 lines, no dependency). The owner can override it with `labelAt`.
- **Point-in-polygon** (even-odd ray casting) is exported for the holes, for L2-T3, and for "members outside".

### Drawing

Nothing new to draw, which is the point of D-53's shared form:

- `group-shapes.ts` picks `tracedForGroup()` when `style.shape` is `'traced'` and there are points, in a first pass over all groups; a second pass adds the holes and triangulates. `GroupShape.kind` gains `'traced'`.
- Traced groups join the same merged line and fill batches. **Draw calls stay at two to three for any number of groups.**
- Height is the members' mean, 0 with none, as for rings. Spoilers, layers, selection by label and the rings around a selected group's members work as they do now.
- A reader who can't see a draft group gets no hole for it, so the outer fill covers that area: nothing hints at the draft.

### The tracing tool

Built on the rifts' pattern (`region-handles.tsx`, `rift-points.ts`, `state/region-preview.ts`), generalized rather than copied:

- **The form** gets `'Traced by hand'` in Shape, and an outline field (a new widget, as `riftPath` is): how many points, **Draw outline**, **Start from the current shape**, and the count of members outside it.
- **Draw outline:** click points onto the map in order; Enter, a double-click or a click on the first point closes the curve; Esc cancels. Three points at least. This is the tool for tracing over the underlay.
- **Start from the current shape:** fills the points from what's drawn now: the hull's corners, or 24 points around a ring's outer circle. So a hull or ring can be turned into a traced shape and adjusted, not redrawn.
- **Handles**, for the selected group in edit mode:
  - one per point: drag to move, Shift snaps to the grid, click to select, Delete removes it (never below three), arrow keys nudge the selected one;
  - a click on the outline's line adds a point there, between its neighbours (picked within 6 px, as routes are);
  - one for the label: drag to set `labelAt`; the form's reset clears it.
- **One save per gesture:** a drag previews the outline and release saves one PATCH (one batch, one undo), reading the group first and merging into its own style, as `use-save-region.ts` does.
- **The preview is drawn apart from the merged batches** (one more draw call, only while dragging), so a drag doesn't rebuild every group's buffers on each pointer move.
- **Handles are DOM elements at 3D points,** as rift handles are, so they take focus and keys like any control. 128 of them is twice a rift's most: `pnpm perf --edit` gets a 128-point traced group selected, and if the edit-mode budget is missed, the handles become one instanced draw with a single focusable handle for the selected point.
- **A group with no members** can't be made in the app today: the Group tool needs a selection. With nothing selected it should open the same dialog for an empty group, which then shows only once it's traced (or, for a ring, once its outer radius is pinned). Regions can then be laid out before any system is placed.

## Tasks

### L2-T1 Traced outlines

**Where:** `packages/domain/src/schemas/styles.ts`, `packages/domain/src/geo/traced.ts`, `apps/web/src/render/groups/`, `apps/api/src/seeds/stress.ts`.

- The schema, `tracedForGroup()`, `cutContained()`, the pole of inaccessibility and point-in-polygon above. `earcut` added to `@ge/domain`, pinned.
- `group-shapes.ts` in two passes; a traced group without points falls back to its hull.
- `window.__GE_TEST__`'s `groupOutline` reports `'traced'`, the point count and how many holes were cut.
- The stress seed makes a handful of its groups traced (a wobbly closed loop around each cluster), so `pnpm perf` covers them.
- Usable from the API at once: an agent can send points through MCP. The group's description in `entity-kinds.ts` and the LLM guide say how.
- Docs: rendering.md §6, data-model.md §4, the README glossary's Group row, and a D-entry for the decisions below.

**Done when:**
- [ ] Unit tests: the curve passes through every point and closes; a concave shape's triangles cover its area and nothing outside it; unevenly spaced points make no loop; a crossing polygon, two points, and 129 points are rejected.
- [ ] Unit tests: a group inside another of its type becomes a hole; one inside a hole doesn't cut the outer group again; a group of another type, or one whose border crosses, cuts nothing.
- [ ] Unit tests: the label of a C-shape and of a hollow shape lies inside the fill; `labelAt` overrides it.
- [ ] E2E: three nested traced groups save, reload and draw; the test hook reports one hole in each of the outer two, and labels inside their own fills.
- [ ] Hulls and rings beside them are drawn exactly as before (the M4-T3 and D-53 tests pass unchanged).
- [ ] The stress map with traced groups stays within 3 draw calls for groups, and the galaxy performance budget holds. Numbers before and after are in the commit message.

### L2-T2 The tracing tool

**Where:** `apps/web/src/editor/` (shared with `region-handles.tsx`), `src/state/`, the group form (`entity-kinds.ts`, a new widget), `apps/web/src/help/tours.ts`.

- The form's outline field, Draw outline, Start from the current shape, the handles, adding a point on the line, the label handle and the preview above.
- The Group tool makes an empty group when nothing is selected.
- The handle code is shared, so the ring handles (L1-T2 of the ring plan) become a small addition: do that task with this one or right after.
- A guided-tour step for tracing, and `data-tour` on the control it points at.

**Done when:**
- [ ] E2E: drawing five points and pressing Enter saves a traced outline in one batch; undo removes it.
- [ ] E2E: dragging a point, adding one on the line and deleting one each save one PATCH and can be undone; an outline of three points can't lose one.
- [ ] E2E: "Start from the current shape" turns a hull into a traced outline that encloses the same members.
- [ ] E2E: dragging the label handle saves `labelAt`, and reset clears it.
- [ ] `pnpm perf --edit` with a 128-point traced group selected meets the edit-mode budget. Numbers are in the commit message.

### L2-T3 Members from the outline (optional)

- An action on a traced group: "Add the systems inside this outline". It adds the top-level objects inside the curve and outside its holes, asking first about any that are in another group of the same type (the existing one-group-per-type rule and its prompt). The same action serves rings (L1-T3 of the ring plan), with the band as the test.
- The form's "3 members are outside the outline" selects them when clicked.

**Done when:**
- [ ] E2E: the action adds the systems inside the outline, in one batch, and leaves the others alone.

### L2-T4 The Star Wars regions (content, after a release)

**Where:** `scripts/content/star-wars/` and the live `star-wars` universe, through the MCP endpoint.

- Each region's border as points in **grid coordinates** in `catalog.ts` (the corner between squares, such as the one L-9 and M-10 share), read off the published map, and turned into light-years by the grid mapping `placeWorld()` already uses. No pixels are traced, and the borders stay in step with where the worlds are put.
- A group type "Region" on its own layer, and one traced group per region (Deep Core, Core Worlds, Colonies, Inner Rim, Expansion Region, Mid Rim, Outer Rim Territories, and perhaps Hutt Space), upserted with `sw-region-<slug>` keys, with each world added to its region's group by its `region` fact. The facts stay.
- Needs L2-T1 released first (a `v*` tag), and the owner's go-ahead for the production change.

**Done when:**
- [ ] Every catalog world lies inside its own region's outline (a check in the builder, before anything is sent).
- [ ] The regions draw on the live map with no stacked fills, and the owner is happy with the borders.

## Decisions to make when picking this up

1. **Holes: from the groups inside, or traced?** The plan cuts out same-type groups that lie wholly inside (no extra data, each border traced once). The alternative is a `holes` list of point loops on the group itself: needed only for a hole that isn't another group, such as an enclave nobody claims, and it means tracing shared borders twice. It can be added later beside the first.
2. **Refuse a self-crossing outline, or allow it?** The plan refuses it on save, with a message. Allowing it is friendlier while dragging, but the fill, the holes and "inside" all become guesses.
3. **128 points, as DOM handles?** Fewer is cheaper and coarser. The plan measures 128 in `pnpm perf --edit` and falls back to instanced handles only if the budget is missed.
4. **`earcut` in `@ge/domain`?** The package already carries the rich-text parsers, so a small pure dependency isn't new there. The alternatives are hand-written ear clipping with hole bridging, or triangulating in the web app with three.js.
5. **Smooth only, or straight sides too?** A `straight: true` on the traced style would draw the polygon through the points with no curve, for territories that follow grid squares. Cheap to add; leave it out unless the Star Wars trial wants it.
6. **Per group or per type?** As for rings (the ring plan's decision 3): a default shape on `group_types` is a column and a migration. Do it only if setting it on each group proves tiresome.
7. **Ring arcs** (the ring plan's decision 2) lose their main use: a C-shaped region is a traced shape. Close that question when this is built.

## Other approaches considered

| Approach | Why not (for now) |
|---|---|
| **Bézier curves with control handles,** as drawing programs have | Finer control, but two more handles per point and a tool that takes learning. Catmull-Rom goes through the clicked points, which is what tracing a map needs, and rifts already work that way. |
| **Freehand:** drag the pointer along the border, then simplify the stroke to points | Fast with a pen, shaky with a trackpad, and the result still needs the point handles to fix. It could be a second way to draw later, on top of the same data. |
| **A concave hull** (alpha shape) of the members | No drawing at all, but it only works where a region is densely filled with systems, and the owner can't put the border where the map has it. |
| **Fills that never stack, by depth or stencil,** instead of holes | Every fill would "own" its pixels, for all shapes at once. But the camera can go below the plane, which flips a depth order, a stencil pass adds draw calls, and today's look, where a sector's fill deliberately tints its sub-sectors, would change. |
| **Voronoi territories** from the members | The other shape M4 left for later. It splits space between neighbours with no drawing, which suits factions, but it can't follow a published border. It can live beside traced shapes as another value of `shape`. |

## Also noted

- **A grid overlay** (the ring plan's note) matters more once regions are traced from grid squares: seeing the squares while tracing would help. Still its own renderer and map setting.
- **Moving a whole outline** (drag all its points together) and **copying one to another map** aren't planned. Cloning the map carries every outline already.
