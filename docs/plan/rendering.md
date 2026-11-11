# Rendering

How the three views are drawn, and the performance rules that keep them smooth on a laptop. Read §1 and §2 before touching anything in `apps/web/src/levels`, `src/render` or `src/input`.

## 1. three.js in ten concepts

This section is for the owner, who is new to three.js. It covers just enough to read the code and review agents' work.

1. **Scene graph.** three.js draws a tree of objects (meshes, points, lines, sprites). Each has a position, rotation and scale relative to its parent. React Three Fiber (R3F) lets us write that tree as JSX (`<mesh>`, `<group>`), and drei is a library of ready-made R3F components.
2. **Camera.** A perspective camera has a field of view and near and far clipping distances. Depth precision depends on the far/near ratio. Each of our three views has its own frame and units (§5), which keeps that ratio sane; one camera spanning galaxy-to-surface (about 17 orders of magnitude) would need tricks.
3. **Frames.** Each frame, the renderer draws the scene from the camera into the canvas. By default R3F does this 60–120 times per second forever. **We render only when something changes** (§3).
4. **Draw calls.** One draw call means one command to the GPU: "draw this geometry with this material". CPU cost grows with the number of draw calls, so we keep them in the tens.
5. **Instancing.** One draw call can draw thousands of copies of a geometry, each with its own position, size and color taken from a buffer. All the tiny spheres in the galaxy view are one instanced draw.
6. **Geometry, material, shader.** Geometry is triangles. A material decides each pixel's color. Under the hood every material is a pair of small GPU programs called shaders: a vertex shader places the triangles, and a fragment shader colors the pixels. Our custom effects (glow, atmosphere, minimum on-screen size) are short shaders with comments.
7. **Fill rate and pixel ratio.** Most GPU cost is per pixel drawn. A Retina screen has a device pixel ratio (DPR) of 2, which means four times the pixels. Overlapping transparent sprites and full-screen effects such as bloom multiply that again. **This combination is the usual reason a three.js page pegs a laptop's GPU.**
8. **Textures and mipmaps.** A texture is an image on the GPU. Mipmaps are pre-shrunk copies used for distant surfaces. We generate ("bake") planet and galaxy textures once instead of computing noise for every pixel every frame (§9).
9. **Picking.** three's `Raycaster` tests a ray against triangles. Tiny spheres are hard to hit that way, so we project object centers to the screen and pick the nearest one within a pixel radius instead (§10).
10. **Disposal.** GPU memory isn't garbage-collected. Geometries, materials, textures and render targets must be disposed when they're no longer used. R3F disposes what you declare in JSX when it unmounts; anything created with `new` needs explicit cleanup (§13).

## 2. Performance budget

These are **acceptance criteria**. A milestone that touches 3D isn't done until its performance check passes on the reference machine.

| Metric | Budget | How it's measured |
|---|---|---|
| Idle | **0 frames rendered** when nothing moves and ambient motion is off (the default) | `__GE_TEST__.frameCount` unchanged over 3 s; Activity Monitor › GPU History stays flat |
| Interaction | median ≥ 60 fps; 95th-percentile frame ≤ 25 ms during the scripted orbit, pan and zoom with the stress seed (5,000 objects, 300 groups, 50 routes) | `pnpm perf` |
| Reference machine | the owner's Mac (model recorded in `docs/perf/README.md` at M0), built-in display, latest Chrome and Safari, default quality | — |
| Draw calls | galaxy view ≤ 50, system view ≤ 80, orbit view ≤ 40 | `renderer.info.render.calls` in the dev HUD |
| First galaxy frame | ≤ 2 s locally; ≤ 4 s in production on broadband | Playwright timing |
| View transition | ≤ 700 ms, including data when cached | `pnpm perf` |
| GPU memory | stable within ±5 % after 20 galaxy → system → orbit round trips | `renderer.info.memory` |
| Initial JavaScript | ≤ 600 kB gzipped; each view's code is split into its own chunk | build report |

### Hard rules

1. **Render on demand.** The canvas uses `frameloop="demand"`. Anything that changes the picture calls `invalidate()`. Frames render continuously only while the camera moves or a transition plays; ambient motion (planet spin, cloud drift) is opt-in and capped at 30 fps.
2. **Cap the pixel ratio.** DPR is limited to 1.5 by default and drops during interaction (camera-controls' `regress` plus drei's `<AdaptiveDpr>`; the quality guard of §13 steps the setting down if frames stay slow). The picture is crisp when still and lighter while moving. Only the "High" quality setting allows 2.
3. **No per-frame React work.** Camera pose, hover, projected positions and label placement live in refs or zustand transient subscriptions, never in React state that re-renders components each frame.
4. **No allocations in `useFrame`.** Reuse vectors and matrices from module-level scratch objects.
5. **Instance or merge anything repeated more than about 20 times:** bodies, pins, selection rings, belt particles, orbit rings, group outlines, routes.
6. **No full-screen post-processing by default.** That means no bloom, SSAO or outline passes. Glow comes from additive billboard sprites with a pre-made radial gradient; selection is a ring sprite.
7. **No per-frame procedural noise.** Bake it into textures once (§9).
8. **Bound overdraw.** Point sprites and glows have a capped on-screen size (≤ 64 px), and transparent layers are few and small.
9. **Labels come only from the label layer** (§11): a pool of at most 200 elements. Never one drei `<Html>` per object.
10. **Hover picking at most once per frame,** with pointer events coalesced, using the screen-space picker.
11. **Size textures to their use:** at most 2,048 × 1,024 in the orbit view (4,096 × 2,048 on High) and 256 × 128 in the system view, always mipmapped. Uploaded images are resized on the server.
12. **Dispose of each view's resources on unmount,** checked by the M5 leak test.
13. Use `powerPreference: 'default'`, so dual-GPU Macs don't switch to the hot discrete GPU.
14. **Every rendering commit states its numbers:** draw calls and median and p95 frame time from the dev HUD and `pnpm perf`, before and after.

Each rule removes one of the usual causes of a hot, laggy three.js page: continuous rendering of a static picture, Retina pixel counts, full-screen effects, large overlapping transparent sprites, per-object HTML labels, and per-frame React re-renders.

## 3. Canvas and frame loop

```tsx
// apps/web/src/render/stage.tsx: one canvas for the whole app; views swap inside it
<Canvas
  frameloop="demand"
  dpr={quality.dprRange}                 // [1, 1.5] by default
  gl={{ antialias: quality.msaa, powerPreference: 'default', alpha: false }}
  camera={{ fov: 45, position: [0, 0, 1] }} // each view sets its own near/far and pose
  performance={{ min: 0.5 }}             // allow AdaptiveDpr to lower resolution while moving
  onCreated={({ gl }) => gl.setClearColor('#03050a')}
>
  <QualityGuard />                       // steps quality down when frames stay slow (§13)
  <AdaptiveDpr />
  <ViewHost />                           // renders the current view from the levels registry (§4)
  <FrameProbe />                         // counts frames for the HUD and test hooks (§14)
</Canvas>
<LabelLayer />                           // DOM overlay, sibling of the canvas (§11)
<TransitionOverlay />                    // the fade used between views (§4)
```

- drei's `<CameraControls>` invalidates on every camera update and transition, so moving the camera renders frames and stopping it stops them.
- Data changes invalidate through the stores: when a view payload or the selection changes, the affected renderer updates its buffers and calls `invalidate()` once.

## 4. Levels, renderers and transitions

- **`ViewHost`** reads the navigation store, `{ stack: [{ level, subjectId, cameraPose }] }`, and renders the top entry's level component, lazy-loaded from `src/levels/registry.ts`.
- **Each level component** fetches its view payload (TanStack Query) and renders background, bodies, outlines, routes and pins by asking the **renderer registry** (`src/render/registry.ts`) which component draws each base type in that view:

```ts
export const renderers = {
  galaxy: { system: SystemGlyphs, black_hole: BlackHoles, station: IconSprites, marker: IconSprites,
            default: InstancedBodies, nebula: RegionCloud, anomaly: RegionCloud },   // D-28, M4-T8
  system: { star: StarBody, planet: PlanetBody, asteroid_belt: AsteroidBelt,
            station: IconSprites, marker: IconSprites, default: InstancedBodies },
  orbit:  { subject: { planet: Globe, moon: Globe },               // O3: add station: StationModel later
            child:   { moon: PlanetBody, station: IconSprites, default: InstancedBodies } },
} satisfies RendererRegistry;
```

- **Entering a view** (S2) happens in three steps:
  1. The camera flies toward the object, about 260 ms with camera-controls' built-in transition (M5-T5 shortened the plan's 350 ms, fade 150 ms and ease 300 ms to 260, 120 and 220 ms, to meet the 700 ms budget). The next view's payload was already prefetched when the object became the zoom target.
  2. A 120 ms fade to black, during which the views swap.
  3. The new view's camera starts at its far "entry pose" and eases to its default pose while the fade clears, over 220 ms.

  The parent view's camera pose is saved on the navigation stack.
- **Leaving** does the same in reverse and restores the saved pose. A view opened from a link has no saved pose for its parent, so the parent's camera looks at the object just left instead (M5-T1).
- **The URL decides** which views are open (ux.md §9). Each address is resolved into a chain of views, and the transition controller (`render/transition/`) animates from what's shown to that chain, committing it to the stack behind the fade. Links, Back, Forward, breadcrumbs and Esc all go through it. If the address changes again mid-transition, the swap commits the latest chain.
- `prefers-reduced-motion` replaces both animations with a single quick fade.
- **When zoom triggers a switch** (S1):
  - **Enter:** the zoom target is explorable, the camera's distance to it drops below `enterDistance(target) = ENTER_FACTOR[level] × displayedRadius(target)`, and the zoom input accumulated after crossing that distance exceeds `ENTER_PUSH_PX` (about 120 px of wheel delta). The push requirement is hysteresis, so a trackpad flick doesn't jump views.
  - A progress ring around the target fills while the user pushes past the threshold, so entering feels intentional.
  - **Not explorable:** the zoom stops at `stopDistance(target)` and the info panel opens.
  - **Empty space:** the zoom stops at the view's minimum distance.
  - **Exit:** in a child view, zooming out past `exitDistance(level)` plus the same push hysteresis exits. Esc, the breadcrumb and the browser's back button exit immediately.
  - **Momentum guard:** wheel input is ignored for 400 ms after a transition starts, so trackpad inertia can't carry into the next view.
- **The zoom target** is the explorable or non-explorable object under the cursor (screen-space pick), otherwise the selection. While the cursor is over an object, the camera's orbit point moves to it, so zooming converges on it, as in Google Earth.
- **As built (M5-T2)**, `render/camera/zoom-gate.ts` sees every zoom step before camera-controls does:
  - Over a target, the gate zooms itself: it moves the camera along the line to the target, keeping its orientation. The target stays under the pointer and the step stops exactly at the limit. The camera's orbit point goes to the target's depth.
  - Over empty space, camera-controls zooms to the cursor as before. Zooming out is always camera-controls'.
  - The target stays the target while scrolling continues, even if the pointer drifts off it.
  - The limits are multiples of the target's drawn radius: `ENTER_DISTANCE_RADII` and `STOP_DISTANCE_RADII`, per view, in `tuning.ts`. The exit distance is the view's farthest camera distance.
  - The momentum guard also ignores the rest of any wheel stream that was flowing when the change started, until it pauses for 150 ms. Trackpad inertia can outlast 400 ms.
- All factors and durations live in `render/tuning.ts`.

## 5. Coordinate frames and cameras

| View | Frame and unit | Near / far | Distance limits | Horizon |
|---|---|---|---|---|
| Galaxy | galaxy frame, light-years | near = distance to target ÷ 1,000 (updated as the camera moves); far = distance + 3 × galaxy radius | min = stop distance of the target, or 20 ly; max = 3 × galaxy radius | the plane stays level: no roll; polar angle 5°–175° |
| System | system frame, system units (su) | 0.01 / 10,000 su | min = stop distance; exit beyond 3 × the system's extent | level, polar 5°–175° |
| Orbit | body frame, body radii | 0.01 / 1,000 | min 1.15 (just above the surface, whatever the target); starts far enough out to show every moon (1.9 × the farthest's reach); exit beyond 8, or 1.4 × the start distance when the moons reach further | free rotation around the globe; no roll |

Data is stored in the same frames (data-model.md §5), so no conversion happens between the database and the GPU.

## 6. Galaxy view

**Background** (`render/galaxy/`): generated from `map.galaxySettings` (G1). The owner shapes it in the Map settings panel, from named presets and sliders, including an optional central bar (M3-T8, D-24).

- **Disc:** one horizontal plane, 1.2 × the galaxy radius, with a texture baked once per settings hash (§9). The texture is a top-down log-spiral density with core, arm and dust colors, and an optional central bar along X whose ends the arms start from (D-24). It's drawn additively with depth writes off.
- **Live preview (M3-T8):** while a Map settings slider is dragged, the disc re-bakes the previewed settings at 512² into one reused render target, 150 ms after the last step; the full 2,048² bake goes through the cache only once the change is saved. The depth stars keep the saved settings and regenerate in the worker after the save. A drag therefore adds at most one texture.
- **Reference underlay (edit mode only):** one textured plane in the galactic plane, drawn first (render order −10) without depth testing or writing, so everything else lands on top.
- **Depth stars:** at most 20,000 `THREE.Points` sampled from the same density function by a seeded PRNG in a Web Worker. They form a thin disc plus a bulge, colored by radius, sized with attenuation but capped at 3 px. They're one draw call and give the disc thickness and parallax.
- **Core glow:** 1–3 large soft sprites, capped on-screen size.
- **Sky:** about 5,000 static points on a large sphere for the distant starfield; one draw call.
- **Underlay** (edit mode only): a textured plane at y = 0 using `map.underlay` placement and opacity, for tracing a reference map.

**Bodies** (`InstancedBodies`): one draw call for every top-level object that isn't a region.

- Geometry: an icosphere with detail 1 (80 triangles; they're tiny on screen).
- Per-instance attributes:
  - `aCenter`, `aRadius` from `resolveAppearance`;
  - `aColor`;
  - `aState` (0 normal, 1 redacted, 2 draft).
- A custom shader keeps every object **between `MIN_BODY_PX` and `MAX_BODY_PX` on screen**, so objects never vanish when zoomed out (Sins-style readability):

```glsl
// Keep each object between uMinPx and uMaxPx tall on screen, whatever the camera distance.
uniform float uPxToWorldAt1;   // world size of one pixel at distance 1 = 2 * tan(fov / 2) / viewportHeightPx
uniform float uMinPx;
uniform float uMaxPx;
attribute vec3 aCenter;        // world position (ly)
attribute float aRadius;       // world radius (ly)
void main() {
  vec4 centerView = viewMatrix * vec4(aCenter, 1.0);
  float pxToWorld = uPxToWorldAt1 * -centerView.z;            // world units per pixel at this depth
  float r = clamp(aRadius, uMinPx * pxToWorld, uMaxPx * pxToWorld);
  vec3 offset = mat3(viewMatrix) * (position * r);            // unit-sphere vertex scaled to r
  gl_Position = projectionMatrix * (centerView + vec4(offset, 0.0));
}
```

- Shading is a simple fake: a lit core plus a rim, with no scene lights needed.
- Redacted objects use the neutral redaction color.
- The CPU picker (§10) uses the same clamp, sharing constants from `tuning.ts`.

**Hover and selection visuals:** instanced ring billboards with the same pixel clamp, as a separate draw. Selecting never rewrites the main instance buffer.

**A look per kind of body** (D-28, M4-T8). `InstancedBodies` keeps planets and any base type without its own renderer. Three renderers take the rest, each one instanced draw call, all with the pixel clamp above (each with its own limits in `tuning.ts`), and each publishing to the scene index so picking, rings and labels work unchanged:

- **`SystemGlyphs`:** camera-facing quads showing a star system.
  - The star is a bright core and a soft halo, tinted by the system's resolved color and sized by its radius.
  - **Multi-star systems (D-29)** show up to 3 stars, from `stars` in the galaxy payload (each star's resolved color and its size relative to the largest), placed as a close pair or triangle at the glyph's center.
    - The atlas cell keeps each star's light in its own channel (red, green and blue: stars 1–3) and the rings and dots in alpha. The shader colors each channel with that star's per-instance color, so different-colored stars still take one texture and one draw.
    - A system without star objects is drawn as one star in the system's own color.
  - Around it are faint orbit rings, with one small dot on each for the system's planets: `planetCount` in the galaxy payload, capped at 6.
  - The glyph for each planet count (0–6) is baked once, in white, into one atlas (rendering.md §9); the shader picks the cell and tints it. A per-instance angle (from the id) turns each glyph, so neighbouring systems don't look stamped.
  - Static: the dots don't orbit, since ambient motion stays opt-in (§2).
- **`BlackHoles`:** camera-facing quads with a baked lensed-disc image, after NASA's visualization (an accretion disc seen near edge-on, its far side lensed over the shadow, its underside below, one side brighter from Doppler beaming).
  - The bake makes the image at four viewing elevations (0°, 30°, 60° and 90°, the last a ring seen from above) in one atlas.
  - The shader picks and blends the two nearest to the camera's elevation above the galactic plane, and turns the quad so the disc lies along the plane's on-screen direction.
  - Tinted by the black hole's color (default orange). Black holes get a larger on-screen maximum than other bodies, so the detail can be seen.
- **`IconSprites`:** small camera-facing icons for stations and markers from the icon atlas (§8, M6-T4). Until M6-T4 picks the icon set, two built-in shapes (a station ring and a marker diamond) are drawn into the atlas.

**Regions** (`RegionCloud`, nebulae and anomalies):

- 6–20 billboards per region with a baked soft-noise texture, scattered within `region.radius` and capped in on-screen size.
- Additive for nebulae; normal blending with darker tints for warp storms. Premultiplied-alpha blending does both in one draw call (M2-T3).
- One draw call for all regions: instanced quads with a per-instance region id and color.
- Picked as a projected circle.
- **Storms** (`shape: 'storm'`, M4-T6, D-25): large storms seen from above, such as the Eye of Terror. A flat disc in the galactic plane with a baked top-down texture (rim, darker core, radial filaments, gaps in the rim) or an uploaded image, plus a few billboards for depth. All storm discs share one draw call through a texture array (`DataArrayTexture`), whose layers are baked on the CPU once per set of settings. Discs are drawn double-sided in one pass, without the depth test.
- **Rifts** (`shape: 'rift'`, M4-T6): bands along a curve, such as the Great Rift. The curve is a Catmull-Rom spline through the rift's points (`@ge/domain` geo/rift.ts). Billboards spread evenly by length along it join `RegionCloud`'s draw call; one merged ribbon mesh draws every rift's flat band. Picked by distance to the projected curve, within its on-screen half-width.
- All regions together: at most 3 draw calls.

**Group outlines** (`GroupOutlines`):

- `outlineForGroup()` in `packages/domain/src/geo/outline.ts` computes the outline:
  1. Take the members' (x, z) positions, including members of descendant groups.
  2. Compute their convex hull.
  3. Offset it outward by `padding` with round joins (arc segments every 15°).
  4. Smooth it with two passes of Chaikin smoothing.

  One member gives a circle and two give a capsule, with no special cases.
- Padding grows with the number of nesting levels beneath the group, so a sector's outline clearly encloses its sub-sectors' outlines.
- The outline sits at the members' mean height.
- **Merge all outlines into one `LineSegments2` for solid lines and one for dashed lines**, with per-vertex colors (pixel widths via `LineMaterial`, with a per-segment width attribute so each group keeps its own width). Fills go into one mesh with vertex colors and alpha, drawn in a single pass. That's two to three draw calls for any number of groups.
- Padding and nesting padding are shares of the galaxy's radius (`tuning.ts`), and dashes are scaled to stay about 10 px on screen.
- Outlines rebuild only when groups, memberships or positions change.
- The group label is anchored at the polygon's area centroid and handled by the label layer.

**Routes:** the same merged-line approach, from waypoint positions; dashed or solid per `RouteStyle`.

- As built (M4-T7): `RouteLines` draws every route in two calls (solid and dashed), over the group outlines and under the bodies. A route of n waypoints is n − 1 segments; routes don't join.
- While objects are dragged, the segment ends at them are shifted in place, so the lines follow the drag without a rebuild.
- Each route is in the scene index as a curve through its waypoints, picked within 6 px of its line (bodies on it win, regions lose), and left out of box selection.
- Its label sits at the middle of its middle segment, in the route's color, and shows in the label layer's `groups` and `all` modes. A selected route rings its waypoints.

## 7. System view

- **Stars:**
  - a sphere with a baked granulation texture;
  - a color from `appearance.star.temperatureK` (blackbody table);
  - a glow billboard;
  - one `PointLight` per star, up to 3, so a binary or triple lights its planets from each star (D-29). More stars are drawn but unlit.
- **Planets:** spheres with 32 × 16 segments and 256 × 128 baked textures from the same planet baker as the orbit view (§9). Before M6 lands they use a flat color. Rings are drawn when enabled.
- **Orbit rings:** a circle for each child, at its distance in the X/Z plane from what it orbits: its `orbitCenterId` star if it has one (an S-type orbit in a binary, D-29), otherwise the system's center. They're merged into one `LineSegments2`, with a per-object toggle `appearance.showOrbit` (default true for planets).
- **Asteroid belts:** one instanced draw per belt, at most 2,000 seeded rocks in a torus band.
- **Stations and markers:** instanced icon billboards from the icon atlas (§8, pins).
- **Background:** the sky points, plus a dim band of the galaxy disc texture.
- **Children of planets** (moons, stations, markers) are shown beside their planet: the system view's payload carries them as `satellites`, in their planet's orbit frame, and the client places them at their orbit-view distance counted in the planet's system-view radii (`SYSTEM_SATELLITE_SPREAD`), drawn by the same renderers in the same draw calls. They can be selected and entered, but not moved here: their positions belong to their planet's frame, so they're moved in its orbit view. (Before the owner's review of M6-T3 they weren't shown here at all.)
- **As built (M5-T3):**
  - Star colors come from the blackbody table in `resolveAppearance`.
  - The stars' lights are uniforms of the planet and belt shaders, not `PointLight`s.
  - All belts share one draw call.
  - The background band is procedural.
  - The milestone file has the details.

## 8. Orbit view

- **Globe** (`Globe`): a sphere with 128 × 64 segments and a custom material:
  - the baked albedo, or the uploaded `surface_texture`;
  - Lambert lighting from the star direction, which is the system star's position relative to the body, or a default when the body has no system;
  - the baked night-lights mask, shown only where the surface faces away from the star;
  - optional specular highlights on oceans, using the bake's ocean mask.
- **Light:** the orbit view's payload names the direction to the star that lights the body and its color (`sunlight`, M6-T3); a body outside any system is lit from a dim default direction. Light fades in across the terminator with an S-curve (`GLOBE_TERMINATOR_WRAP`), and every part goes through the same exposure curve as the system view's planets.
- **Atmosphere:** a slightly larger back-face sphere with a Fresnel rim shader: one draw.
- **Clouds:** a sphere at 1.01 radii with a baked alpha texture. It's static unless ambient motion is on.
- **Rings:** `RingGeometry` with a baked radial gradient, tilted with the body.
- **Moons and stations:** drawn with the system-view renderers at orbit scale. A moon is clickable, and if it's explorable it opens its own orbit view (O4).
- **Pins** (`Pins`) for places and events located on this body:
  - one instanced draw of camera-facing quads;
  - icons from an **icon atlas**: category icons rasterized once at startup into a 1,024² canvas texture, 64 px cells;
  - each pin lifted 0.5 % above the surface along the normal, at a constant pixel size;
  - hidden behind the globe by the normal depth test;
  - per-instance attributes: atlas cell, color, state (normal, hovered, selected, redacted, draft).
- **Placing pins** (edit mode): an analytic ray–sphere intersection gives the hit point, which `latLonFromVector()` converts to coordinates (`packages/domain/src/geo`).

## 9. Baking procedural textures

Procedural looks are generated once on the GPU and reused (D-10):

- `bake(materialDef, params, width, height) → THREE.Texture`:
  1. Render one full-screen quad with the generator shader into a `WebGLRenderTarget`.
  2. Generate mipmaps.
  3. Return the target's texture.

  This takes milliseconds per texture.
- **Planet presets are data** (`packages/domain/src/planet-presets.ts`): palette stops, noise frequency and octaves, sea level, and special layers such as a city-grid light mask for hive and forge worlds or emissive lava cracks. The generator shader reads them as uniforms, so adding a preset needs no shader change.
- Outputs per planet: albedo (RGB), plus night lights, clouds and ocean mask when the appearance enables them.
- Galaxy bakes: the disc texture (2,048², top-down) and the region noise sprite.
- **Cache:** an LRU keyed by `hash(params, size)`, holding at most 48 textures by default. Evicted textures are disposed. A mid-range Mac recomputes a bake in under 50 ms, so nothing is persisted between sessions.
- Edits to appearance re-bake on change at most every 150 ms (the first change at once, then the latest one every 150 ms while a slider moves), so sliders feel live without re-baking on every tick.
- **Texel layout:** a planet bake's first and last columns both lie on the ±180° meridian and its first and last rows on the poles (texel x shows u = x / (width − 1)), so its edges match exactly where they meet around the globe. Renderers sample with the same mapping.
- **System view:** each planet's 256 × 128 surface is one layer of an array texture, so all planets stay in one draw call (M6-T2).

## 10. Picking

- **`ScreenPicker`** (`render/picking/`):
  - It's rebuilt once per rendered frame in which the camera or data changed. In practice it's rebuilt lazily, at the next pick after such a frame (M2-T5): 0.8 ms for 5,000 items.
  - It projects every pickable item in the current view into a `Float32Array` of screen x, screen y and pick radius in px. Pickables are body centers, region circles, pins and route midpoints.
  - It buckets them into a 64 px uniform grid.
  - A pointer move finds the nearest item within `max(radiusPx, 10 px)` by checking neighboring grid cells: O(1) on average, under 1 ms for 5,000 items.
- **Box selection** tests projected centers against the rectangle.
- **Group outlines** are picked through their label (a DOM hit area) or through the outliner. Clicks inside an outline select objects, not the group.
- **Object labels** are pick targets too: pointing at a label is pointing at its object, for hover, click, double-click and drag (`label-hits.ts`). The hit area reaches back across the gap to the body, so the pointer can move from a body to its label without the hover ending. A body under the pointer whose pick circle is at most 30 px across wins over a label drawn across it; over anything wider (a belt's band, a rift, a route) the label wins.
- **Placing objects:** a ray–plane intersection with the work plane (y = 0, or the height of the selection being moved). **Placing pins:** a ray–sphere intersection (§8).

## 11. Labels

- **`LabelLayer`** is a DOM overlay above the canvas with a pool of 200 absolutely positioned `<div>`s, reused.
- After each rendered frame, `solveLabels()` (pure, unit-tested) picks which labels to show:
  1. **Candidates** depend on the label mode (L key):
     - `hover`: the default; hovered and selected items only;
     - `groups`: adds group labels;
     - `all`: adds every visible object, and is also active while Space is held.
  2. **Priority:** selected > hovered > groups (larger groups first) > objects by `labelPriority`, then by on-screen size.
  3. **Placement:** greedy, to the right of the body's on-screen radius plus 4 px. A label is skipped if its rectangle overlaps a placed one; a grid index makes this fast. Text widths are measured once per string with `CanvasRenderingContext2D.measureText` and cached.
- Placement updates only `transform: translate3d(…)`. Text content changes only when a pooled element is reassigned.
- The update runs after each rendered frame (R3F's `addAfterEffect`), when the camera matrices match the frame just drawn. In `all` mode it reuses the picker's projection. Candidates are ranked by one packed number and sorted as a typed array, to stay within 2 ms with 5,000 candidates (M2-T6).
- Text comes from `labelText(item, spoilerPolicy)`. Hidden spoilers render as a redaction bar of similar length.
- Group labels are uppercase with letter spacing, in the group's color. Object labels are smaller and a soft white.
- Every label has a dark outline: a 3 px stroke painted under the text (`-webkit-text-stroke` with `paint-order: stroke fill`), so about 1.5 px shows around each glyph, plus a soft shadow. That keeps names readable over the bright core and dense star fields, in Chrome and Safari alike. Before, labels had only a soft shadow, which bright backgrounds washed out.
- Labels are `aria-hidden`: the outliner is the accessible list of the same items (ux.md §10).

## 12. Camera controls

drei's `<CameraControls>` (the camera-controls library) is configured per view:

- `smoothTime` 0.2 s, `draggingSmoothTime` 0.1 s;
- `dollyToCursor = true`, `infinityDolly = false`;
- polar and distance limits from §5;
- `azimuthRotateSpeed` and `polarRotateSpeed` 1.0, `dollySpeed` tuned separately for wheels and trackpads after playtesting.

Input mapping comes from the bindings table (ux.md §3). camera-controls has no modifier-key support, so **`useInputBindings` reassigns `controls.mouseButtons` and `controls.touches`** whenever the view/edit mode or the held modifiers change. For example, while Option/Alt is held, `left` becomes `ROTATE`. In edit mode, `left` becomes `NONE` (the editor's pointer handlers own it) unless a modifier says otherwise.

- **Keyboard:** arrow keys pan (`truck`), `+`/`−` zoom (`dolly`), Home or H resets the view, and F frames the selection (`fitToSphere`).
- **Pivot:** selecting an object sets the orbit point to it (`setOrbitPoint`); otherwise zoom-to-cursor moves the target.
- **Wheel input:** `deltaMode` values (lines or pages) are converted to pixels before reaching the controls, and ctrl+wheel (pinch) is scaled so pinch and wheel feel alike. Test this in Safari specifically.
  - The app intercepts every wheel event and re-sends it in pixels without `ctrlKey`, because camera-controls turns ctrl+wheel into a field-of-view zoom (M2-T4).
  - Safari's `gesturechange` pinch events become the same wheel events.
- **Target bounds:** zooming toward the cursor moves the target, so each view bounds it (`setBoundary`). The galaxy view keeps it within ±0.05 radii of the plane, so it can't sink through the disc (M2-T4).

## 13. Resource lifecycle and quality settings

- **Lifecycle:**
  - Views are lazy-loaded components. Their JSX-created resources are disposed by R3F on unmount.
  - Anything created with `new` inside a hook (render targets, `DataTexture`, merged geometries) is disposed in that effect's cleanup.
  - App-wide resources (icon atlas, glow sprite, sky) live in `render/shared-resources.ts` and are disposed only on app teardown.
  - The bake cache disposes on eviction.
- **Quality settings:** stored per browser and changed in a settings popover.

| Setting | DPR | MSAA | Star points | Orbit texture | Notes |
|---|---|---|---|---|---|
| Low | 1 | off | 8,000 | 1,024 × 512 | for older or Intel Macs |
| Medium (default) | ≤ 1.5, lower while moving | on | 20,000 | 2,048 × 1,024 | |
| High | ≤ 2 | on | 40,000 | 4,096 × 2,048 | |

  The quality guard steps down one setting if the median fps stays below 45 for 2 seconds of interaction, and shows a small notice. It never steps up automatically.
  - It's our own `FrameRateGuard` (M2-T8), not drei's `PerformanceMonitor`. That one counts frames per 250 ms window and keeps its first timestamp across idle time, so under on-demand rendering every pause would read as a low frame rate. The guard measures intervals between rendered frames and skips idle gaps, as the HUD does.
  - It's off under automation (`navigator.webdriver`), so tests and `pnpm perf` measure the default quality.
- **Galaxy stars:** the same popover has two sliders, Number and Brightness (0–100 %, both 100 % by default). They're remembered per browser (`ge.stars`), so a reader can calm a busy star field without lowering the quality.
  - Number draws only the first share of the depth stars, through the geometry's draw range. The stars were generated in random order, so that thins them evenly, and nothing is regenerated.
  - Brightness scales the stars' alpha, which under additive blending scales their light.
  - At 0 the points aren't drawn at all, one draw call fewer.

## 14. Test hooks and performance measurement

`window.__GE_TEST__` exists in development builds and in e2e builds (`VITE_TEST_HOOKS=1`), never in production:

```ts
interface GeTestHooks {
  frameCount: number;                                  // incremented once per rendered frame
  level(): { level: 'galaxy' | 'system' | 'orbit'; subjectId: string | null } | null; // null subject: the galaxy view
  transitioning(): boolean;                            // a change of view is resolving or running
  selectedIds(): string[];
  hoveredId(): string | null;
  visibleLabels(): { id: string; text: string }[];
  screenPositionOf(id: string): { x: number; y: number } | null;   // CSS px, for clicking in tests
  screenRadiusOf(id: string): number | null;                       // CSS px, with the renderer's clamp (M2-T3)
  drawnObject(id: string): { renderer: string; state: 'normal' | 'redacted' | 'draft'; color: string; … } | null;
  cameraPose(): { position: [number, number, number]; target: [number, number, number] };
  renderInfo(): { calls: number; triangles: number; geometries: number; textures: number };
  flyTo(id: string): Promise<void>;
  enter(id: string): Promise<void>;
  exit(): Promise<void>;
  frameStats(): { count: number; medianMs: number; p95Ms: number };  // since the last reset
  resetFrameStats(): void;
}
```

- **E2E tests** click and drag at `screenPositionOf(id)` with real mouse events, then assert through the hooks: for example, after a double-click, `level()` is `system`.
- **`pnpm perf`** (Playwright, headed, on the owner's Mac; `scripts/perf/`, M2-T8):
  1. Seeds the stress map.
  2. Runs a scripted 20 s path: orbit, pan, zoom to cursor, enter a system, enter a planet, exit twice.
  3. Records `frameStats()` and `renderInfo()` per phase.
  4. Checks the budgets in §2.
  5. Writes a dated report to `docs/perf/`.
- **Dev HUD** (`?perf=1`, development only): `render/perf-hud.tsx`, a small DOM overlay showing fps, median and p95 frame time, total frames, draw calls, triangles, points, geometries and textures on the GPU, and the current DPR. It reads the same numbers as the test hooks and polls twice a second, so it never renders frames itself; a still scene reads "idle". (r3f-perf was planned, but it hasn't been updated for React 19 and R3F 9.)

## 15. Later: WebGPU and 3D models

- **WebGPU:** three's `WebGPURenderer` and its shading language (TSL) can replace WebGL2 once drei's components used here support it. Custom shaders are few and isolated in `render/materials/` to keep that port small.
- **Stations, ships and uploaded 3D models (O3):**
  1. Add a `ModelRenderer` (drei `useGLTF` with meshopt or Draco compression, levels of detail).
  2. Register it under `renderers.orbit.subject.station`.
  3. Set `explorableAs: 'orbit'` for `station` in `objectTypes`.
  4. Add an asset role `model`.

  No other code changes.
- **Asteroid fields as subjects** follow the same path with an instanced-rock renderer.
