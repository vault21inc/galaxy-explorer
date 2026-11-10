# M4: Groups, regions and routes

**Goal:** organize the galaxy:
- named, nested groups (sectors, sub-sectors, territories), each drawn as a colored outline with a label;
- universe-defined group types and layers;
- nebulae and warp storms as regions;
- routes between objects;
- a look of its own for each kind of body in the galaxy view (D-28).

**Depends on:** M3. This milestone can run in parallel with M5; the two touch different files except for the shared registries.
**Read first:** [data-model.md §3.3, §3.5](../data-model.md), [rendering.md §6](../rendering.md#6-galaxy-view) (outlines, regions, routes), [ux.md §5](../ux.md#5-selecting-and-editing) (grouping).
**Demo at the end:**
1. In Universe settings, define Segmentum › Sector › Sub-sector in an "Administrative" layer and a "Political" layer.
2. Box-select systems, press ⌘/Ctrl + G, and create sub-sector "Helican" in gold. Create a sector containing two sub-sectors; its outline encloses both.
3. Move a system to another sub-sector when prompted.
4. Hide the Political layer.
5. Add a nebula and resize it. Recreate the Eye of Terror as a storm disc seen from above: a bright rim around a darker core, with a gap in the rim for the Cadian Gate. Then try it with an uploaded top-down image instead.
6. Draw the Great Rift as a rift region along a curve across the galaxy.
7. Draw a route through four systems.
8. Systems show as glowing stars ringed by their planets, black holes as lensed accretion discs, and stations and markers as icons. Change a system's color and size, and its star follows.

**Out of scope:** Voronoi-style territories and freeform drawn areas (later shape renderers).

---

### M4-T1 Universe settings page

**Where:** `apps/web/src/app/routes/universe-settings.tsx`, `src/panels/config-table/`.

- `/u/:universeSlug/settings` has two parts:
  - a **universe details** form, generated like the entity forms: name, description, date format notes (E2), accent color, distance unit labels;
  - one **generic CRUD table per config resource** in `configResources`: group types (name, layer, parent type, default color), event categories (name, color, and an icon as a text key until M6-T4), object subtypes and field definitions. The last two are fully used in M7, but the tables already work.
- The tables are generated from the registry with inline editing and ordering by drag (`sort_key`).

**Done when:**
- [ ] E2E: creating the three administrative group types with their parent chain persists after a reload.
- [ ] No resource-specific table components exist; adding a config resource to the registry makes its table appear.

### M4-T2 Groups from a selection, and membership editing

**Where:** `apps/web/src/editor/actions/group.ts`, `src/panels/group-dialog/`.

- ⌘/Ctrl + G (or the toolbar's Group) opens the dialog:
  - group type (group types of the universe);
  - name (RichText, single-line);
  - outline color, defaulting to the type's color;
  - parent group, offering only groups whose type is this type's parent.
- Saving is one batch: create the group, then add its members.
- **Conflicts:** if selected objects are already in a group of this type, the dialog first asks "Move N objects from Helican to Ophidian?" On yes, one batch removes them from the old group and adds them to the new one.
- Editing membership afterwards:
  - context menu: Add to group ▸ / Remove from group;
  - ⌘/Ctrl + Shift + G removes the selection from its group of the active layer;
  - the panel's member list (with each membership's spoiler flag).
- Deleting a group is the generic delete with impact (members are released; child groups lose their parent).

**Done when:**
- [ ] E2E: grouping four systems as "Helican" creates the group and its memberships.
- [ ] Re-grouping one of them prompts and moves it.
- [ ] Undo restores the previous memberships.

### M4-T3 Outline geometry and rendering

**Where:** `packages/domain/src/geo/outline.ts`, `apps/web/src/render/groups/`.

- `outlineForGroup(points, { paddingLy, nestingDepthBelow })`:
  1. Convex hull (monotone chain).
  2. Outward offset with round joins.
  3. Two passes of Chaikin smoothing.
  4. Return the closed polyline and the area centroid.

  Padding grows with the nesting depth beneath the group (rendering.md §6).
- `GroupOutlines`:
  - one merged `LineSegments2` for solid lines and one for dashed lines, with per-vertex colors;
  - one merged fill mesh with vertex colors and alpha;
  - each outline at its members' mean height;
  - rebuilt only when groups, memberships, positions or the spoiler policy change.
- Hidden spoilers:
  - a group that is itself a spoiler is drawn grey with a redacted label;
  - a member whose **membership** is a spoiler is left out of the outline.
- Group labels feed the label layer at the centroid, uppercase, in the group's color.

**Done when:**
- [ ] Unit tests for 1, 2, 3, collinear and duplicate points. Every input point lies inside the outline by at least the padding.
- [ ] The stress map's 300 groups render in at most 3 draw calls, and the galaxy performance budget still holds.

### M4-T4 Group details and selection

- Clicking a group label (or its outliner row) selects the group:
  - the panel shows the entity details (name, description, images, facts, links), members, child groups and parent group;
  - member objects get a highlight ring.
- The outliner becomes a tree: layer › group types › groups › member objects, then ungrouped objects.

**Done when:**
- [ ] E2E: clicking a label selects the group, the panel lists its members, and the outliner shows the nesting.

### M4-T5 Layers and legend

- A Layers popover in the top bar:
  - visibility per layer and per group type;
  - a legend of group colors and names for visible groups.

  It is remembered per browser.
- The label mode "groups" and outline rendering both respect visibility.

**Done when:**
- [ ] E2E: hiding the Political layer hides its outlines and labels, and the setting survives a reload.

### M4-T6 Regions

**Where:** `packages/domain/src/schemas/appearance.ts`, `apps/web/src/render/regions/`, `src/panels/appearance/`, `src/editor/`.

- **Nebula and anomaly objects get the full editor:**
  - creation through the Add menu;
  - a radius handle in edit mode (drag a ring billboard on the plane);
  - appearance fields for the region's shape, color, density and radius, plus each shape's own fields below.
- **Four shapes** (`appearance.region.shape`, D-25):

  | Shape | Looks like | Drawn as |
  |---|---|---|
  | `sphere` | a round cloud (M2-T3) | billboards in `RegionCloud` |
  | `disc` | a flattened cloud (M2-T3) | billboards in `RegionCloud` |
  | `storm` | a large storm seen from above, such as the Eye of Terror: a bright, clumpy rim around a darker core, radial filaments, and optional gaps in the rim (the Cadian Gate) | a flat textured disc in the galactic plane, plus a few billboards for depth when the camera tilts |
  | `rift` | a band along a curve, such as the Great Rift (Cicatrix Maledictum) or a streak-shaped storm | billboards along the curve in `RegionCloud`, plus a flat ribbon on the plane |

- **Storm discs** (`StormDiscs`, new renderer):
  - Each storm's top-down texture is baked once (rendering.md §9) from its fields: `innerRadius` (the hollow core, as a share of the radius), `color` (the interior) and `rimColor`, `filaments` (0–1), and `gaps` (up to 4, each an angle and a width in degrees). Generated textures are radially symmetric, so `rotationDeg` turns the whole disc.
  - `texture: 'upload'` uses the object's image with the new role `region_texture` instead of baking: a top-down picture of the storm, placed by the region's radius and `rotationDeg`. This needs the role added to `IMAGE_ROLES`, with a migration for the check constraint.
  - All storm discs are one draw call. Each texture becomes a layer of one texture array (a baked layer, or the uploaded image resampled into it), and an instanced quad picks its layer. If texture arrays prove awkward in Safari, fall back to one draw per storm disc and note it; storms are few.
  - Drawn like the galaxy disc: additive for nebulae, darker normal blending for anomalies (premultiplied alpha, as in `RegionCloud`), and without writing depth.
- **Rifts:**
  - `path` holds 2–64 points `[x, z]`, in light-years relative to the object's position. A Catmull-Rom curve through them is the rift's center line, and `radius` is its half-width.
  - Edited by clicking points onto the plane and dragging their handles; Delete removes the selected point.
  - Billboards are spread along the curve by length, in `RegionCloud`'s one draw call. One merged ribbon mesh for all rifts, textured with the region sprite, is one more draw call.
- **Picking** (rendering.md §10): spheres, discs and storms as projected circles; rifts by on-screen distance to the projected curve, within its width.
- `RegionCloud` is polished against the references. Nebulae are additive; warp storms use darker tints with normal blending.
- **Out of scope:** animated (swirling) storms; ambient motion stays opt-in (rendering.md §2).

**Done when:**
- [ ] E2E: creating a nebula and dragging its radius handle saves the new radius.
- [ ] E2E: a storm with a gap and a rift with four points save, reload and draw; `drawnObject` reports each one's shape, and picking hits a rift along its curve but not beside it.
- [ ] E2E: an uploaded `region_texture` replaces a storm's baked texture.
- [ ] Unit tests: the region schema per shape, the rift curve sampling, and the storm bake key.
- [ ] All regions together take at most 3 draw calls (billboards, storm discs, rift ribbons). 50 regions on the stress map, including 5 storms and 3 rifts, keep the budget.

### M4-T7 Routes

**What:** the first entity kind added after M1. It proves that adding a kind is a registry entry plus a migration.

- Migration:
  - the `routes` and `route_waypoints` tables (data-model §3.3);
  - add `'route'` to the `entities.kind` check;
  - attach the audit triggers;
  - add both tables to `AUDITED_TABLES` and `CLONE_SPEC`. Both constants exist since M1-T4, and their consistency tests fail until the tables are listed.
- Registry: `route: { scope: 'map', plural: 'routes', extension: routeExtension, … }`.
- Waypoints use `PUT /routes/{id}/waypoints` with an ordered list of object ids. Add the batch op `setWaypoints`.
- UI:
  - **Route tool:** click objects in order, Backspace removes the last, Enter finishes.
  - **"Create route from selection"** uses the order in which objects were selected.
  - The panel lists the waypoints, which can be reordered by drag, and offers the style (color, width, dashed).
- Rendering: merged line segments (rendering.md §6), with the label at the middle segment.

**Done when:**
- [ ] The M1 generic contract suite covers `route` with **no new test code**, only the registry entry.
- [ ] E2E: creating a route through four systems draws it; moving a waypoint system updates the line.

### M4-T8 A look per kind of body in the galaxy view

**Where:** `apps/web/src/render/bodies/`, `src/render/bake/`, `src/render/registry.ts`, `apps/api/src/services/view-service.ts`, `packages/domain/src/schemas/views.ts`.

The details are in D-28 and rendering.md §6. This task doesn't depend on T1–T7 and can come first.

- **Payload:** galaxy-view systems gain two fields, computed with grouped queries; the view snapshot test changes by those fields only. Both count only what the reader may see (drafts only with `includeDrafts`, as everywhere).
  - `planetCount`: the `planet` objects directly inside the system.
  - `stars`: up to 3 of its `star` objects, largest first, each `{ color, sizeShare }` (resolved color; size relative to the largest) (D-29).
- **`SystemGlyphs`:**
  - A baked atlas of star glyphs for 1–3 stars and 0–6 planets: a core and halo per star, faint rings, and a dot on each ring. Each star's light sits in its own color channel, so the shader tints each star separately (rendering.md §6).
  - One instanced draw. A system without star objects is one star tinted by the system's resolved color; one with stars shows up to 3 in their own colors. The glyph is sized by the system's radius (the form's Color and Size fields).
  - A per-instance turn from the id.
  - Redacted systems use the redaction color and no rings: the count could hint at the content.
  - Drafts are drawn like drafts elsewhere.
- **`BlackHoles`:**
  - A baked atlas of the lensed disc at four elevations: shadow, photon ring, disc with Doppler-brighter side, the far side's arch and the underside's arc.
  - One instanced draw that blends the two nearest elevations and lines the disc up with the galactic plane on screen.
  - Tinted by color.
  - A larger maximum on-screen size than other bodies (`BLACK_HOLE_MAX_PX` in `tuning.ts`, a starting value of 96 px).
- **`IconSprites`** for stations and markers: a small atlas with two built-in shapes until M6-T4's icon set replaces them, one instanced draw.
- **Planets** stay in `InstancedBodies`, which keeps every base type without its own renderer.
- **Unchanged:** picking, selection rings, labels, the move preview and the placement ghost work for every renderer through the scene index, with the same tests. The Add menu's ghost shows the new look of the type being placed.
- **Comments** explain each bake and shader in plain words (AGENTS.md: the owner is new to three.js).

**Done when:**
- [ ] Unit tests: the planet-count and stars queries (drafts and spoilers), the atlas cell for each star and planet count, and the elevation blend weights.
- [ ] E2E: `drawnObject` reports each renderer for a system, a planet, a station, a marker and a black hole. A system with three planets reports `planetCount` 3, and a binary (two stars of different colors) reports both in `stars`. Changing a system's color and size changes its glyph's color and on-screen size.
- [ ] Screenshots of each look at a few zoom levels are attached to the commit, for the owner to judge against the NASA reference.
- [ ] The galaxy view's draw calls rise by at most 3, and `pnpm perf` (view and `--edit`) still meets every budget. Before and after numbers are in the commit message.

---

## Milestone acceptance

- [ ] All tasks are checked off; CI is green.
- [ ] The performance report for the stress map with groups, regions and routes is committed.
- [ ] The owner can recreate a real sector structure, for example Scarus Sector with its sub-sectors, by tracing the underlay.
