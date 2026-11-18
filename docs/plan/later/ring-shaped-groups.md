# Later: ring-shaped groups

**Status:** written 2026-11-13. **L1-T1 is built** (2026-11-18, D-53, which settles the three decisions below for now: circles, whole rings, per group). L1-T2 and L1-T3 remain, not scheduled.

**Goal:** a group can be drawn as a ring around the galaxy's centre instead of an outline around its members. That makes galaxies with concentric regions possible, such as Star Wars's Deep Core, Core Worlds, Colonies, Inner Rim, Mid Rim and Outer Rim.

**Depends on:** M4 (done). It touches no M8 work.
**Read first:** [rendering.md §6](../rendering.md#6-galaxy-view) (group outlines), [data-model.md §3.3, §4](../data-model.md) (`object_groups`, `GroupStyle`), [M4-T3 and M4-T6](../milestones/M4-groups-regions.md) as built (outline buffers, region handles).

## Why

Everything else a Star Wars galaxy needs is already there: universe-defined group types, routes for hyperspace lanes, the orbit view for its many single worlds, map cloning for eras, and Wookieepedia as a wiki source (D-35).

The gap is the outline. `outlineForGroup()` draws a padded **convex hull** around a group's members. The hull around the Outer Rim's systems is the whole galactic disc, so:

- its fill covers every region inside it, and the six fills stack into one muddy tint at the centre;
- its label sits at the hull's centroid, which is the galaxy's centre, where all six labels pile up;
- with only a few systems placed, the hull is a triangle that looks nothing like a rim.

Sectors, sub-sectors and other compact territories are unaffected. Only ring-shaped groups are wrong.

## The approach (recommended)

A second value for `GroupStyle.shape`: `'ring'`. A ring is the band between two circles around the galaxy's centre.

- **By default the radii come from the members:** the inner circle passes just inside the member nearest the centre, the outer one just outside the farthest, each by the usual padding. So a ring follows its systems as they move, as a hull does, and it already looks like a ring with two or three members.
- **Each radius can be pinned** to a typed or dragged value, which then no longer follows the members. A pinned ring is drawn even with no members, so the owner can lay out all the regions first and fill them in later.
- **An inner radius of 0 is a disc** (the Deep Core).
- **The label sits on the band,** at its middle radius, at an angle the owner can change. Concentric rings then label like contour lines on a map, one above the other.

It's a stylized picture: real region borders are irregular, and these are circles. That matches the rest of the map's look, and it's the cheapest shape that is always right. See "Other approaches" for what was weighed against it.

### Data

`GroupStyle` in `packages/domain/src/schemas/styles.ts`:

```ts
shape: z.enum(['hull', 'ring']),
ring: z.object({
  center: z.tuple([z.number(), z.number()]),  // [x, z] in ly; default [0, 0], the galaxy's centre
  innerRadiusLy: z.number().min(0),           // pinned; missing = from the nearest member
  outerRadiusLy: z.number().positive(),       // pinned; missing = from the farthest member
  labelDeg: z.number().min(-360).max(360),    // where on the band the label goes; default in tuning.ts
}).partial(),
```

- `style` is a jsonb document validated by Zod, so this needs **no migration**. Run `pnpm api:generate` and commit the client.
- The document holds no ids, so import/export references (D-36) and `CLONE_SPEC` don't change: a cloned map keeps its rings.
- Validation: when both radii are pinned, inner < outer.

### Geometry

A new pure function beside `outlineForGroup()` in `packages/domain/src/geo/`, unit-tested:

- `ringForGroup(points, { paddingLy, ring })` returns the two circles as closed polylines, the fill's triangles, and the label's anchor.
- The fill is a strip of quads between the two circles, so no polygon-with-a-hole triangulation is needed.
- A circle 50,000 ly across needs finer steps than a hull's corner arcs (15°), or it shows its corners. The step goes in `tuning.ts`; about 2° is 180 segments a circle.
- With nothing pinned and one member, or all members at the same distance, the band is two paddings wide.

### Drawing

Today a `GroupShape` is one closed loop of points, and its fill is a fan from the centroid, which is only right for a convex shape (`outline-buffers.ts`). Generalize rather than branch:

- A `GroupShape` carries **loops** (one for a hull, two for a ring, one for a disc), its **fill triangles**, and a **label anchor**. `outlineForGroup()` returns the same form, so `outline-buffers.ts` has one code path and never asks which shape it has.
- Rings join the same merged line and fill batches as hulls. **Draw calls stay at two to three for any number of groups.**
- Everything else stays as it is: the height is the members' mean (0 with none); a spoiler group is grey with a redacted label; a member whose membership is a hidden spoiler doesn't count toward the radii; a group is still selected by its label, and a selected group still rings its members.

## Tasks

### L1-T1 Ring outlines

**Where:** `packages/domain/src/schemas/styles.ts`, `packages/domain/src/geo/`, `apps/web/src/render/groups/`, the group form's style fields.

- The schema and `ringForGroup()` above.
- `GroupShape` generalized to loops, fill triangles and a label anchor; `group-shapes.ts` picks the function by `style.shape`.
- The group form gets a Shape choice and, for a ring, the two radii and the label angle (using the form's existing conditions). An empty radius field means "from the members".
- `window.__GE_TEST__`'s group index reports each group's shape and the radii as drawn.
- The demo seed stays as it is. The stress seed makes a handful of its groups rings, so `pnpm perf` covers them.
- Docs: rendering.md §6, data-model.md §4 (`GroupStyle`), the README glossary's Group row, the LLM guide (M7-T8) if it describes group styles, and a D-entry for the decisions below.

**Done when:**
- [x] Unit tests: radii from 1, 2 and many members; pinned radii; inner 0 (a disc); every member lies inside the band by at least the padding; inner ≥ outer is rejected.
- [x] E2E: six concentric ring groups save, reload and draw; the test hook reports six shapes whose bands don't overlap and whose label anchors are on their own bands.
- [x] A hull group next to them is drawn exactly as before (the M4-T3 tests still pass unchanged).
- [x] The stress map with ring groups stays within 3 draw calls for groups, and the galaxy performance budget holds. Numbers before and after are in the commit message.

### L1-T2 Ring handles

**Where:** `apps/web/src/editor/` (as `region-handles.tsx` does it), `src/state/`.

- In edit mode a selected ring group shows a handle on each circle, and one for the label's angle. Dragging previews the ring, and release saves one PATCH (one batch, so one undo).
- A pinned radius shows a "follow the members again" button in the form, which clears it.
- Shift snaps a radius to the grid, as moving objects does.

**Done when:**
- [ ] E2E: dragging the outer handle saves a pinned `outerRadiusLy`; undo restores the ring that followed its members.
- [ ] E2E: clearing a pinned radius makes the ring follow its members again.

### L1-T3 Members from a ring (optional)

- An action on a ring group: "Add the systems inside this ring". It selects the top-level objects whose distance from the centre is within the band and adds them, asking first about any that are in another group of the same type (the existing one-group-per-type rule and its prompt).

**Done when:**
- [ ] E2E: the action adds the systems inside the band, in one batch, and leaves the others alone.

## Decisions to make when picking this up

1. **Circles, or traced borders?** If the regions must follow the published map's irregular borders, circles won't do, and the answer is the traced shape below instead: more work, and a different plan.
2. **Partial rings.** On the usual Star Wars map the Unknown Regions take the galaxy's western side, so the outer regions are C-shaped. Two more fields (`startDeg`, `sweepDeg`) would allow an arc, with closed ends. Leave it out of L1-T1 unless the first trial misses it.
3. **Per group or per type?** This plan sets the shape on each group, which needs no migration. If every group of a type should be a ring (every "Region"), a default shape on `group_types` is a column and a migration; do it only if setting it six times proves annoying.

## Other approaches considered

| Approach | Why not (for now) |
|---|---|
| **Cut the inner hulls out of the outer hull** (Outer Rim's hull minus the Mid Rim's) | Needs no new data, but it depends on where systems happen to be: one Mid Rim system poking past the outer hull changes the picture abruptly, a C-shaped rim fills its own mouth, and subtracting polygons needs a clipping routine. |
| **A concave hull** (alpha shape) of the members | Makes a real ring only when the rim is densely populated. A hand-built map with a dozen rim systems gives ragged or broken shapes. |
| **A traced shape:** a closed curve through points placed by hand, as rifts are (M4-T6), with an optional hole | The most faithful, and it also covers Hutt Space or any odd territory. It's the "freeform" shape M4 left for later. It needs a point-editing tool for closed curves and a fill triangulated around a hole. Worth its own plan if decision 1 goes that way; rings and traced shapes can live side by side as two values of `shape`. |

## Also noted for a Star Wars galaxy (not planned here)

- **Its regions wait for traced shapes** (the owner's call, 2026-11-18). On the published grid the regions aren't circles around the centre: Naboo (Mid Rim) is 48,600 ly out and Mandalore (Outer Rim) 20,700 ly. Rings that follow their members overlap, and pinned rings put worlds in the wrong band. So the live `star-wars` universe keeps its regions as facts until the traced shape ("Other approaches") has its own plan and is built. Rings stay for galaxies whose regions really are concentric.
- **Grid squares.** The published maps name squares such as "R-16". For now that's a custom fact on a system. A grid overlay drawn on the map, with labelled squares, would be a new renderer and a map setting.
- **The background.** The procedural spiral is tuned per map, so a Star Wars map can have its own arms and colors already. Check the settings give enough range before adding more.
