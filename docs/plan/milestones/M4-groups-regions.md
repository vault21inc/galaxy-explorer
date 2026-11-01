# M4: Groups, regions and routes

**Goal:** organize the galaxy:
- named, nested groups (sectors, sub-sectors, territories), each drawn as a colored outline with a label;
- universe-defined group types and layers;
- nebulae and warp storms as regions;
- routes between objects.

**Depends on:** M3. This milestone can run in parallel with M5; the two touch different files except for the shared registries.
**Read first:** [data-model.md §3.3, §3.5](../data-model.md), [rendering.md §6](../rendering.md#6-galaxy-view) (outlines, regions, routes), [ux.md §5](../ux.md#5-selecting-and-editing) (grouping).
**Demo at the end:**
1. In Universe settings, define Segmentum › Sector › Sub-sector in an "Administrative" layer and a "Political" layer.
2. Box-select systems, press ⌘/Ctrl + G, and create sub-sector "Helican" in gold. Create a sector containing two sub-sectors; its outline encloses both.
3. Move a system to another sub-sector when prompted.
4. Hide the Political layer.
5. Add a nebula and resize it.
6. Draw a route through four systems.

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

- Nebula and anomaly objects get the full editor:
  - creation through the Add menu;
  - a radius handle in edit mode (drag a ring billboard on the plane);
  - appearance fields: color, density, radius, shape.
- `RegionCloud` is polished against the references. Nebulae are additive; warp storms use darker tints with normal blending.

**Done when:**
- [ ] E2E: creating a nebula and dragging its radius handle saves the new radius.
- [ ] 50 regions on the stress map keep the budget.

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

---

## Milestone acceptance

- [ ] All tasks are checked off; CI is green.
- [ ] The performance report for the stress map with groups, regions and routes is committed.
- [ ] The owner can recreate a real sector structure, for example Scarus Sector with its sub-sectors, by tracing the underlay.
