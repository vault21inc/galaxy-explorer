# M6: Orbit view, places and events (proof of concept complete)

**Goal:** the third view and the content it exists for.

- Planets and moons render as globes with generated or uploaded surfaces, atmosphere, clouds, rings and night lights.
- Places and events are pins you create, move and describe on the globe; events can also sit in a system or in deep space.
- Events have categories, dates, images, links and the people involved.
- At the end, the proof of concept (X1) is complete.

**Depends on:** M5. M4 is recommended, so the demo shows groups.
**Read first:** [rendering.md §8–9](../rendering.md#8-orbit-view), [data-model.md §3.3](../data-model.md) (`events`, `entity_locations`), [§5](../data-model.md#5-coordinates-and-units) (surface coordinates), [ux.md §6](../ux.md#6-spoilers) (pins and locations).
**Demo at the end:** the golden path in M6-T8, followed by the full performance report.

**Out of scope:** drawn areas on globes (O5, later), stations and ships as orbit-view subjects (O3, later), custom fields (M7).

---

### M6-T1 Geo utilities

**Where:** `packages/domain/src/geo/latlon.ts`, `sphere.ts`.

- Functions:
  - `latLonToUnitVector(latDeg, lonDeg)` and `unitVectorToLatLon(v)`;
  - `uvToLatLon(u, v)` and `latLonToUv(…)`, matching three's `SphereGeometry` UV layout;
  - `raySphereIntersect(origin, dir, radius)`;
  - `greatCircleDistanceRad(a, b)`;
  - `slerpLatLon(a, b, t)`, used when dragging pins.
- A comment block with an ASCII diagram explains the axes: +Y is north, and `lon_deg = 0` is the texture's center (data-model §5).

**Done when:**
- [ ] Unit tests cover round trips, both poles, the ±180° antimeridian, and ray hits and misses.
- [ ] An **alignment test** shows that the lat/lon of every vertex of a `SphereGeometry` (64 × 32) matches `uvToLatLon` of its UV within 1e-6.

### M6-T2 Planet appearance and baking

**Where:** `packages/domain/src/planet-presets.ts`, `apps/web/src/render/bake/planet/`, `src/panels/appearance/`.

- `planetPresets`: data for barren, desert, ice, ocean, jungle, lava, toxic, gas giant, city (hive) and forge, as in rendering.md §9.
- The generator shader computes noise **in 3D on the unit-sphere direction of each texel's lat/lon**, never in 2D texture space. That prevents seams at ±180° and pinching at the poles.
  - Outputs: albedo, night lights (city and forge presets, or wherever enabled), cloud alpha and ocean mask.
  - Gas giants use banded noise along latitude.
- The bake cache and the debounce (rendering.md §9).
- The system view switches its planets to baked 256 × 128 textures.
- **Appearance editor:**
  - preset;
  - seed, with a dice button;
  - palette colors;
  - sea level;
  - axial tilt;
  - toggles and parameters for atmosphere, clouds, rings and night lights;
  - a "Use uploaded texture" option: pick or upload an asset, saved as an entity image with role `surface_texture`, which the API resizes to the 2:1 `texture` variant.

**Done when:**
- [ ] A determinism test: identical parameters give an identical pixel hash, read back with `readPixels` in an e2e helper.
- [ ] A seam test: texel columns 0 and width − 1 differ by at most 2/255 per channel.
- [ ] Baking at 2,048 × 1,024 takes under 50 ms on the reference Mac (measured, reported in the commit message).
- [ ] Dragging a palette slider updates the globe within 200 ms.

### M6-T3 Orbit view

**Where:** `apps/web/src/levels/orbit/`, `src/render/globe/`.

- `Globe` (rendering.md §8):
  - the baked or uploaded albedo;
  - Lambert lighting from the star direction (the system star's position relative to the body, or a default for rogue planets);
  - night lights on the dark side;
  - ocean specular highlights;
  - atmosphere, clouds and rings;
  - axial tilt.
- Children in the orbit frame: moons are drawn with `PlanetBody`, stations and markers as icon billboards, and an explorable moon can be entered (O4).
- The camera limits from rendering.md §5: minimum 1.15 radii, exit beyond 8.
- **Ambient motion** (planet spin, cloud drift) is off by default. A toggle in quality settings turns it on, capped at 30 fps with `invalidate()` on an interval, and it's disabled under reduced motion.
- Entry points: from a system view, and straight from the galaxy view for rogue planets.

**Done when:**
- [ ] E2E: enter a planet from its system and then one of its moons; exiting twice returns to the system view at its saved pose.
- [ ] At most 40 draw calls.
- [ ] Idle renders 0 frames with ambient motion off and at most 30 fps with it on.
- [ ] The leak test from M5-T5 is extended to galaxy → system → orbit round trips, and passes.

### M6-T4 Pins, the icon set and event categories

**Where:** `apps/web/src/render/pins/`, `src/render/icons/`, the settings page.

- **Choose the icon set** for categories and pins, then record the choice as a new D-entry in decisions.md:
  - Lucide (ISC): already used in the UI, generic;
  - game-icons.net (CC BY 3.0): thematic, and needs an attribution line on the site.

  The pick is the owner's.
- The **icon picker widget** for `event_categories.icon` in the settings table (M4-T1). The atlas gains the category icons.
- `Pins`:
  - instanced billboards;
  - an atlas cell and color per category;
  - states: normal, hovered, selected, redacted, draft;
  - places use a distinct pin shape.
- Hover shows the label; a click selects the pin and opens the panel.
- **Spoilers** (ux.md §6):
  - a redacted pin is grey with "?";
  - a **hidden location** draws no pin until spoilers are shown or that item is revealed in the panel.

**Done when:**
- [ ] E2E on the demo seed:
  - pins appear at their coordinates (`screenPositionOf` versus the projected lat/lon);
  - a spoiler event shows a grey "?" pin;
  - a location spoiler has no pin while hidden and gets one when shown.

### M6-T5 Places and events: creating and editing

**Where:** `apps/web/src/editor/tools/pin.ts`, `src/panels/location/`, `src/render/markers/`.

- Tools (edit mode, orbit view): **Add place** and **Add event**.
  1. Click the globe: a ray–sphere hit gives the lat/lon.
  2. The entity is created with location mode `surface`, all in one batch.
  3. The panel opens with the name focused.

  Dragging a pin moves it along the sphere.
- The **event form**, generated from the registry:
  - title (the entity name);
  - description;
  - `date_text` and `date_sort`, with the universe's date format notes shown as a hint;
  - category;
  - images, links, people (M6-T6).
- The **location editor** section, shared by places and events, offers the four modes (data-model §3.3):
  - surface (pick on the globe);
  - on an object without a spot (pick any object);
  - in space (pick a point in a system view, or in the galaxy view for deep space);
  - at a place (pick a place).

  It also has the location's spoiler flag.
- **Event markers outside globes** (E3): events with mode `space`, or mode `object` on a system or deep-space object, appear in the galaxy and system views as small diamond icon billboards, through the icon renderer. In those views, edit mode has **"Add event here"**.

**Done when:**
- [ ] E2E: adding an event on the globe at a clicked spot gives a stored lat/lon within 0.5° of the clicked point.
- [ ] Editing every field, dragging the pin, deleting the event and undoing all work.
- [ ] Adding a deep-space event in the galaxy view shows a diamond marker there.
- [ ] An event at a place moves with the place when the place's pin is dragged.

### M6-T6 Characters and the people involved

**Where:** `apps/web/src/panels/relations/`, `src/panels/people-picker/`.

- The `character` kind gets its UI.
- An event's **People involved** section is a combobox that searches characters in the universe and offers "Create '…'" when nothing matches. Each person gets a role (RichText) and a spoiler flag, stored as a `participant` relation.
- Character panel:
  - details;
  - images;
  - an **Events** list built from the inverse relations, sorted by `date_sort`, where each item flies to the event (chained view transitions, ux.md §9).
- In the outliner, characters appear under a universe-level "People" section.

**Done when:**
- [ ] E2E: adding two people with roles to an event works; opening one of them lists the event; clicking it navigates through the views to the pin and selects it.

### M6-T7 Events list

**Where:** `apps/web/src/panels/events-list/`.

- A top-bar "Events" panel for the current map:
  - sorted by `date_sort`, then `date_text`, then name;
  - filters by category and text;
  - shows the date, category icon and location path ("Gudrun System › Gudrun");
  - spoiler-aware.
- Clicking an item navigates through the views and selects the event. Unplaced events show "No location" and open the panel.

**Done when:**
- [ ] E2E: the demo events are listed in date order; filtering by category works; clicking a surface event lands in its orbit view with the pin selected.

### M6-T8 Proof-of-concept acceptance

- **The golden-path e2e test**, in one test run on Chromium and WebKit:
  1. Create a universe and a map.
  2. Add a system and make it explorable; enter it.
  3. Add a star and a planet with the city preset; make the planet explorable and enter it.
  4. Add an event at a clicked spot, with a category, a date, a person and a spoiler description.
  5. Switch to view mode: the description is blacked out. Show spoilers: it's visible.
  6. Exit to the galaxy.
  7. Group the system into a new sub-sector (if M4 is done).
  8. Undo the last three steps and redo them.
- A full `pnpm perf` run covering all three views and the transitions, plus the extended leak test.
- Fix every failure. Tag `v0.1.0-poc`.

**Done when:**
- [ ] The golden path passes in CI (Chromium) and locally (WebKit).
- [ ] The performance report meets every row of rendering.md §2, and is committed.
- [ ] The owner signs off on the demo.

---

## Milestone acceptance

- [ ] All tasks are checked off; CI is green; `v0.1.0-poc` is tagged.
- [ ] The decision log records the icon set, plus anything tuned or changed.
