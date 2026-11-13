import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { FrameStats, RenderInfo, SystemResult } from './shared.ts';

/**
 * The system view's part of `pnpm perf` (M5-T5, rendering.md §2, §14): entering and leaving a
 * busy system (the transitions' times), orbiting and zooming inside it, 20 galaxy ↔ system
 * round trips for GPU memory, and 20 galaxy → system → orbit round trips through one of its
 * planets (M6-T3). path.spec.ts runs it after the galaxy phases, in view mode.
 *
 * The round trips are the leak tests: they run here, on the reference Mac's GPU, not in CI,
 * where software rendering made them slow and timing-sensitive.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** Round trips for the memory check (rendering.md §2: "20 galaxy → system → orbit"). */
const ROUND_TRIPS = 20;
/** Entries and exits timed; the first entry also loads the system view's code and data. */
const TIMED_TRIPS = 3;

/** The planet entered for the orbit round trips: one of the 12, explorable, with a moon. */
const ORBIT_PLANET = 3;
/** Places and events on that planet's globe, so the orbit view draws pins (M6-T8). */
const PERF_PLACES = 4;
const EVENTS_PER_PLACE = 3;

/**
 * Makes the stress map's first system a busy one, through the API before the page loads: M5-T3's
 * test system, with 1 star, 12 planets (one ringed, one explorable with a moon), 2 belts and 5
 * stations, marked explorable. The map's top level is unchanged, so the galaxy phases see the
 * same 5,000 objects. Returns the system and the planet to enter.
 */
export async function prepareSystem(
  request: APIRequestContext,
): Promise<{ systemId: string; planetId: string }> {
  const json = async (url: string) => (await (await request.get(url)).json()) as { data: unknown };
  const universes = (await json('/api/v1/universes')).data as { id: string; slug: string }[];
  const universe = universes.find((item) => item.slug === 'stress-test');
  if (!universe) throw new Error('No stress-test universe: did the seed run?');
  const [map] = (await json(`/api/v1/universes/${universe.id}/maps`)).data as { id: string }[];
  if (!map) throw new Error('The stress universe has no map.');
  const view = (await json(`/api/v1/maps/${map.id}/views/galaxy`)).data as {
    objects: { id: string; baseType: string; version: number }[];
  };
  const system = view.objects.find((object) => object.baseType === 'system');
  if (!system) throw new Error('The stress map has no system.');

  const inside = (name: string, baseType: string, extra: object = {}) => ({
    op: 'create',
    kind: 'celestial_object',
    mapId: map.id,
    data: { name: plain(name), baseType, parentId: system.id, ...extra },
  });
  // Loosely typed: the batch takes many shapes of operation (the API checks each).
  const operations: object[] = [
    {
      op: 'update',
      kind: 'celestial_object',
      id: system.id,
      version: system.version,
      data: { explorable: true },
    },
    inside('Perf Sun', 'star'),
    ...Array.from({ length: 12 }, (_, i) => {
      const angle = i * 2.4;
      const distance = 1.2 + i * 0.8;
      return inside(`Perf ${(i + 1).toString()}`, 'planet', {
        x: distance * Math.cos(angle),
        z: distance * Math.sin(angle),
        ...(i === 5 ? { appearance: { planet: { rings: { enabled: true } } } } : {}),
        ...(i === ORBIT_PLANET
          ? {
              explorable: true,
              appearance: { planet: { preset: 'ocean', clouds: { enabled: true } } },
            }
          : {}),
      });
    }),
    // The update is operation 0 and the star 1, so the planets start at 2.
    {
      op: 'create',
      kind: 'celestial_object',
      mapId: map.id,
      data: {
        name: plain('Perf Moon'),
        baseType: 'moon',
        parentId: `$op:${(2 + ORBIT_PLANET).toString()}`,
        x: 3,
        z: 1,
      },
    },
    inside('Inner Belt', 'asteroid_belt', { x: 4 }),
    inside('Outer Belt', 'asteroid_belt', { x: -11 }),
    ...Array.from({ length: 5 }, (_, i) =>
      inside(`Station ${(i + 1).toString()}`, 'station', { x: 2 + i, z: 1.5 }),
    ),
  ];
  // Places spread over the planet's near side, each with events at it (pins fanned out).
  const planetRef = `$op:${(2 + ORBIT_PLANET).toString()}`;
  for (let p = 0; p < PERF_PLACES; p++) {
    const placeRef = `$op:${operations.length.toString()}`;
    operations.push(
      {
        op: 'create',
        kind: 'place',
        mapId: map.id,
        data: { name: plain(`Perf Place ${(p + 1).toString()}`) },
      },
      {
        op: 'setLocation',
        id: placeRef,
        data: { mode: 'surface', objectId: planetRef, latDeg: -30 + p * 20, lonDeg: -40 + p * 25 },
      },
    );
    for (let e = 0; e < EVENTS_PER_PLACE; e++) {
      const eventRef = `$op:${operations.length.toString()}`;
      operations.push(
        {
          op: 'create',
          kind: 'event',
          mapId: map.id,
          data: { name: plain(`Perf Event ${(p + 1).toString()}.${(e + 1).toString()}`) },
        },
        { op: 'setLocation', id: eventRef, data: { mode: 'place', placeId: placeRef } },
      );
    }
  }
  const response = await request.post('/api/v1/batch', {
    data: { description: 'Perf system', operations },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { results } = ((await response.json()) as { data: { results: { id: string }[] } }).data;
  const planetId = results[2 + ORBIT_PLANET]?.id;
  if (!planetId) throw new Error('The batch made no planet to enter.');
  return { systemId: system.id, planetId };
}

/** What the system part needs from path.spec.ts. */
export interface SystemContext {
  page: Page;
  systemId: string;
  /** A planet of the system with an orbit view, for the orbit round trips. */
  planetId: string;
  center: { x: number; y: number };
  /** Runs a phase and records its frames and counters under `name`. */
  phase: (name: string, run: () => Promise<void>) => Promise<void>;
  drag: (from: { x: number; y: number }, by: { x: number; y: number }) => Promise<void>;
  wheel: (at: { x: number; y: number }, deltaY: number, ticks: number) => Promise<void>;
  waitForIdle: () => Promise<void>;
  renderInfo: () => Promise<RenderInfo>;
}

async function hooks<T>(page: Page, body: string): Promise<T> {
  return page.evaluate<T>(`(async () => { const h = window.__GE_TEST__; return ${body}; })()`);
}

/** How long a change of view takes, from the request to the faded-in new view. */
async function timed(page: Page, call: string): Promise<number> {
  return hooks<number>(
    page,
    `(async () => { const t = performance.now(); await ${call}; return performance.now() - t; })()`,
  );
}

/** The presets whose bakes are timed: a sea and coasts, bands, and city lights. */
const BAKE_PRESETS = ['ocean', 'gas_giant', 'city'] as const;

export async function systemPhases(context: SystemContext): Promise<SystemResult> {
  const { page, systemId, planetId, center, phase, drag, wheel, waitForIdle, renderInfo } = context;
  const enterMs: number[] = [];
  const exitMs: number[] = [];
  let maxDrawCalls = 0;
  const tally = async () => {
    maxDrawCalls = Math.max(maxDrawCalls, (await renderInfo()).calls);
  };

  // Timed trips: the first entry also fetches the system's code and payload; later ones are
  // what the budget means by "including data when cached".
  for (let trip = 0; trip < TIMED_TRIPS; trip++) {
    enterMs.push(await timed(page, `h.enter(${JSON.stringify(systemId)})`));
    expect(await hooks<string>(page, 'h.level().level')).toBe('system');
    await waitForIdle();
    await tally();
    exitMs.push(await timed(page, 'h.exit()'));
    expect(await hooks<string>(page, 'h.level().level')).toBe('galaxy');
    await waitForIdle();
  }

  // Inside the busy system: orbit, then zoom in and out over empty space (zooming over a
  // planet would stop at it and push toward its view, M5-T2).
  await hooks(page, `h.enter(${JSON.stringify(systemId)})`);
  await waitForIdle();
  const interactionStart = await hooks<number>(page, 'performance.now()');
  await phase('system orbit', async () => {
    for (let i = 0; i < 3; i++) {
      await drag({ x: center.x - 300, y: center.y }, { x: 600, y: i === 1 ? -120 : 80 });
    }
  });
  await tally();
  await phase('system zoom', async () => {
    for (const at of [center, { x: center.x - 250, y: center.y + 100 }]) {
      await wheel(at, -100, 12);
      await wheel(at, 100, 12);
    }
  });
  await tally();
  const interaction = await hooks<FrameStats>(page, `h.frameStats(${interactionStart.toString()})`);

  // The orbit view (M6-T8), from inside the system: timed entries and exits, then orbiting the
  // globe and zooming in and out, with its pins shown.
  const orbitEnterMs: number[] = [];
  const orbitExitMs: number[] = [];
  let orbitDrawCalls = 0;
  const orbitTally = async () => {
    orbitDrawCalls = Math.max(orbitDrawCalls, (await renderInfo()).calls);
  };
  for (let trip = 0; trip < TIMED_TRIPS; trip++) {
    orbitEnterMs.push(await timed(page, `h.enter(${JSON.stringify(planetId)})`));
    expect(await hooks<string>(page, 'h.level().level')).toBe('orbit');
    await waitForIdle();
    await orbitTally();
    orbitExitMs.push(await timed(page, 'h.exit()'));
    expect(await hooks<string>(page, 'h.level().level')).toBe('system');
    await waitForIdle();
  }
  await hooks(page, `h.enter(${JSON.stringify(planetId)})`);
  await waitForIdle();
  // The pins drawn: each of the planet's places and events that the globe shows.
  const pins = await hooks<number>(
    page,
    `(await (await fetch('/api/v1/objects/${planetId}/views/orbit')).json()).data.pins.filter((pin) => h.pin(pin.id) !== null).length`,
  );
  const orbitStart = await hooks<number>(page, 'performance.now()');
  await phase('orbit view orbit', async () => {
    for (let i = 0; i < 3; i++) {
      await drag({ x: center.x - 300, y: center.y }, { x: 600, y: i === 1 ? -120 : 80 });
    }
  });
  await orbitTally();
  await phase('orbit view zoom', async () => {
    await wheel(center, -100, 12);
    await wheel(center, 100, 12);
  });
  await orbitTally();
  const orbitInteraction = await hooks<FrameStats>(page, `h.frameStats(${orbitStart.toString()})`);
  await hooks(page, 'h.exit()');
  await waitForIdle();
  await hooks(page, 'h.exit()');
  await waitForIdle();

  // GPU memory over round trips, from after the timed ones (which warmed every cache).
  const before = await renderInfo();
  for (let trip = 0; trip < ROUND_TRIPS; trip++) {
    await hooks(page, `h.enter(${JSON.stringify(systemId)})`);
    await hooks(page, 'h.exit()');
  }
  await waitForIdle();
  const after = await renderInfo();

  // The same through the orbit view (M6-T3): a warm-up trip first, which also bakes the globe's
  // textures into the bake cache (kept for the page on purpose).
  const deepTrip = async () => {
    await hooks(page, `h.enter(${JSON.stringify(systemId)})`);
    await hooks(page, `h.enter(${JSON.stringify(planetId)})`);
    expect(await hooks<string>(page, 'h.level().level')).toBe('orbit');
    await hooks(page, 'h.exit()');
    await hooks(page, 'h.exit()');
  };
  await deepTrip();
  await waitForIdle();
  const orbitBefore = await renderInfo();
  for (let trip = 0; trip < ROUND_TRIPS; trip++) await deepTrip();
  await waitForIdle();
  const orbitAfter = await renderInfo();

  // Planet surfaces at the orbit view's full size, on this machine's GPU (M6-T2).
  const planetBakeMs: Record<string, number> = {};
  for (const preset of BAKE_PRESETS) {
    planetBakeMs[preset] = await hooks<number>(
      page,
      `h.bakePlanet({ preset: ${JSON.stringify(preset)}, clouds: { enabled: true } }, { widthPx: 2048, heightPx: 1024 }).durationMs`,
    );
  }

  const planetPreviewMs = await previewTimes(context);

  return {
    interaction,
    maxDrawCalls,
    planetBakeMs,
    planetPreviewMs,
    transitions: { enterMs, exitMs },
    roundTrips: { count: ROUND_TRIPS, before, after },
    orbitRoundTrips: { count: ROUND_TRIPS, before: orbitBefore, after: orbitAfter },
    orbit: {
      interaction: orbitInteraction,
      maxDrawCalls: orbitDrawCalls,
      transitions: { enterMs: orbitEnterMs, exitMs: orbitExitMs },
      pins,
    },
  };
}

/** The planet whose look is previewed: the ocean planet entered for the orbit view. */
const PREVIEW_PLANET_NAME = `Perf ${(ORBIT_PLANET + 1).toString()}`;
/** How long a preview is waited for, in ms, before it counts as missed. */
const PREVIEW_WAIT_MS = 2_000;

/** The sea levels the slider is set to, one preview each. */
const PREVIEW_SEA_LEVELS = ['0.30', '0.45', '0.60', '0.75', '0.50'] as const;

/**
 * How long the look editor takes to show a change on the globe (M6-T2: "dragging a palette
 * slider updates the globe within 200 ms"), measured here on the reference Mac rather than in
 * e2e, where parallel tests made it measure the machine's load (D-33). In the busy system,
 * the ocean planet is selected and edit mode turned on; then, five times, the Sea level slider
 * gets a new value and an input event, as while its thumb is dragged, and the time is taken
 * until the system view's texture stack holds the re-baked surface. Nothing is saved: a drag
 * saves only when it's let go.
 */
async function previewTimes(context: SystemContext): Promise<number[]> {
  const { page, systemId, planetId, waitForIdle } = context;
  await hooks(page, `h.enter(${JSON.stringify(systemId)})`);
  await waitForIdle();
  // Selected by id: a click could land on the moon drawn beside the planet.
  await hooks(page, `h.select([${JSON.stringify(planetId)}])`);
  await page.keyboard.press('e');
  const panel = page.getByRole('complementary', { name: 'Details' });
  await panel.getByRole('form', { name: `Edit ${PREVIEW_PLANET_NAME}` }).waitFor();
  const slider = panel.getByRole('slider', { name: 'Sea level' });
  await slider.waitFor();
  const times: number[] = [];
  for (const value of PREVIEW_SEA_LEVELS) {
    const elapsedMs = await slider.evaluate(
      async (input: HTMLInputElement, [id, next, waitMs]) => {
        const hooks = window.__GE_TEST__;
        const before = hooks?.planetSurface(id)?.key;
        // React skips events that change nothing by watching `input.value`, so the value
        // goes through the prototype's setter, as the browser's own thumb does.
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set?.bind(input);
        if (!setValue) return Number.POSITIVE_INFINITY;
        const start = performance.now();
        setValue(next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        while (performance.now() - start < waitMs) {
          if (hooks?.planetSurface(id)?.key !== before) return performance.now() - start;
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
        return Number.POSITIVE_INFINITY;
      },
      [planetId, value, PREVIEW_WAIT_MS] as const,
    );
    // No re-bake within the wait counts as the wait itself: a clear miss, and a number that
    // survives the results' JSON (Infinity becomes null there).
    times.push(Number.isFinite(elapsedMs) ? elapsedMs : PREVIEW_WAIT_MS);
    await waitForIdle();
  }
  await page.keyboard.press('e');
  await waitForIdle();
  await hooks(page, 'h.exit()');
  await waitForIdle();
  return times;
}
