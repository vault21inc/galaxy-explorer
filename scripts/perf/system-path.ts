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
  const operations = [
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

  return {
    interaction,
    maxDrawCalls,
    planetBakeMs,
    transitions: { enterMs, exitMs },
    roundTrips: { count: ROUND_TRIPS, before, after },
    orbitRoundTrips: { count: ROUND_TRIPS, before: orbitBefore, after: orbitAfter },
  };
}
