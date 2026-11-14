import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { galaxyObjects, systemChildren } from './demo.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Pins on the globe, their spoilers, and the icon picker (M6-T4, rendering.md §8, ux.md §6). */

const MAP = '/u/example-universe/main';
const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

interface Pin {
  id: string;
  namePlain: string;
  latDeg: number | null;
  lonDeg: number | null;
}

async function orbitPins(request: APIRequestContext, id: string): Promise<Pin[]> {
  const view = (await (await request.get(`/api/v1/objects/${id}/views/orbit`)).json()) as {
    data: { pins: Pin[]; children: { id: string; namePlain: string }[] };
  };
  return view.data.pins;
}

async function orbitChildren(request: APIRequestContext, id: string) {
  const view = (await (await request.get(`/api/v1/objects/${id}/views/orbit`)).json()) as {
    data: { children: { id: string; namePlain: string }[] };
  };
  return view.data.children;
}

/** The demo's planets: Primus (in Aster) and Brennan III (in Brennan). */
async function demoIds(request: APIRequestContext) {
  const top = await galaxyObjects(request, 'example-universe', 'main');
  const system = (name: string) => top.find((object) => object.namePlain === name)?.id ?? '';
  const primus = (await systemChildren(request, system('Aster'))).find(
    (child) => child.namePlain === 'Primus',
  );
  const brennanIii = (await systemChildren(request, system('Brennan'))).find(
    (child) => child.namePlain === 'Brennan III',
  );
  if (!primus || !brennanIii) throw new Error('The demo is missing its planets');
  const primusMinor = (await orbitChildren(request, primus.id)).find(
    (child) => child.namePlain === 'Primus Minor',
  );
  if (!primusMinor) throw new Error('The demo is missing Primus Minor');
  return { primus: primus.id, brennanIii: brennanIii.id, primusMinor: primusMinor.id };
}

async function openOrbit(page: Page, id: string) {
  await page.goto(`${MAP}/view/${id}`);
  await waitForFirstFrame(page);
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level), { timeout: 20_000 })
    .toBe('orbit');
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.transitioning() ?? true), {
      timeout: 20_000,
    })
    .toBe(false);
  await waitForIdle(page, 500);
}

const pinOf = (page: Page, id: string) =>
  page.evaluate((target) => window.__GE_TEST__?.pin(target) ?? null, id);

test.describe('pins on the globe (M6-T4)', () => {
  test('stand at their latitude and longitude, and open their panel', async ({ page }) => {
    const { primus } = await demoIds(page.request);
    const pins = await orbitPins(page.request, primus);
    const spire = pins.find((pin) => pin.namePlain === 'Hive Spire');
    if (spire?.latDeg == null || spire.lonDeg === null) throw new Error('No Hive Spire');
    await openOrbit(page, primus);
    await expect.poll(() => pinOf(page, spire.id)).not.toBeNull();
    expect(await pinOf(page, spire.id)).toMatchObject({ shape: 'place', state: 'normal' });

    // Face the pins' side of the globe: the pin is drawn where its lat/lon projects.
    await page.evaluate(([lat, lon]) => window.__GE_TEST__?.faceGlobePoint(lat, lon), [
      spire.latDeg,
      spire.lonDeg,
    ] as const);
    await waitForIdle(page, 500);
    const drawn = await page.evaluate((id) => window.__GE_TEST__?.screenPositionOf(id), spire.id);
    const expected = await page.evaluate(
      ([lat, lon]) => {
        const point = window.__GE_TEST__?.globePoint(lat, lon, 1.005);
        return point ? window.__GE_TEST__?.projectPoint(point) : null;
      },
      [spire.latDeg, spire.lonDeg] as const,
    );
    if (!drawn || !expected) throw new Error('The pin is off screen');
    expect(Math.abs(drawn.x - expected.x)).toBeLessThan(1);
    expect(Math.abs(drawn.y - expected.y)).toBeLessThan(1);

    // Hover shows its label; a click selects it and opens its panel, with its location.
    await page.mouse.move(drawn.x, drawn.y);
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.hoveredId())).toBe(spire.id);
    await page.mouse.click(drawn.x, drawn.y);
    const panel = page.getByRole('complementary', { name: 'Details' });
    await expect(panel).toContainText('Hive Spire');
    await expect(panel).toContainText('12.5° N, 40.2° W on Primus');

    // The event at the same place stands beside it, in its category's icon.
    const founding = pins.find((pin) => pin.namePlain === 'Founding of Hive Spire');
    expect(await pinOf(page, founding?.id ?? '')).toMatchObject({ shape: 'event', icon: 'flag' });
  });

  test('a spoiler event is a grey “?” until spoilers are shown', async ({ page }) => {
    const { primusMinor } = await demoIds(page.request);
    const fleet = (await orbitPins(page.request, primusMinor)).find(
      (pin) => pin.namePlain === 'The Silent Fleet',
    );
    if (!fleet) throw new Error('No Silent Fleet');
    await openOrbit(page, primusMinor);
    await expect.poll(() => pinOf(page, fleet.id)).toMatchObject({ state: 'redacted', icon: null });
    await page.getByRole('button', { name: 'Spoilers: Hidden' }).click();
    await expect.poll(() => pinOf(page, fleet.id)).toMatchObject({ state: 'normal' });
  });

  test('a spoiler location draws no pin until spoilers are shown', async ({ page }) => {
    const { brennanIii } = await demoIds(page.request);
    const battle = (await orbitPins(page.request, brennanIii)).find(
      (pin) => pin.namePlain === 'Battle of Brennan',
    );
    if (!battle) throw new Error('No Battle of Brennan');
    await openOrbit(page, brennanIii);
    // Nothing gives the place away: no pin, nothing to pick.
    expect(await pinOf(page, battle.id)).toBeNull();
    expect(await page.evaluate((id) => window.__GE_TEST__?.drawnObject(id), battle.id)).toBeNull();
    await page.getByRole('button', { name: 'Spoilers: Hidden' }).click();
    await expect.poll(() => pinOf(page, battle.id)).toMatchObject({ latDeg: -20, lonDeg: 75 });
  });
});

test.describe('the icon picker (M6-T4)', () => {
  test('searches both sets and saves the chosen icon', async ({ page }) => {
    const slug = `icons-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const created = await page.request.post('/api/v1/universes', {
      data: { slug, name: plain('Icons') },
    });
    const universe = ((await created.json()) as { data: { id: string } }).data;
    await page.request.post(`/api/v1/universes/${universe.id}/event-categories`, {
      data: { name: 'Battle', icon: 'lucide:swords', color: '#e5484d' },
    });
    await page.goto(`/u/${slug}/settings`);
    const table = page.getByRole('table', { name: 'Event categories' });
    const row = table.getByRole('row', { name: /Battle/ });
    await row.getByRole('button', { name: /^Icon: swords/ }).click();
    await page.getByRole('searchbox', { name: 'Search icons' }).fill('crossed swords');
    await page.getByRole('option', { name: 'crossed-swords (game-icons.net)' }).click();
    await expect
      .poll(async () => {
        const list = (await (
          await page.request.get(`/api/v1/universes/${universe.id}/event-categories`)
        ).json()) as { data: { icon: string }[] };
        return list.data[0]?.icon;
      })
      .toBe('game-icons:crossed-swords');
    await expect(row.getByRole('button', { name: /^Icon: crossed-swords/ })).toBeVisible();
  });
});
