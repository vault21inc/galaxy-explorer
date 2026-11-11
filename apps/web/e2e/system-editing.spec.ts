import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Editing inside a system with the galaxy view's tools (M5-T4), and binary stars (D-29). */

type Vec3 = [number, number, number];
const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A universe of its own whose map holds one explorable system, plus what `children` adds. */
interface Child {
  name: string;
  baseType: string;
  x?: number;
  /** The name of an earlier child, a star, that this one orbits. */
  orbits?: string;
}

async function setUp(request: APIRequestContext, children: Child[] = []) {
  const slug = `sysedit-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('System editing') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Centauri'),
    baseType: 'system',
    explorable: true,
  });
  const ids: Record<string, string> = {};
  for (const child of children) {
    const { name, orbits, ...rest } = child;
    const created = await post(`/api/v1/maps/${map.id}/objects`, {
      name: plain(name),
      parentId: system.id,
      ...(orbits ? { orbitCenterId: ids[orbits] } : {}),
      ...rest,
    });
    ids[name] = created.id;
  }
  return { url: `/u/${slug}/main`, universeId: universe.id, systemId: system.id, ids };
}

async function childrenOf(request: APIRequestContext, systemId: string) {
  const view = (await getJson(request, `/api/v1/objects/${systemId}/views/system`)) as {
    data: { children: { id: string; namePlain: string; baseType: string }[] };
  };
  return view.data.children;
}

async function positionOf(request: APIRequestContext, id: string): Promise<Vec3> {
  const { data } = (await getJson(request, `/api/v1/objects/${id}`)) as {
    data: { x: number; y: number; z: number };
  };
  return [data.x, data.y, data.z];
}

const ring = (page: Page, id: string) =>
  page.evaluate((target) => window.__GE_TEST__?.orbitRing(target) ?? null, id);

async function screenOf(page: Page, id: string) {
  const where = () =>
    page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target) ?? null, id);
  await expect.poll(where).not.toBeNull();
  const at = await where();
  if (!at) throw new Error(`${id} isn't on screen.`);
  return at;
}

async function primary(page: Page) {
  return (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
}

/** Opens the system view in edit mode. */
async function openSystem(page: Page, url: string, systemId: string) {
  await page.goto(`${url}/view/${systemId}`);
  await waitForFirstFrame(page);
  await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');
  await waitForIdle(page);
  await page.keyboard.press('e');
  await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toBeVisible();
}

/** Drags an object by a screen offset and lets go. */
async function drag(page: Page, id: string, dx: number, dy: number) {
  const start = await screenOf(page, id);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 10 });
  await page.mouse.up();
}

test.describe('editing inside a system (M5-T4)', () => {
  test('adding a star, three planets and a belt; moving a planet moves its ring; undo', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await openSystem(page, s.url, s.systemId);
    await expect(page.getByText('This system is empty')).toBeVisible();
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('No canvas.');

    const add = async (type: string, fx: number, fy: number, count: number) => {
      await page
        .getByRole('toolbar', { name: 'Edit tools' })
        .getByRole('button', { name: /^Add/ })
        .click();
      await expect(page.getByRole('menu')).toContainText('Add to the system');
      await page.getByRole('menuitem', { name: type, exact: true }).click();
      // The menu has closed and the ghost is ready: only then does a click on the canvas place.
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toContainText(
        `Click to place a ${type.toLowerCase()}`,
      );
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await expect
        .poll(async () => (await childrenOf(page.request, s.systemId)).length)
        .toBe(count);
    };
    await add('Star', 0.5, 0.5, 1);
    await add('Planet', 0.6, 0.5, 2);
    await add('Planet', 0.68, 0.58, 3);
    await add('Planet', 0.36, 0.62, 4);
    await add('Asteroid belt', 0.5, 0.78, 5);
    const types = (await childrenOf(page.request, s.systemId))
      .map((child) => child.baseType)
      .sort();
    expect(types).toEqual(['asteroid_belt', 'planet', 'planet', 'planet', 'star']);

    // Move the second planet: its ring follows it, then undo puts both back.
    const planet = (await childrenOf(page.request, s.systemId)).filter(
      (child) => child.baseType === 'planet',
    )[1];
    if (!planet) throw new Error('No planet.');
    await expect.poll(() => ring(page, planet.id)).not.toBeNull();
    const before = await positionOf(page.request, planet.id);
    const radiusBefore = (await ring(page, planet.id))?.radius ?? 0;
    expect(radiusBefore).toBeCloseTo(Math.hypot(before[0], before[2]), 3);

    await drag(page, planet.id, 120, 60);
    await expect
      .poll(async () => (await positionOf(page.request, planet.id))[0])
      .not.toBeCloseTo(before[0], 3);
    const after = await positionOf(page.request, planet.id);
    await expect
      .poll(async () => (await ring(page, planet.id))?.radius)
      .toBeCloseTo(Math.hypot(after[0], after[2]), 3);

    await page.keyboard.press(`${await primary(page)}+z`);
    await expect
      .poll(async () => (await positionOf(page.request, planet.id))[0])
      .toBeCloseTo(before[0], 6);
    await expect
      .poll(async () => (await ring(page, planet.id))?.radius)
      .toBeCloseTo(radiusBefore, 3);
  });

  test('a planet set to orbit star B circles B, and moves with B in one undo step', async ({
    page,
  }) => {
    const s = await setUp(page.request, [
      { name: 'A', baseType: 'star', x: -2 },
      { name: 'B', baseType: 'star', x: 2 },
      { name: 'Around both', baseType: 'planet', x: 6 },
      { name: 'Around B', baseType: 'planet', x: 3.2 },
    ]);
    const id = (name: string) => s.ids[name] ?? '';
    await openSystem(page, s.url, s.systemId);
    await expect.poll(() => ring(page, id('Around both'))).toMatchObject({ center: [0, 0, 0] });

    // Orbits: B, from the planet's form.
    const at = await screenOf(page, id('Around B'));
    await page.mouse.click(at.x, at.y);
    const orbits = page.getByLabel('Orbits');
    await expect(orbits).toHaveValue('');
    await expect(orbits.locator('option')).toHaveText(['The system’s center', 'A', 'B']);
    await orbits.selectOption({ label: 'B' });
    await expect
      .poll(async () => ((await ring(page, id('Around B')))?.center ?? []).map((v) => v.toFixed(3)))
      .toEqual(['2.000', '0.000', '0.000']);
    expect((await ring(page, id('Around B')))?.radius).toBeCloseTo(1.2, 3);

    // Move B: the planet that orbits it goes along, in one change.
    await page.keyboard.press('Escape');
    const [bx, , bz] = await positionOf(page.request, id('B'));
    const [px, , pz] = await positionOf(page.request, id('Around B'));
    await drag(page, id('B'), 0, 90);
    await expect
      .poll(async () => (await positionOf(page.request, id('B')))[2])
      .not.toBeCloseTo(bz, 3);
    const [nbx, , nbz] = await positionOf(page.request, id('B'));
    const [npx, , npz] = await positionOf(page.request, id('Around B'));
    expect(npx - px).toBeCloseTo(nbx - bx, 6);
    expect(npz - pz).toBeCloseTo(nbz - bz, 6);
    // Its ring is still centred on B, the same size.
    await expect
      .poll(async () => (await ring(page, id('Around B')))?.center[2])
      .toBeCloseTo(nbz, 3);
    expect((await ring(page, id('Around B')))?.radius).toBeCloseTo(1.2, 3);
    const history = (await getJson(page.request, `/api/v1/universes/${s.universeId}/history`)) as {
      data: { description: string }[];
    };
    expect(history.data[0]?.description).toBe('Moved B and 1 orbiting object');

    // One undo puts both back.
    await page.keyboard.press(`${await primary(page)}+z`);
    await expect
      .poll(async () => (await positionOf(page.request, id('Around B')))[2])
      .toBeCloseTo(pz, 6);
    expect((await positionOf(page.request, id('B')))[2]).toBeCloseTo(bz, 6);
  });
});
