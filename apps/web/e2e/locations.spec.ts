import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Creating and editing places and events, and where they're shown (M6-T5). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A universe of its own: a system with an explorable planet, and a battle category. */
async function setUp(request: APIRequestContext) {
  const slug = `loc-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', {
    slug,
    name: plain('Locations'),
    dateFormatNotes: plain('Year.Millennium, as in 240.M41'),
  });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Calyx'),
    baseType: 'system',
    explorable: true,
    x: 300,
  });
  const planet = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Calyx I'),
    baseType: 'planet',
    parentId: system.id,
    explorable: true,
    x: 5,
  });
  const battle = await post(`/api/v1/universes/${universe.id}/event-categories`, {
    name: 'Battle',
    icon: 'lucide:swords',
    color: '#e5484d',
  });
  return {
    url: `/u/${slug}/main`,
    universeId: universe.id,
    mapId: map.id,
    systemId: system.id,
    planetId: planet.id,
    battleId: battle.id,
    post,
  };
}

interface Location {
  mode: string;
  latDeg: number | null;
  lonDeg: number | null;
  placeId: string | null;
  objectId: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
}

async function locationOf(request: APIRequestContext, id: string): Promise<Location | null> {
  const response = await request.get(`/api/v1/entities/${id}/location`);
  if (response.status() === 404) return null;
  return ((await response.json()) as { data: Location | null }).data;
}

async function eventsOf(request: APIRequestContext, mapId: string) {
  const list = (await getJson(request, `/api/v1/maps/${mapId}/events`)) as {
    data: { id: string; namePlain: string; dateText: string | null; categoryId: string | null }[];
  };
  return list.data;
}

async function primary(page: Page) {
  return (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
}

async function openView(page: Page, url: string, level: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level), { timeout: 20_000 })
    .toBe(level);
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.transitioning() ?? true), {
      timeout: 20_000,
    })
    .toBe(false);
  await waitForIdle(page, 500);
  await page.keyboard.press('e');
  await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toBeVisible();
}

/** Turns the globe to face a point, and gives where a point on its surface is on the page. */
async function globeSpot(page: Page, latDeg: number, lonDeg: number) {
  const at = await page.evaluate(
    ([lat, lon]) => {
      const point = window.__GE_TEST__?.globePoint(lat, lon, 1);
      return point ? window.__GE_TEST__?.projectPoint(point) : null;
    },
    [latDeg, lonDeg] as const,
  );
  if (!at) throw new Error(`${String(latDeg)}, ${String(lonDeg)} isn't on screen.`);
  return at;
}

async function faceGlobe(page: Page, latDeg: number, lonDeg: number) {
  await page.evaluate(([lat, lon]) => window.__GE_TEST__?.faceGlobePoint(lat, lon), [
    latDeg,
    lonDeg,
  ] as const);
  await waitForIdle(page, 300);
}

async function addFromMenu(page: Page, item: string) {
  await page
    .getByRole('toolbar', { name: 'Edit tools' })
    .getByRole('button', { name: /^Add/ })
    .click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toContainText('Esc cancels');
}

const pinOf = (page: Page, id: string) =>
  page.evaluate((target) => window.__GE_TEST__?.pin(target) ?? null, id);

/** Drags from one page point to another, in steps, as a hand would. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test.describe('places and events (M6-T5)', () => {
  test('adding an event on the globe stores the clicked latitude and longitude', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await openView(page, `${s.url}/view/${s.planetId}`, 'orbit');
    await faceGlobe(page, 30, 40);
    // A spot off the middle, so the hit isn't just "the point faced".
    const spot = await globeSpot(page, 25, 32);
    await addFromMenu(page, 'Event');
    await page.mouse.click(spot.x, spot.y);
    await expect.poll(async () => (await eventsOf(page.request, s.mapId)).length).toBe(1);
    const [event] = await eventsOf(page.request, s.mapId);
    if (!event) throw new Error('No event.');
    const location = await locationOf(page.request, event.id);
    expect(location?.mode).toBe('surface');
    expect(location?.objectId).toBe(s.planetId);
    expect(Math.abs((location?.latDeg ?? 0) - 25)).toBeLessThan(0.5);
    expect(Math.abs((location?.lonDeg ?? 0) - 32)).toBeLessThan(0.5);

    // Its panel opens with the name focused, and the pin stands where it was clicked.
    const panel = page.getByRole('complementary', { name: 'Details' });
    await expect(panel.getByLabel('Name', { exact: true })).toBeFocused();
    await expect.poll(() => pinOf(page, event.id)).toMatchObject({ shape: 'event' });
  });

  test('editing every field, dragging the pin, deleting the event and undoing', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await openView(page, `${s.url}/view/${s.planetId}`, 'orbit');
    await faceGlobe(page, 0, 0);
    await addFromMenu(page, 'Event');
    const start = await globeSpot(page, 0, 0);
    await page.mouse.click(start.x, start.y);
    await expect.poll(async () => (await eventsOf(page.request, s.mapId)).length).toBe(1);
    const id = (await eventsOf(page.request, s.mapId))[0]?.id ?? '';

    // The fields: name, date (with the universe's format notes as its hint), sort key, category.
    const panel = page.getByRole('complementary', { name: 'Details' });
    const name = panel.getByLabel('Name', { exact: true });
    await expect(name).toBeFocused();
    await name.fill('Siege of Calyx');
    await name.press('Enter');
    await expect(panel).toContainText('Year.Millennium, as in 240.M41');
    const date = panel.getByLabel('Date', { exact: true });
    await date.fill('240.M41');
    await date.press('Enter');
    const sortKey = panel.getByLabel('Sort key', { exact: true });
    await sortKey.fill('240.41');
    await sortKey.press('Enter');
    await panel.getByLabel('Category', { exact: true }).selectOption({ label: 'Battle' });
    await expect
      .poll(async () => (await eventsOf(page.request, s.mapId))[0])
      .toMatchObject({ namePlain: 'Siege of Calyx', dateText: '240.M41', categoryId: s.battleId });
    // The pin takes its category's icon.
    await expect.poll(() => pinOf(page, id)).toMatchObject({ icon: 'lucide:swords' });

    // The location editor: a new latitude, typed.
    const latitude = panel.getByLabel('Latitude', { exact: true });
    await latitude.fill('5');
    await latitude.press('Enter');
    await expect.poll(async () => (await locationOf(page.request, id))?.latDeg).toBe(5);

    // Drag the pin to 10° N, 15° E, from where it's drawn now. The save comes back before the
    // view is reloaded and the pin redrawn, so wait for the pin itself to stand at 5° N.
    await expect
      .poll(() =>
        page.evaluate((target) => {
          const hooks = window.__GE_TEST__;
          const at = hooks?.screenPositionOf(target);
          const point = hooks?.globePoint(5, 0, 1);
          const spot = point ? hooks?.projectPoint(point) : null;
          return at && spot ? Math.hypot(at.x - spot.x, at.y - spot.y) : Infinity;
        }, id),
      )
      .toBeLessThan(2);
    const from = await page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id);
    if (!from) throw new Error('The pin is off screen.');
    const to = await globeSpot(page, 10, 15);
    await drag(page, from, to);
    await expect
      .poll(async () => {
        const location = await locationOf(page.request, id);
        return location
          ? [Math.round(location.latDeg ?? 0), Math.round(location.lonDeg ?? 0)]
          : null;
      })
      .toEqual([10, 15]);

    // Delete it (selected by the drag), then undo: it's back, where it was dragged to.
    await page.locator('canvas').focus();
    await page.keyboard.press('Delete');
    const dialog = page.getByRole('dialog', { name: 'Delete “Siege of Calyx”?' });
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(async () => (await eventsOf(page.request, s.mapId)).length).toBe(0);
    await expect.poll(() => pinOf(page, id)).toBeNull();
    await page.keyboard.press(`${await primary(page)}+z`);
    await expect.poll(async () => (await eventsOf(page.request, s.mapId)).length).toBe(1);
    expect(Math.round((await locationOf(page.request, id))?.lonDeg ?? 0)).toBe(15);
    await expect.poll(() => pinOf(page, id)).not.toBeNull();
  });

  test('adding a deep-space event in the galaxy view shows a diamond marker there', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await openView(page, s.url, 'galaxy');
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('No canvas.');
    // Away from the system, in open space.
    const click = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.6 };
    await addFromMenu(page, 'Event here');
    await page.mouse.click(click.x, click.y);
    await expect.poll(async () => (await eventsOf(page.request, s.mapId)).length).toBe(1);
    const id = (await eventsOf(page.request, s.mapId))[0]?.id ?? '';
    expect(await locationOf(page.request, id)).toMatchObject({ mode: 'space', objectId: null });

    const marker = () => page.evaluate((target) => window.__GE_TEST__?.marker(target) ?? null, id);
    await expect.poll(marker).toMatchObject({ icon: 'lucide:sparkle', offsetPx: [0, 0] });
    // Drawn where it was clicked, and it opens the event's panel.
    const at = await page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id);
    if (!at) throw new Error('The marker is off screen.');
    expect(Math.abs(at.x - click.x)).toBeLessThan(2);
    expect(Math.abs(at.y - click.y)).toBeLessThan(2);
    await page.keyboard.press('Escape');
    await page.mouse.click(at.x, at.y);
    await expect(
      page.getByRole('complementary', { name: 'Details' }).getByRole('form', {
        name: 'Edit New event',
      }),
    ).toBeVisible();
  });

  test('an event at a place moves with the place when its pin is dragged', async ({ page }) => {
    const s = await setUp(page.request);
    const place = await s.post(`/api/v1/maps/${s.mapId}/places`, { name: plain('Hive Calyx') });
    const event = await s.post(`/api/v1/maps/${s.mapId}/events`, { name: plain('Founding') });
    const put = async (id: string, data: object) => {
      const response = await page.request.put(`/api/v1/entities/${id}/location`, { data });
      expect(response.ok(), await response.text()).toBe(true);
    };
    await put(place.id, { mode: 'surface', objectId: s.planetId, latDeg: 0, lonDeg: 0 });
    await put(event.id, { mode: 'place', placeId: place.id });

    await openView(page, `${s.url}/view/${s.planetId}`, 'orbit');
    await faceGlobe(page, 0, 0);
    await expect.poll(() => pinOf(page, place.id)).toMatchObject({ shape: 'place' });
    const from = await page.evaluate(
      (target) => window.__GE_TEST__?.screenPositionOf(target),
      place.id,
    );
    if (!from) throw new Error('The place is off screen.');
    const to = await globeSpot(page, -12, 20);
    await drag(page, from, to);
    await expect
      .poll(async () => {
        const location = await locationOf(page.request, place.id);
        return location
          ? [Math.round(location.latDeg ?? 0), Math.round(location.lonDeg ?? 0)]
          : null;
      })
      .toEqual([-12, 20]);
    // The event is still at the place, and its pin stands beside the place's new spot.
    expect(await locationOf(page.request, event.id)).toMatchObject({
      mode: 'place',
      placeId: place.id,
    });
    await expect
      .poll(async () => {
        const pin = await pinOf(page, event.id);
        return pin ? Math.round(pin.latDeg) : null;
      })
      .toBe(-12);
  });
});
