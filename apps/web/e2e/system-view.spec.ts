import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** How the system view draws (M5-T3, rendering.md §7, D-29). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** The draw-call budget for a busy system view (M5-T3's "Done when"). */
const DRAW_CALL_BUDGET = 80;

/**
 * A universe of its own with two systems: Sol (1 star, 12 planets, one ringed, 2 belts and 5
 * stations) and Trinity (3 stars of different temperatures and 12 planets).
 */
async function setUp(request: APIRequestContext) {
  const slug = `systems-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: unknown }).data;
  };
  const universe = (await post('/api/v1/universes', { slug, name: plain('Systems') })) as {
    id: string;
  };
  const map = (await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  })) as { id: string };
  const object = (data: object) => ({
    op: 'create',
    kind: 'celestial_object',
    mapId: map.id,
    data,
  });
  const system = (name: string, x: number) =>
    object({ name: plain(name), baseType: 'system', explorable: true, x, y: 0, z: 0 });
  const inside = (parent: number, name: string, baseType: string, extra: object = {}) =>
    object({ name: plain(name), baseType, parentId: `$op:${parent.toString()}`, ...extra });
  const planets = (parent: number, prefix: string) =>
    Array.from({ length: 12 }, (_, i) => {
      const angle = i * 2.4;
      const distance = 1.2 + i * 0.8;
      return inside(parent, `${prefix} ${(i + 1).toString()}`, 'planet', {
        x: distance * Math.cos(angle),
        z: distance * Math.sin(angle),
        ...(i === 5 ? { appearance: { planet: { rings: { enabled: true } } } } : {}),
      });
    });
  const operations = [
    system('Sol', -5_000), // $op:0
    inside(0, 'Sun', 'star'),
    ...planets(0, 'Sol'),
    inside(0, 'Inner Belt', 'asteroid_belt', { x: 3.6 }),
    inside(0, 'Outer Belt', 'asteroid_belt', { x: -11 }),
    ...Array.from({ length: 5 }, (_, i) =>
      inside(0, `Station ${(i + 1).toString()}`, 'station', { x: 2 + i, z: 1.5 }),
    ),
  ];
  const trinity = operations.length;
  operations.push(
    system('Trinity', 5_000),
    inside(trinity, 'Trinity A', 'star', {
      x: -1.5,
      appearance: { star: { temperatureK: 5_800 } },
    }),
    inside(trinity, 'Trinity B', 'star', {
      x: 1.5,
      appearance: { star: { temperatureK: 3_200 }, scale: { system: 0.8 } },
    }),
    inside(trinity, 'Trinity C', 'star', {
      z: 6,
      appearance: { star: { temperatureK: 12_000 }, scale: { system: 0.5 } },
    }),
    ...planets(trinity, 'Trinity'),
  );
  const built = (await post('/api/v1/batch', { description: 'Systems', operations })) as {
    results: { id: string; data: { namePlain: string } }[];
  };
  const ids = Object.fromEntries(
    built.results.map((result) => [result.data.namePlain, result.id]),
  ) as Record<string, string>;
  return { url: `/u/${slug}/main`, ids };
}

async function openSystem(page: Page, url: string, id: string): Promise<void> {
  await page.goto(`${url}/view/${id}`);
  await waitForFirstFrame(page);
  await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');
  await waitForIdle(page);
}

test.describe('the system view (M5-T3)', () => {
  test('a busy system and a triple star stay within the draw-call budget', async ({ page }) => {
    const s = await setUp(page.request);
    const id = (name: string) => s.ids[name] ?? '';

    await openSystem(page, s.url, id('Sol'));
    const renderers = await page.evaluate(
      (ids) => ids.map((target) => window.__GE_TEST__?.drawnObject(target)?.renderer ?? null),
      [id('Sun'), id('Sol 1'), id('Inner Belt'), id('Station 1')],
    );
    expect(renderers).toEqual(['star-bodies', 'planet-bodies', 'asteroid-belts', 'icon-sprites']);
    const sol = await page.evaluate(() => window.__GE_TEST__?.renderInfo());
    expect(sol?.calls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
    // One star, so one light.
    expect(await page.evaluate(() => window.__GE_TEST__?.systemLights().length)).toBe(1);

    await openSystem(page, s.url, id('Trinity'));
    const trinity = await page.evaluate(() => window.__GE_TEST__?.renderInfo());
    expect(trinity?.calls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
    // Lit by all three stars (D-29), largest first, each in its own temperature's color.
    const lights = (await page.evaluate(() => window.__GE_TEST__?.systemLights())) ?? [];
    expect(lights.map((light) => light.position)).toEqual([
      [-1.5, 0, 0],
      [1.5, 0, 0],
      [0, 0, 6],
    ]);
    const [warm, cool, hot] = lights.map((light) => light.color);
    // The 3,200 K star is redder than the 5,800 K one, and the 12,000 K one bluer.
    expect((cool?.[2] ?? 1) / (cool?.[0] ?? 1)).toBeLessThan((warm?.[2] ?? 0) / (warm?.[0] ?? 1));
    expect((hot?.[2] ?? 0) / (hot?.[0] ?? 1)).toBeGreaterThan(1);
  });

  test('hover, selection and labels work as in the galaxy view', async ({ page }) => {
    const s = await setUp(page.request);
    const id = (name: string) => s.ids[name] ?? '';
    await openSystem(page, s.url, id('Sol'));

    const planet = id('Sol 4');
    const at = await page.evaluate(
      (target) => window.__GE_TEST__?.screenPositionOf(target),
      planet,
    );
    if (!at) throw new Error('Sol 4 is off screen');
    await page.mouse.move(at.x, at.y);
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.hoveredId())).toBe(planet);
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.visibleLabels().map((l) => l.text)))
      .toContain('Sol 4');

    await page.mouse.click(at.x, at.y);
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds()))
      .toEqual([planet]);
    expect(await page.evaluate(() => window.__GE_TEST__?.ringedIds())).toContain(planet);
    await expect(page.getByRole('complementary', { name: 'Details' })).toContainText('Sol 4');

    // A belt is picked anywhere along its band, not only at its position.
    await page.keyboard.press('Escape');
    const belt = id('Inner Belt');
    const across = await page.evaluate(
      () => window.__GE_TEST__?.projectPoint([-3.6, 0, 0]) ?? null,
    );
    if (!across) throw new Error('The belt is off screen');
    await page.mouse.click(across.x, across.y);
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds())).toEqual([belt]);
  });
});
