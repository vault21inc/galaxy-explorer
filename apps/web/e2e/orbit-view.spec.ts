import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { framesDuring, waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** The orbit view: the globe, what orbits it, and moving in and out (M6-T3, rendering.md §8). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** The draw-call budget for the orbit view (M6-T3's "Done when"). */
const DRAW_CALL_BUDGET = 40;

type Pose = { position: [number, number, number]; target: [number, number, number] } | null;

/**
 * A universe of its own: the system Helios with its star, the planet Terra (clouds, rings, a
 * tilt) and, around Terra, the explorable moon Luna and a station.
 */
async function setUp(request: APIRequestContext) {
  const slug = `orbit-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: unknown }).data;
  };
  const universe = (await post('/api/v1/universes', { slug, name: plain('Orbits') })) as {
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
  const built = (await post('/api/v1/batch', {
    description: 'Orbits',
    operations: [
      object({ name: plain('Helios'), baseType: 'system', explorable: true, x: 0, y: 0, z: 0 }),
      object({ name: plain('Sun'), baseType: 'star', parentId: '$op:0' }),
      object({
        name: plain('Terra'),
        baseType: 'planet',
        parentId: '$op:0',
        x: 4,
        explorable: true,
        appearance: {
          planet: {
            preset: 'ocean',
            axialTiltDeg: 20,
            clouds: { enabled: true },
            rings: { enabled: true },
          },
        },
      }),
      object({
        name: plain('Luna'),
        baseType: 'moon',
        parentId: '$op:2',
        x: 3,
        z: 1,
        explorable: true,
      }),
      object({ name: plain('Dock'), baseType: 'station', parentId: '$op:2', x: -2, z: 1.5 }),
      // A pin on Terra: pins move with the spinning globe, which once kept frames coming at
      // the display's rate instead of ambient motion's 30 a second.
      { op: 'create', kind: 'place', mapId: map.id, data: { name: plain('Port Terra') } },
      {
        op: 'setLocation',
        id: '$op:5',
        data: { mode: 'surface', objectId: '$op:2', latDeg: 10, lonDeg: 20 },
      },
    ],
  })) as { results: { id: string }[] };
  const [system, , terra, luna] = built.results.map((result) => result.id);
  if (!system || !terra || !luna) throw new Error('The batch created too little.');
  return { url: `/u/${slug}/main`, system, terra, luna };
}

const level = (page: Page) => page.evaluate(() => window.__GE_TEST__?.level() ?? null);
const cameraPose = (page: Page): Promise<Pose> =>
  page.evaluate(() => window.__GE_TEST__?.cameraPose() ?? null);

async function settled(page: Page): Promise<void> {
  // CI renders in software: a view can take well over the default 5 s to arrive there.
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.transitioning() ?? true), {
      timeout: 20_000,
    })
    .toBe(false);
  await waitForIdle(page, 500);
}

/** Each coordinate within 1 % of the camera's distance to its target. */
function expectNear(actual: Pose, expected: Pose): void {
  if (!actual || !expected) throw new Error('No camera pose');
  const distance = Math.hypot(
    ...expected.position.map((value, axis) => value - (expected.target[axis] ?? 0)),
  );
  for (const key of ['position', 'target'] as const) {
    actual[key].forEach((value, axis) => {
      expect(
        Math.abs(value - (expected[key][axis] ?? 0)),
        `${key}[${axis.toString()}]`,
      ).toBeLessThan(distance * 0.01);
    });
  }
}

test.describe('the orbit view (M6-T3)', () => {
  test('a planet from its system, then its moon; exiting twice returns to the saved pose', async ({
    page,
  }) => {
    // Four changes of view, each waiting to settle: slow with CI's software rendering.
    test.slow();
    const s = await setUp(page.request);
    await page.goto(`${s.url}/view/${s.system}`);
    await waitForFirstFrame(page);
    await settled(page);
    // Somewhere other than the start, so coming back proves the pose was saved.
    await page.evaluate((id) => window.__GE_TEST__?.flyTo(id), s.terra);
    await waitForIdle(page);
    const saved = await cameraPose(page);

    await page.evaluate((id) => window.__GE_TEST__?.enter(id), s.terra);
    await expect.poll(() => level(page)).toEqual({ level: 'orbit', subjectId: s.terra });
    await settled(page);
    const globe = await page.evaluate(() => window.__GE_TEST__?.globe());
    expect(globe).toMatchObject({
      subjectId: s.terra,
      tiltDeg: 20,
      clouds: true,
      atmosphere: true,
      rings: true,
      sunFromStar: true,
      uploaded: false,
    });
    expect(globe?.albedoKey).toContain('"preset":"ocean"');
    // The moon and the station are drawn, and the moon is lit by the system's star.
    expect(await page.evaluate((id) => window.__GE_TEST__?.drawnObject(id)?.renderer, s.luna)).toBe(
      'planet-bodies',
    );
    expect(await page.evaluate(() => window.__GE_TEST__?.litLightCounts()['planet-bodies'])).toBe(
      1,
    );
    const calls = await page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls ?? 0);
    test.info().annotations.push({ type: 'orbit view draw calls', description: String(calls) });
    expect(calls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
    // Panning past the camera's limits: no closer than 1.15 radii, no farther than 8.
    const distance = await page.evaluate(() => {
      const pose = window.__GE_TEST__?.cameraPose();
      return pose ? Math.hypot(...pose.position) : 0;
    });
    expect(distance).toBeGreaterThanOrEqual(1.15);
    expect(distance).toBeLessThanOrEqual(8);

    // An explorable moon opens its own orbit view.
    await page.evaluate((id) => window.__GE_TEST__?.enter(id), s.luna);
    await expect.poll(() => level(page)).toEqual({ level: 'orbit', subjectId: s.luna });
    await settled(page);
    expect((await page.evaluate(() => window.__GE_TEST__?.globe()))?.subjectId).toBe(s.luna);

    await page.evaluate(() => window.__GE_TEST__?.exit());
    await expect.poll(() => level(page)).toEqual({ level: 'orbit', subjectId: s.terra });
    await settled(page);
    await page.evaluate(() => window.__GE_TEST__?.exit());
    await expect.poll(() => level(page)).toEqual({ level: 'system', subjectId: s.system });
    await settled(page);
    expectNear(await cameraPose(page), saved);
  });

  test('idle draws nothing; ambient motion draws at most 30 frames a second', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(`${s.url}/view/${s.terra}`);
    await waitForFirstFrame(page);
    await settled(page);
    expect(await framesDuring(page, 1_500)).toBe(0);
    const spinBefore = (await page.evaluate(() => window.__GE_TEST__?.globe()))?.spinDeg ?? 0;

    await page.getByRole('button', { name: 'Quality settings' }).click();
    await page.getByLabel(/Ambient motion/).check();
    await page.keyboard.press('Escape');
    const frames = await framesDuring(page, 2_000);
    test
      .info()
      .annotations.push({ type: 'frames in 2 s with ambient motion', description: String(frames) });
    // At most 30 a second is the rule. How many a software-rendered CI machine manages is its
    // own speed, not the app's, so there it's enough that the globe keeps drawing.
    const software = test.info().config.metadata.softwareRendering === true;
    expect(frames).toBeGreaterThan(software ? 1 : 20);
    expect(frames).toBeLessThanOrEqual(62);
    expect((await page.evaluate(() => window.__GE_TEST__?.globe()))?.spinDeg).toBeGreaterThan(
      spinBefore,
    );

    // Reduced motion stops it, whatever the setting says.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitForIdle(page, 500);
    expect(await framesDuring(page, 1_500)).toBe(0);
  });

  test('the system view shows a planet’s moon and station beside it, not to be dragged there', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    const dock = await stationId(page.request, s.terra);
    await page.goto(`${s.url}/view/${s.system}`);
    await waitForFirstFrame(page);
    await settled(page);
    const drawn = (id: string) =>
      page.evaluate((target) => window.__GE_TEST__?.drawnObject(target), id);
    const terra = await drawn(s.terra);
    const luna = await drawn(s.luna);
    expect(luna?.renderer).toBe('planet-bodies');
    expect((await drawn(dock))?.renderer).toBe('icon-sprites');
    // Luna is 3 radii out and 1 across in Terra's orbit view: the same in Terra's system-view
    // radii here.
    const radius = terra?.radius ?? 0;
    const [tx = 0, ty = 0, tz = 0] = terra?.center ?? [];
    expect(luna?.center[0]).toBeCloseTo(tx + 3 * radius, 6);
    expect(luna?.center[1]).toBeCloseTo(ty, 6);
    expect(luna?.center[2]).toBeCloseTo(tz + 1 * radius, 6);

    // It can be selected, but a drag in edit mode doesn't move it: its position is Terra's.
    await page.keyboard.press('e');
    const at = await page.evaluate((id) => window.__GE_TEST__?.screenPositionOf(id), s.luna);
    if (!at) throw new Error('Luna is off screen');
    await page.mouse.click(at.x, at.y);
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds()))
      .toEqual([s.luna]);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 80, at.y + 40, { steps: 8 });
    await page.mouse.up();
    const saved = (await (await page.request.get(`/api/v1/objects/${s.luna}`)).json()) as {
      data: { x: number; z: number };
    };
    expect([saved.data.x, saved.data.z]).toEqual([3, 1]);
  });

  test('the orbit view starts with its moons in view, and flies to one without entering the globe', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    const dock = await stationId(page.request, s.terra);
    await page.goto(`${s.url}/view/${s.terra}`);
    await waitForFirstFrame(page);
    await settled(page);
    for (const id of [s.luna, dock]) {
      expect(
        await page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id),
      ).not.toBeNull();
    }
    // Double-clicking the station flies to it: the target moves there, and the camera stays
    // outside the globe.
    const at = await page.evaluate((id) => window.__GE_TEST__?.screenPositionOf(id), dock);
    if (!at) throw new Error('The station is off screen');
    await page.mouse.dblclick(at.x, at.y);
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds())).toEqual([dock]);
    await settled(page);
    const pose = await cameraPose(page);
    expect(pose?.target[0]).toBeCloseTo(-2, 1);
    expect(pose?.target[2]).toBeCloseTo(1.5, 1);
    expect(Math.hypot(...(pose?.position ?? [0, 0, 0]))).toBeGreaterThanOrEqual(1.15 - 1e-3);
  });
});

test.describe('the view’s own subject', () => {
  /** Where a latitude and longitude of the globe's surface is on screen. */
  const globeSpot = async (page: Page, latDeg: number, lonDeg: number) => {
    const at = await page.evaluate(
      ([lat, lon]) => {
        const point = window.__GE_TEST__?.globePoint(lat, lon, 1);
        return point ? window.__GE_TEST__?.projectPoint(point) : null;
      },
      [latDeg, lonDeg] as const,
    );
    if (!at) throw new Error(`${String(latDeg)}, ${String(lonDeg)} isn't on screen.`);
    return at;
  };
  const selected = (page: Page) => page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);

  test('a click on the globe selects the world; a drag across it still turns the camera', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await page.goto(`${s.url}/view/${s.terra}`);
    await waitForFirstFrame(page);
    await settled(page);
    // Face a spot in the south: away from the pin, and below the moons on the equator's plane.
    await page.evaluate(() => window.__GE_TEST__?.faceGlobePoint(-50, -120));
    await waitForIdle(page, 300);
    const spot = await globeSpot(page, -50, -120);

    await page.mouse.click(spot.x, spot.y);
    await expect.poll(() => selected(page)).toEqual([s.terra]);
    const details = page.getByRole('complementary', { name: 'Details' });
    await expect(details).toContainText('Terra');
    await expect(page).toHaveURL(new RegExp(`select=${s.terra}`));

    // Beside the globe, a click clears the selection, as on empty space anywhere.
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('No canvas.');
    await page.mouse.click(box.x + 12, box.y + box.height - 12);
    await expect.poll(() => selected(page)).toEqual([]);

    // A drag across the globe turns the camera; it neither selects the world nor moves it.
    const before = await cameraPose(page);
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x + 120, spot.y, { steps: 10 });
    await page.mouse.up();
    await settled(page);
    expect(await selected(page)).toEqual([]);
    expect(await cameraPose(page)).not.toEqual(before);
  });

  test('the outliner lists the world first; its form edits it, and Delete leaves it alone', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await page.goto(`${s.url}/view/${s.terra}`);
    await waitForFirstFrame(page);
    await settled(page);
    await page.keyboard.press('e');
    const outliner = page.getByRole('complementary', { name: 'Outliner' });
    const first = outliner.getByRole('treeitem').first();
    await expect(first).toContainText('Terra');
    await expect(first).toContainText('Planet');
    await first.click();
    await expect.poll(() => selected(page)).toEqual([s.terra]);

    // The panel's form is the planet's own: renaming it renames the view's subject.
    const details = page.getByRole('complementary', { name: 'Details' });
    const name = details.getByLabel('Name', { exact: true });
    await name.fill('Terra Nova');
    await name.press('Enter');
    await expect(first).toContainText('Terra Nova');
    await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toContainText('Terra Nova');

    // The editor's commands act on what's in the view, never on the world it's of. (A click
    // on the row takes focus out of the name field, so Delete is the editor's.)
    await first.click();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog', { name: /^Delete/ })).toHaveCount(0);
    expect((await page.request.get(`/api/v1/objects/${s.terra}`)).status()).toBe(200);

    // An empty world says so under its own row (Luna has nothing around it).
    // (A page load leaves edit mode, so E again.)
    await page.goto(`${s.url}/view/${s.luna}`);
    await waitForFirstFrame(page);
    await settled(page);
    await page.keyboard.press('e');
    await expect(outliner.getByRole('treeitem').first()).toContainText('Luna');
    await expect(outliner).toContainText('Nothing orbits this world');

    // A system view lists its system first too.
    await page.goto(`${s.url}/view/${s.system}`);
    await waitForFirstFrame(page);
    await settled(page);
    await page.keyboard.press('e');
    await outliner.getByRole('treeitem').first().click();
    await expect.poll(() => selected(page)).toEqual([s.system]);
    await expect(details.getByLabel('Name', { exact: true })).toHaveValue('Helios');
  });
});

/** The station around a planet, from its orbit view. */
async function stationId(request: APIRequestContext, planetId: string): Promise<string> {
  const view = (await (await request.get(`/api/v1/objects/${planetId}/views/orbit`)).json()) as {
    data: { children: { id: string; baseType: string }[] };
  };
  const station = view.data.children.find((child) => child.baseType === 'station');
  if (!station) throw new Error('No station');
  return station.id;
}
