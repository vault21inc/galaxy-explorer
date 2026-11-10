import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { FrameStats, PerfResult, PhaseResult, RenderInfo } from './shared.ts';
import { EDIT_SELECTION, PERF_MODE, REPO_ROOT, RESULTS_DIR } from './shared.ts';

/**
 * The scripted path (rendering.md §14), galaxy view only until M5 adds entering and leaving
 * views: load the stress map, sit idle, orbit, pan, zoom toward the cursor, then orbit with
 * every label shown. Each phase records frame times and the renderer's counters through
 * `window.__GE_TEST__`; report.ts checks them against the budgets.
 *
 * With `--edit` (PERF_MODE=edit, the M3 acceptance) the same path runs in edit mode, with a
 * reference underlay shown and 100 objects selected (their rings, the height gizmo, the
 * outliner and the panel all on screen). Plain left-drags draw a selection box in edit mode, so
 * the orbits hold Alt, the editor's orbit modifier (ux.md §3).
 */

/** The parts of the test hooks this script uses (apps/web/src/render/test-hooks.ts). */
interface Hooks {
  frameCount: number;
  renderInfo(): RenderInfo | undefined;
  frameStats(sinceMs?: number): FrameStats;
  resetFrameStats(): void;
  labelStats(): FrameStats;
  resetLabelStats(): void;
  visibleLabels(): unknown[];
  underlay(): unknown;
  selectedIds(): string[];
}
declare global {
  interface Window {
    __GE_TEST__?: Hooks;
  }
}

const MAP = '/u/stress-test/main';
/** Pointer moves are spaced like a hand's: one per display frame at 60 Hz. */
const STEP_MS = 16;

async function evaluateHooks<T>(page: Page, body: string): Promise<T> {
  return page.evaluate<T>(`(() => { const h = window.__GE_TEST__; return ${body}; })()`);
}

async function waitForIdle(page: Page, quietMs = 1_000) {
  let last = await evaluateHooks<number>(page, 'h.frameCount');
  for (;;) {
    await page.waitForTimeout(quietMs);
    const now = await evaluateHooks<number>(page, 'h.frameCount');
    if (now === last) return;
    last = now;
  }
}

async function framesDuring(page: Page, durationMs: number) {
  const before = await evaluateHooks<number>(page, 'h.frameCount');
  await page.waitForTimeout(durationMs);
  return (await evaluateHooks<number>(page, 'h.frameCount')) - before;
}

/** The display's refresh rate, from the median interval of 120 animation frames. */
async function refreshRate(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((done) => {
        const times: number[] = [];
        const tick = (now: number) => {
          times.push(now);
          if (times.length < 121) {
            requestAnimationFrame(tick);
            return;
          }
          const gaps = times.slice(1).map((time, i) => time - (times[i] ?? time));
          gaps.sort((a, b) => a - b);
          done(Math.round(1_000 / (gaps[60] ?? 16.7)));
        };
        requestAnimationFrame(tick);
      }),
  );
}

const EDITING = PERF_MODE === 'edit';

async function drag(
  page: Page,
  from: { x: number; y: number },
  by: { x: number; y: number },
  button: 'left' | 'right' = 'left',
  steps = 60,
) {
  // In edit mode a plain left-drag selects; Alt makes it orbit, as in view mode.
  const orbitKey = EDITING && button === 'left';
  if (orbitKey) await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (by.x * i) / steps, from.y + (by.y * i) / steps);
    await page.waitForTimeout(STEP_MS);
  }
  await page.mouse.up({ button });
  if (orbitKey) await page.keyboard.up('Alt');
}

/**
 * Edit mode's extras, set up through the API before the page loads: an uploaded image as the
 * map's underlay (shown), and the ids of the first 100 objects to select. Returns those ids.
 */
async function prepareEditMode(request: APIRequestContext): Promise<string[]> {
  const json = async (url: string) => (await (await request.get(url)).json()) as { data: unknown };
  const universes = (await json('/api/v1/universes')).data as { id: string; slug: string }[];
  const universe = universes.find((item) => item.slug === 'stress-test');
  if (!universe) throw new Error('No stress-test universe: did the seed run?');
  const [map] = (await json(`/api/v1/universes/${universe.id}/maps`)).data as {
    id: string;
    version: number;
  }[];
  if (!map) throw new Error('The stress universe has no map.');

  const image = readFileSync(resolve(REPO_ROOT, 'apps/web/e2e/fixtures/nebula.png'));
  const upload = await request.post(`/api/v1/universes/${universe.id}/assets`, {
    multipart: { file: { name: 'underlay.png', mimeType: 'image/png', buffer: image } },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const asset = ((await upload.json()) as { data: { id: string } }).data;
  const patched = await request.patch(`/api/v1/maps/${map.id}`, {
    data: {
      version: map.version,
      underlayAssetId: asset.id,
      underlay: {
        widthLy: 120_000,
        rotationDeg: 0,
        offsetX: 0,
        offsetZ: 0,
        opacity: 0.5,
        visible: true,
      },
    },
  });
  expect(patched.ok(), await patched.text()).toBe(true);

  const view = (await json(`/api/v1/maps/${map.id}/views/galaxy`)).data as {
    objects: { id: string }[];
  };
  return view.objects.slice(0, EDIT_SELECTION).map((object) => object.id);
}

async function wheel(page: Page, at: { x: number; y: number }, deltaY: number, ticks: number) {
  await page.mouse.move(at.x, at.y);
  for (let i = 0; i < ticks; i++) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(STEP_MS);
  }
}

test('the galaxy view stays within its budgets', async ({ page, browser }, testInfo) => {
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  const phases: Record<string, PhaseResult> = {};
  const idleFrames: number[] = [];
  let maxDrawCalls = 0;

  const renderInfo = async () => {
    const info = await evaluateHooks<RenderInfo>(page, 'h.renderInfo()');
    maxDrawCalls = Math.max(maxDrawCalls, info.calls);
    return info;
  };
  let labelsShown = 0;
  const phase = async (name: string, run: () => Promise<void>, withLabels = false) => {
    await evaluateHooks(page, '(h.resetFrameStats(), h.resetLabelStats(), 0)');
    await run();
    await waitForIdle(page);
    const result: PhaseResult = {
      frames: await evaluateHooks<FrameStats>(page, 'h.frameStats()'),
      render: await renderInfo(),
    };
    if (withLabels) {
      result.labels = {
        ...(await evaluateHooks<FrameStats>(page, 'h.labelStats()')),
        shown: labelsShown,
      };
    }
    phases[name] = result;
    idleFrames.push(await framesDuring(page, 3_000));
  };

  // The display, measured on a page that draws nothing.
  await page.goto('/');
  const refreshHz = await refreshRate(page);

  // First galaxy frame: from navigation until a frame shows the background, every body and
  // region, and the depth stars (6 draw calls, 25,000 points). Measured in the page, on its
  // own clock, which starts at navigation.
  const selection = EDITING ? await prepareEditMode(page.request) : [];
  await page.goto(EDITING ? `${MAP}?select=${selection.join(',')}` : MAP);
  const firstFrame = await page.waitForFunction(
    () => {
      const info = window.__GE_TEST__?.renderInfo();
      return info && info.calls >= 6 && info.points >= 25_000 ? performance.now() : false;
    },
    undefined,
    { polling: 'raf', timeout: 60_000 },
  );
  const firstFrameMs = (await firstFrame.jsonValue()) as number;
  await waitForIdle(page);
  if (EDITING) {
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__GE_TEST__?.underlay() !== null, undefined, {
      timeout: 30_000,
    });
    expect(await evaluateHooks<number>(page, 'h.selectedIds().length')).toBe(EDIT_SELECTION);
    await waitForIdle(page);
  }
  const start = await renderInfo();
  idleFrames.push(await framesDuring(page, 3_000));

  // Orbit, pan and zoom together are "interaction" (rendering.md §2); each also gets its own row.
  const interactionStart = await evaluateHooks<number>(page, 'performance.now()');
  await phase('orbit', async () => {
    for (let i = 0; i < 3; i++) {
      await drag(page, { x: center.x - 300, y: center.y }, { x: 600, y: i === 1 ? -120 : 80 });
    }
  });
  await phase('pan', async () => {
    await drag(page, { x: center.x - 250, y: center.y }, { x: 500, y: 150 }, 'right');
    await drag(page, { x: center.x + 250, y: center.y + 150 }, { x: -500, y: -150 }, 'right');
  });
  await phase('zoom', async () => {
    for (const at of [center, { x: center.x - 300, y: center.y + 120 }]) {
      await wheel(page, at, -100, 25);
      await wheel(page, at, 100, 25);
    }
  });
  const interaction = await evaluateHooks<FrameStats>(
    page,
    `h.frameStats(${interactionStart.toString()})`,
  );
  await phase(
    'labels',
    async () => {
      await page.keyboard.down(' ');
      await page.waitForTimeout(300);
      await drag(page, { x: center.x - 300, y: center.y }, { x: 600, y: 60 });
      await drag(page, { x: center.x + 300, y: center.y }, { x: -600, y: -60 });
      // Counted while Space is still held: releasing it hides them.
      await waitForIdle(page);
      labelsShown = await evaluateHooks<number>(page, 'h.visibleLabels().length');
      await page.keyboard.up(' ');
    },
    true,
  );
  const end = await renderInfo();

  const result: PerfResult = {
    project: testInfo.project.name,
    mode: PERF_MODE,
    ...(EDITING
      ? {
          edit: {
            selected: await evaluateHooks<number>(page, 'h.selectedIds().length'),
            underlay: await evaluateHooks<boolean>(page, 'h.underlay() !== null'),
          },
        }
      : {}),
    browserVersion: browser.version(),
    refreshHz,
    viewport: { ...viewport, deviceScaleFactor: testInfo.project.use.deviceScaleFactor ?? 1 },
    firstFrameMs,
    idleFrames,
    phases,
    interaction,
    maxDrawCalls,
    memory: { start, end },
    objects: await page.evaluate(async () => {
      const universes = (await (await fetch('/api/v1/universes')).json()) as {
        data: { id: string; slug: string }[];
      };
      const universe = universes.data.find((item) => item.slug === 'stress-test');
      const maps = (await (await fetch(`/api/v1/universes/${universe?.id ?? ''}/maps`)).json()) as {
        data: { id: string }[];
      };
      const view = (await (
        await fetch(`/api/v1/maps/${maps.data[0]?.id ?? ''}/views/galaxy`)
      ).json()) as {
        data: { objects: unknown[] };
      };
      return view.data.objects.length;
    }),
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(
    resolve(RESULTS_DIR, `${testInfo.project.name}.json`),
    JSON.stringify(result, null, 2),
  );
  // The run fails only on missing data; report.ts judges the budgets.
  expect(result.objects).toBe(5_000);
});
