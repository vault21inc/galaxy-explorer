# Performance log

The performance budget in [rendering.md §2](../plan/rendering.md#2-performance-budget) is checked on one machine: the owner's Mac. This folder records that machine, how to measure, and the numbers over time. From M2-T8, `pnpm perf` writes a dated report here after each run.

## Reference machine

Recorded 2026-11-07.

| | |
|---|---|
| Mac | MacBook Pro, 16-inch, 2024 (`Mac16,5`) |
| Chip | Apple M4 Max: 16-core CPU (12 performance, 4 efficiency), 40-core GPU |
| Memory | 128 GB |
| macOS | 26.6.2 (25G83) |
| Built-in display | 16.2" Liquid Retina XDR, 3456 × 2234, ProMotion up to 120 Hz, device pixel ratio 2 |
| External display (main) | Alienware AW3225QF, 32" 4K QD-OLED at 240 Hz, scaled to look like 3008 × 1692 (device pixel ratio 2) |
| Browsers | Chrome 156.0.8078.81, Safari 26.6.2 |

**Two things to keep in mind about this machine:**

- **It's very fast.** An M4 Max passes budgets that an older or base-model laptop might not. Before calling a rendering change cheap, also try it with the "Low" quality setting (M2) or Chrome DevTools' CPU throttling.
- **The main display runs at 240 Hz.** While the camera moves, the app renders as fast as the display refreshes: 240 frames a second on the external display, 120 on the built-in one. That's four times the 60 fps the budget asks for, and four times the GPU work of a 60 Hz screen. Idle stays at 0 frames either way. Whether to cap the frame rate while moving is a question for M2-T8.

The budget names the built-in display as the reference (rendering.md §2), so measure there for the gate, and note the display with every set of numbers.

## Reading the HUD

Start the app (`pnpm dev`, see the [README](../../README.md#getting-started)) and open http://localhost:5173/?perf=1. The HUD sits in the bottom-left corner and refreshes twice a second. It never renders frames itself.

| Row | Meaning |
|---|---|
| fps | frames per second over the last 2 seconds, from the median frame time. **idle** means no frames were drawn: on-demand rendering doing its job. |
| frame ms | median / 95th-percentile time between consecutive frames, in milliseconds. It can't go below the display's refresh interval: 4.2 ms at 240 Hz, 8.3 ms at 120 Hz, 16.7 ms at 60 Hz. A frame that takes longer shows up as a larger number. |
| frames | frames rendered since the page loaded. If it climbs while you aren't touching anything, something is invalidating when it shouldn't. |
| draw calls | GPU draw commands in the last frame (budget: ≤ 50 in the galaxy view). |
| triangles, points | what the last frame drew. |
| geo / tex | geometries and textures currently on the GPU. These should stay level as you move around; steady growth means a leak. |
| dpr | the canvas's current device pixel ratio: 1.5 at rest, 0.75 while the camera moves (rendering.md §2, rule 2). |

## Taking a manual baseline

Until `pnpm perf` exists (M2-T8):

1. Use the built-in display, with the browser window full screen.
2. **Idle:** leave the page alone for 5 seconds. `fps` should read **idle**, and `frames` should stop changing. Activity Monitor's GPU History (Window › GPU History) should stay flat.
3. **Moving:** drag in slow circles for about 5 seconds without letting go, and read `fps`, `frame ms` and `dpr` while still dragging.
4. Repeat in Safari.
5. Add a row below, with the date, the commit (`git rev-parse --short HEAD`), the browser and the display.

## `pnpm perf`

Added in M2-T8 (rendering.md §14). Run it on the reference Mac, with nothing else heavy running, and with the browser windows on the built-in display: they open on the screen that has focus.

1. Builds the web app with the test hooks and starts it on port 4174, with its own API on 3103.
2. Resets the `ge_perf` database on the test server and seeds the stress map.
3. Drives a visible Google Chrome, then WebKit, along the scripted path:
   - loads the stress map, and times the first frame that shows the background, every body and region, and the depth stars;
   - sits idle for 3 s;
   - orbits, pans, and zooms toward the cursor (pointer steps 16 ms apart);
   - orbits again holding Space, with every label shown;
   - sits idle 3 s after each phase.
4. Writes `docs/perf/<date>-M2.md` (`PERF_LABEL` changes the milestone) with every budget of rendering.md §2 it can measure, and exits with an error if one is missed. Raw results stay in `scripts/perf/results/` (not committed).

Reading it:
- **Frame times can't beat the display.** On a 240 Hz external display the median is 4.2 ms; Playwright's WebKit draws at 60 Hz, so its median is one 16.7 ms frame.
- **WebKit rounds timers to whole milliseconds,** so its numbers carry ±1 ms. The 60 fps check allows that, and its label timings aren't judged.
- **Playwright's WebKit is not Safari.** It's the same engine, but a Safari reading with `?perf=1` on the built-in display is the real check (the owner's, in the milestone report).

## Baselines

### Empty canvas (M0)

The placeholder sky: 5,000 points in one draw call, no textures.

| Date | Commit | Browser | Display | Idle | Moving: fps | Moving: median / p95 frame | Draw calls | Points | Geo / tex | DPR at rest |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-07 | `9528aed` | Chrome 156 | external, 240 Hz | 0 frames (`idle`) | 238 | 4.2 / 4.7 ms | 1 | 5,000 | 1 / 0 | 1.5 |
| 2026-11-07 | `088875f` | not noted | built-in, 120 Hz | 0 frames (`idle`) | 120 | 8.3 / 9.0 ms | 1 | 5,000 | 1 / 0 | 1.5 (0.75 while moving) |

- The owner took these readings from the HUD. The display was the external one: 4.2 ms between frames means 240 Hz, faster than the built-in display can refresh.
- Frame times here only show that the empty canvas keeps up with the display. With nothing to draw, they say little about GPU cost. The useful numbers start with the stress map in M2.
- The moving reading showed `dpr 1.5`, not 0.75. The HUD's frame statistics cover the last 2 seconds, so they still showed the drag after the camera had stopped and the resolution had already gone back to 1.5.
- On the built-in display, the moving reading caught the lowered resolution: the HUD showed `dpr 0.8`, which is 0.75 rounded to one decimal. The HUD now shows two decimals.
- The second row's browser wasn't noted. Safari is still to be measured explicitly, by M2-T8 at the latest.

### Galaxy background (M2-T2)

The demo map's background: the baked disc, the core glow, 20,000 depth stars and the 5,000-star sky. No objects yet (M2-T3), so the stress map would look the same.

| Date | Commit | Browser | Display | Idle | Moving: fps | Moving: median / p95 frame | Draw calls | Points | Geo / tex | DPR at rest |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-08 | M2-T2 | Claude app's built-in browser (Chromium) | external, 240 Hz | 0 frames | 238 | 4.2 / 4.6 ms | 4 | 25,000 | 4 / 1 | 1.5 |

- Measured by the agent: `resetFrameStats()`, two left-drags across a 1247 × 1512 CSS px canvas, then `frameStats()` (191 frames). The display's refresh rate is still the limit.
- [Screenshot](screenshots/2026-11-08-M2-T2-galaxy.jpg): Playwright's Chromium at 1440 × 900, DPR 1, the starting camera.
- Not yet measured by the owner, in Safari, or on the built-in display.

### Bodies and regions (M2-T3)

The stress map: 5,000 objects (4,887 bodies in one draw call, 113 regions in one more) over the galaxy background.

| Date | Commit | Browser | Display | Idle | Moving: fps | Moving: median / p95 frame | Draw calls | Triangles | Points | Geo / tex | DPR at rest |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-08 | M2-T3 | Claude app's built-in browser (Chromium) | external, 240 Hz | 0 frames | 238 | 4.2 / 4.5 ms | 6 | 394,020 | 25,000 | 6 / 2 | 1.5 |

- Measured by the agent on `/u/stress-test/main`: `resetFrameStats()`, two left-drags and a wheel zoom across a 923 × 1512 CSS px canvas, then `frameStats()` (321 frames). Still display-limited.
- The background alone (M2-T2) was 4 draw calls at 4.2 / 4.6 ms.
- Not yet measured by the owner, in Safari, or on the built-in display; M2-T8's `pnpm perf` makes this repeatable.

### Picking, hover and selection (M2-T5)

| Date | Commit | Browser | Display | Idle | Moving: median / p95 frame | Draw calls | Notes |
|---|---|---|---|---|---|---|---|
| 2026-11-08 | M2-T5 | Playwright's Chromium, headed, 1440 × 900 | external, 240 Hz | 0 frames, also while hovering | 4.2 / 4.7 ms (744 frames) | 7 (6 + the rings) | stress map; three drags and wheel zooms; the same with 50 objects selected |

- **The picker** (`apps/web/test/screen-picker.test.ts`) over 5,000 stress-like objects at 1440 × 900: a rebuild takes 0.82 ms and a pick 0.16 µs.
- The rings are one draw call however many are selected: 2 triangles per ring.

### Labels (M2-T6)

| Date | Commit | Browser | Display | Labels | Label update: median / p95 | Frames: median / p95 | Draw calls |
|---|---|---|---|---|---|---|---|
| 2026-11-08 | M2-T6 | Playwright's Chromium, headed, 1440 × 900 | external, 240 Hz | 160–200 (Space held) | 0.7 / 1.1 ms (374 updates) | 4.2 / 4.7 ms | 7 |

- On the stress map: two drags and wheel zooms with every label shown.
- The first version took 2.1 / 2.4 ms, over the 2 ms budget. Most of that was sorting 5,000 candidates with a comparison function; fixes: a packed numeric rank sorted as a typed array, the picker's grid built only when picking, candidate objects reused, and text widths cached without building a key string.
- Headless Chromium (software rendering) draws the stress map at about 185 ms per frame; label updates there take about 1 ms.

### Galaxy view gate (M2-T8)

`pnpm perf` reports: [2026-11-08-M2.md](2026-11-08-M2.md), every measured budget met in Google Chrome 156 and Playwright's WebKit 27.2 on the stress map (windows on the 240 Hz external display). The owner's Safari 26 reading on the built-in display, stress map, High quality (DPR 2): 59 fps, 17.0 / 18.0 ms median / p95, 6 draw calls, idle afterwards. Safari holds pages near 60 fps on a 120 Hz display unless its "Prefer Page Rendering Updates near 60fps" feature flag is off; Chrome follows the display.
