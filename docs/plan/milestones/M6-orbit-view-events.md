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
- [x] Unit tests cover round trips, both poles, the ±180° antimeridian, and ray hits and misses.
- [x] An **alignment test** shows that the lat/lon of every vertex of a `SphereGeometry` (64 × 32) matches `uvToLatLon` of its UV within 1e-6.

**As built:**
- **One file.** Everything is in `packages/domain/src/geo/latlon.ts`, exported from `@ge/domain`, with `normalizeLonDeg` added. The plan's `sphere.ts` wasn't needed: `raySphereIntersect` is a few lines beside the rest.
- **The convention, matched to three's `SphereGeometry`:** lon 0 is +X (u = 0.5), east is −Z, north is +Y, and v runs from 0 at the south pole to 1 at the north. At a pole, longitude is reported as 0. Longitudes run over [−180, 180), so u = 1 and u = 0 are the same meridian (−180).
- **`slerpLatLon`** moves at an even angular pace. Between opposite points, where every great circle is equally short, it goes over the pole on the start point's side.
- **`raySphereIntersect`** returns the nearest hit in front of the ray, the exit point from inside, or null.
- **Tests:** `packages/domain/test/latlon.test.ts` (12 tests), plus the alignment test in `apps/web/test/latlon-alignment.test.ts`, which needs three.js and so can't live in the domain package. It compares points on the unit sphere rather than degrees: three stores positions as 32-bit floats, and near the poles a tiny step is many degrees of longitude.

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
- [x] A determinism test: identical parameters give an identical pixel hash, read back with `readPixels` in an e2e helper.
- [x] A seam test: texel columns 0 and width − 1 differ by at most 2/255 per channel.
- [x] Baking at 2,048 × 1,024 takes under 50 ms on the reference Mac (measured, reported in the commit message).
- [x] Dragging a palette slider updates the globe within 200 ms.

**As built:**
- **Presets are data** in `packages/domain/src/planet-presets.ts`: palette, sea level, ocean colors, noise frequency and octaves, domain warp, ridged noise, polar caps, gas-giant bands and night lights (city lights, or lava cracks that glow in daylight too). `resolvePlanetSurface` applies an object's overrides; `planetDefaults` gives what the editor shows dimmed; `seedFromId` gives each planet without a seed its own.
- **The generator** (`apps/web/src/render/bake/planet/planet-surface-bake.ts`) turns each texel into its lat/lon and point on the unit sphere (M6-T1's convention) and computes gradient noise there, in 3D, with a sine-free hash so every GPU gives the same pixels. Two outputs: `surface` (sRGB albedo, ocean mask in alpha) and `layers` (night lights in R, clouds in G) for M6-T3's globe. **Edge texels sit on the edges:** column 0 and the last column are both the ±180° meridian, the first and last rows the poles, so the seam test finds 0/255 difference; renderers sample with the same mapping.
- **The system view** keeps every planet's 256 × 128 surface as one layer of a `WebGLArrayRenderTarget` (`planet-texture-array.ts`), so the planets still draw in one call; a layer is re-baked only when its key changes. The stack lives as long as the page, like the bake cache: the first perf run, which rebuilt it on every entry, missed the 700 ms transition budget once (712 ms in WebKit), and keeping it brought cached entries back to 626–651 ms. Axial tilt turns each sphere (`placeOnSphereRotated`). A hidden spoiler planet gets a neutral surface, never its own.
- **Live editing:** sliders and palette pickers write to an appearance preview store (`state/appearance-preview.ts`) while they move and save when let go. The planets re-bake at most every 150 ms (`PLANET_BAKE_DEBOUNCE_MS`): the first change shows at once, a drag every 150 ms, which keeps a drag smooth where a pure debounce would wait for the pointer to stop. The e2e test measures 7 ms from the slider's input event to the re-baked layer.
- **The editor** is registry data (`packages/domain/src/registry/planet-form.ts`, shown under the `planetType` condition): surface (generated or uploaded), preset, seed with a dice button, palette, sea level, axial tilt, and switches with their own fields for atmosphere, clouds, rings and night lights. New widgets: `slider`, `seed` and `palette`. Selects now show an inherited value dimmed instead of "None".
- **Uploads:** the image pipeline makes a `texture` variant for any image within 5 % of 2:1, stretched to exactly 2:1 and a power of two wide (at most 2,048). View payloads carry a planet's `surfaceTexture` (that variant, or `display` for other shapes), and the system view bakes it into the planet's layer once loaded. Atmosphere, clouds and night lights are stored and edited now, and drawn by M6-T3's globe.
- **After the owner's first look:**
  - **Lighting fix:** planets were lit by the ambient light alone in every build. React Three Fiber copies each uniform into the material (`{ ...uniform }`), so the light count written later to the component's own object never reached the shader; planets and belts had been unlit this way since M5-T3. Lights are now written to the material's uniforms each frame (`use-lit-uniforms.ts`), and the `litLightCounts` test hook checks it in the system-view e2e test.
  - **Brightness:** an exposure curve, 1 − e^(−2 × light), brightens dark surfaces without clipping bright ones; the night side gets 12 % light; the darkest preset colors are lighter.
  - **Clickable labels:** pointing at an object's label is pointing at the object (rendering.md §10).
- **Tests:** `packages/domain/test/planet-presets.test.ts`, `apps/web/test/appearance-preview.test.ts`, the texture variant and `surfaceTexture` in `apps/api/test/assets.int.test.ts`, and `apps/web/e2e/planet-appearance.spec.ts` (determinism and seams for every preset and both outputs, each planet's own layer, the slider's live preview, dice, preset, and an upload). `pnpm perf` now times a 2,048 × 1,024 bake of three presets against the 50 ms budget: 5–11 ms across runs in Chrome and WebKit on the M4 Max ([report](../../perf/2026-11-11-M6.md)). Headless browsers render in software (about 270 ms), so the e2e test only reports it.

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
- [x] E2E: enter a planet from its system and then one of its moons; exiting twice returns to the system view at its saved pose.
- [x] At most 40 draw calls.
- [x] Idle renders 0 frames with ambient motion off and at most 30 fps with it on.
- [x] The leak test from M5-T5 is extended to galaxy → system → orbit round trips, and passes. (Since the owner's review, both leak tests run locally and in `pnpm perf`, not in CI.)

**As built:**
- **Sunlight in the payload:** the orbit view carries `sunlight`, the unit direction from the body to the star that lights it and the star's color: the star it orbits (D-29), else its system's largest, among those the reader may see. A moon takes its planet's; a body outside any system gets none and the client lights it from `ORBIT_DEFAULT_SUN_*`, a dim cool glow. The globe publishes that light to the system-view light uniforms (at 10⁴ radii, so in parallel), which light the moons.
- **`Globe`** (`apps/web/src/render/globe/`): the surface and its night-light and cloud layers are baked at the quality level's `orbitTexturePx` (2,048 × 1,024 at Medium) through the bake cache; an upload replaces the albedo once loaded. The surface shader adds an ocean glint (Blinn-Phong, from the bake's ocean mask), night lights past the terminator, and a haze at the lit edge; clouds are a sphere at 1.01 radii; the atmosphere is a back-face shell added onto what's behind it; rings are a `RingGeometry` that the globe shades. All of them sit in one group turned by the axial tilt. Up to 4 draws for the globe; 9 for the whole view in the e2e test.
- **The terminator:** plain Lambert light starts dead at the terminator, and the display's sRGB curve makes the first bit of light look bright, so the edge read as a hard line. Sunlight fades in with an S-curve from `GLOBE_TERMINATOR_WRAP` past it instead. The night side gets 1.2 % light.
- **Presets** gained an atmosphere (color and thickness, or none for barren worlds): `planetDefaults` turns it on, so ocean, jungle and toxic worlds have a glow without setup. City lights are sparser.
- **The orbit camera** (`orbit-camera.ts`) keeps its target on the globe's center (elsewhere, the 1.15-radii minimum could put the camera inside the globe), turns freely to within 1° of the poles, and starts 70° round from the sunlit side so the view shows day and night. Exit beyond 8 radii, through M5-T2's exit push.
- **Editable:** the levels registry gives the orbit view an `edit` entry, so moons, stations and markers are added and moved around a globe with the same tools as in a system, and the view has its outliner and info panel. Pins arrive in M6-T4.
- **Ambient motion:** a switch in the quality settings (remembered, off by default, and off under reduced motion whatever it says). While on, a timer asks for 30 frames a second; the planet turns 4° a second and its clouds a little faster.
- **After the owner's review:**
  - **Moons in the system view:** a system view's payload carries its planets' children as `satellites`, and the system view draws them beside their planet at their orbit-view distance in the planet's system-view radii (rendering.md §7). They can be selected and entered, not moved there.
  - **The start pose frames the moons:** the orbit camera starts 1.9 × the farthest child's reach out (at least 3.2 radii) and 28° above the equator, and exits beyond 8 radii or 1.4 × that start.
  - **Flying to a moon:** the camera's target was pinned to the globe's center, so a double-click on a moon dived into the planet. The target may now move to a moon, and `keepOutsideRadius` keeps the camera itself 1.15 radii from the center.
- **Tests:** `apps/web/e2e/orbit-view.spec.ts` (system → planet → moon → back twice to the saved pose, draw calls, camera limits, lights; idle 0 frames, ambient motion 21–28 fps in the headless browsers, reduced motion), the leak test's galaxy → system → orbit round trips (11 / 7 → 11 / 7), the rogue planet straight from the galaxy in `views.spec.ts`, and `orbits.int.test.ts` for the sunlight.

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
- [x] E2E on the demo seed:
  - pins appear at their coordinates (`screenPositionOf` versus the projected lat/lon);
  - a spoiler event shows a grey "?" pin;
  - a location spoiler has no pin while hidden and gets one when shown.

**As built:**
- **The icon set (D-32):** the owner chose both Lucide and game-icons.net. Keys are `set:name`; a key without a set is Lucide's. The API serves the sets from their pinned Iconify JSON packages: `GET /icons/search` for the picker and `GET /icons?keys=…` for drawings, cached for a day. The help dialog credits both sets.
- **The icon picker** (`icon` widget, `panels/entity-form/fields/icon-field.tsx`) is the event categories table's Icon column: a button with the icon and its name opens a search over both sets, narrowed to one if wanted, in a grid of 60 results.
- **The icon atlas** (`render/icons/icon-atlas.ts`): the pins' icons rasterized once from their SVGs into a 1,024² canvas texture in 64 px cells, white on transparent; cell 0 is the "?" of a redacted pin.
- **`Pins`** (`render/pins/`): one instanced draw of camera-facing quads, 12 px in radius on screen, inside the globe's turning group so they tilt and spin with the surface. An event is a round pin in its category's color and icon; a place a diamond with a landmark icon; a redacted pin is grey with "?"; a draft is faded. Pins at the same point (a place and the events there) fan out east; pins located "at the body" stand in a ring at 70° north.
- **Picking:** pins are in the scene index (hover label, click selects and opens the panel, selection ring). A new `onSphere` on scene-index entries lets the picker leave out pins on the globe's far side as the camera turns; the globe hides them from view by the depth test.
- **Spoilers** (ux.md §6): a hidden spoiler entity is a grey "?" pin with a redacted label; a hidden location draws no pin and isn't in the scene index until spoilers are shown or the location is revealed in the panel's new **Location** section ("12.5° N, 40.2° W on Primus"), which blacks it out until then.
- **The info panel** opens places and events selected as pins; the orbit view's payload gained the map's `universeId`, which the pins need for the universe's categories.
- **Tests:** `apps/web/e2e/pins.spec.ts` (the three "Done when" checks on the demo seed, hover, click and the panel's location; the icon picker saving `game-icons:crossed-swords`), `apps/api/test/icons.int.test.ts`, `packages/domain/test/icons.test.ts`, `apps/web/test/pin-items.test.ts`.

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
- [x] E2E: adding an event on the globe at a clicked spot gives a stored lat/lon within 0.5° of the clicked point.
- [x] Editing every field, dragging the pin, deleting the event and undoing all work.
- [x] Adding a deep-space event in the galaxy view shows a diamond marker there.
- [x] An event at a place moves with the place when the place's pin is dragged.

**As built:**
- **Files** differ from the plan's "Where": the placing tools are `editor/located-placement.tsx` and `editor/pin-drag.tsx` (no `editor/tools/pin.ts`); the location editor is in `panels/location/`; the markers are `render/markers/`.
- **Adding:** the Add menu lists **Place** and **Event** in the orbit view, and **Event here** in the galaxy and system views (the levels registry's `located` entry). In the orbit view a click on the globe is turned into a latitude and longitude by a ray–sphere hit (`render/globe/globe-hit.ts`); in the other views it's a point on the work plane, in the system's frame, or the galaxy's for deep space. Creating the entity and setting its location is one batch, so one undo removes both. The new entity is selected, with its name focused.
- **Dragging a pin** (edit mode, orbit view) moves a pin on the surface along the sphere, previewed without a re-render of the payload (`state/pin-preview.ts`); events at a place follow their place's pin during the drag. Letting go saves one change, "Move “…”". A pin at the body, or an event at a place, isn't dragged itself.
- **The location editor** (`panels/location/location-editor.tsx`) replaces the Location section in edit mode. It offers the four modes, plus "Nowhere yet" for events:
  - on a surface: the body, latitude and longitude, and "Pick on the globe" in that body's orbit view;
  - at an object: any object in the view, or the view's own subject;
  - in space: x, y and z in the view's frame, and "Pick a point";
  - at a place: one of the map's places.

  It also has the location's spoiler switch. Each change is saved at once as one change in the history (`save-location.ts`).
- **The event form** shows the universe's date format notes as the date's hint (`hintFrom: 'dateFormatNotes'` in the registry), falling back to the generic hint.
- **Deleting** a selected pin or marker goes through the same Delete command as objects: view pins and markers carry their `version` for it.
- **Event markers** (`render/markers/`): the galaxy view's payload gained `markers`, the events in deep space or at one of its top-level objects; a system view's are the events in space in its frame. They're diamonds in their category's color and icon, 9 px in radius, drawn with the pins' instanced billboards (`render/pins/billboards.tsx`, now shared). A marker at an object stands 16 px right of and above it on screen, so it doesn't cover the object's glyph; scene-index entries gained `offsetPx` for this, which the picker, labels and selection rings apply. Spoilers work as for pins.
- **Tests:** `apps/web/e2e/locations.spec.ts` (the four "Done when" checks), `apps/web/test/marker-items.test.ts`, and a markers case in `apps/api/test/views.int.test.ts`.

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
