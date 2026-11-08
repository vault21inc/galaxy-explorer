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

Added in M2-T8 (rendering.md §14). It will:
1. seed the stress map (5,000 objects, 300 groups, 50 routes);
2. run a scripted 20-second camera path in a real, visible browser;
3. check the numbers against the budget;
4. write a dated report to this folder.

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
