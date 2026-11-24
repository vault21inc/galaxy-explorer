import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * Flying to things by their neighbors (D-61): one system arrives among its nearest neighbors
 * at the map's spacing there, and a group is flown to by its members: F and Enter, a
 * double-click on its label, a search result, Enter on its row in the List.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A tight cluster 20,000 ly out, tens of light-years across, and one system far from it. */
const CLUSTER: [string, number, number][] = [
  ['Hearth', 20_000, 0],
  ['Ember', 20_004, 0],
  ['Cinder', 19_994, 3],
  ['Spark', 20_002, -9],
  ['Kindle', 20_011, 6],
  ['Tinder', 19_990, -12],
  ['Flint', 20_020, 20],
];

async function setUp(request: APIRequestContext) {
  const slug = `fly-to-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('Fly to') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const ids: Record<string, string> = {};
  for (const [name, x, z] of [...CLUSTER, ['Lonely', -30_000, 0] as const]) {
    ids[name] = await post(`/api/v1/maps/${mapId}/objects`, {
      name: plain(name),
      baseType: 'system',
      // One to go into, for searching from inside a system.
      explorable: name === 'Lonely',
      x,
      y: 0,
      z,
    });
  }
  const groupTypeId = await post(`/api/v1/universes/${universeId}/group-types`, {
    name: 'Neighbourhood',
    layer: 'Neighbourhoods',
    defaultColor: '#7fd4ff',
  });
  ids.Hearthside = await post(`/api/v1/maps/${mapId}/groups`, {
    name: plain('Hearthside'),
    groupTypeId,
    parentGroupId: null,
    outlineColor: '#7fd4ff',
  });
  await post(`/api/v1/groups/${ids.Hearthside}/members`, {
    members: ['Hearth', 'Ember', 'Cinder', 'Spark'].map((name) => ({ objectId: ids[name] ?? '' })),
  });
  return { url: `/u/${slug}/main`, ids };
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page);
}

/** Where the camera looks, and from how far, in light-years. */
async function camera(page: Page) {
  const pose = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
  if (!pose) throw new Error('No camera');
  const [px, py, pz] = pose.position;
  const [tx, ty, tz] = pose.target;
  return { target: pose.target, distanceLy: Math.hypot(px - tx, py - ty, pz - tz) };
}

const onScreen = (page: Page, id: string | undefined) =>
  page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target ?? '') ?? null, id);

/** The group's members are all in the window, and the camera is among them. */
async function expectFramed(page: Page, ids: Record<string, string>) {
  const { target, distanceLy } = await camera(page);
  expect(Math.hypot(target[0] - 20_000, target[2])).toBeLessThan(15);
  // Tens of light-years across: the frame is no wider than a few times that.
  expect(distanceLy).toBeLessThan(120);
  const size = page.viewportSize() ?? { width: 0, height: 0 };
  for (const name of ['Hearth', 'Ember', 'Cinder', 'Spark']) {
    const at = await onScreen(page, ids[name]);
    expect(at, name).not.toBeNull();
    expect(at?.x).toBeGreaterThan(0);
    expect(at?.x).toBeLessThan(size.width);
    expect(at?.y).toBeGreaterThan(0);
    expect(at?.y).toBeLessThan(size.height);
  }
}

async function openPalette(page: Page) {
  const primary =
    (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
  await page.keyboard.press(`${primary}+k`);
  return page.getByRole('combobox', { name: 'Search or run a command' });
}

test.describe('flying to neighborhoods and groups (D-61)', () => {
  test('one system is framed among its nearest neighbors, a lone one widely', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);

    await page.evaluate((id) => window.__GE_TEST__?.flyTo(id), s.ids.Hearth ?? '');
    await waitForIdle(page);
    const near = await camera(page);
    expect(Math.hypot(near.target[0] - 20_000, near.target[2])).toBeLessThan(0.01);
    // Its six neighbors are within 29 ly: the frame is a few tens of light-years, where a
    // fixed 1,500 ly frame put the camera some 3,900 ly away and the cluster in one dot.
    expect(near.distanceLy).toBeLessThan(120);
    for (const [name] of CLUSTER) expect(await onScreen(page, s.ids[name]), name).not.toBeNull();

    await page.evaluate((id) => window.__GE_TEST__?.flyTo(id), s.ids.Lonely ?? '');
    await waitForIdle(page);
    const far = await camera(page);
    // Nothing within 1,500 ly: framed at that, to show where it is.
    expect(far.distanceLy).toBeGreaterThan(3_000);
    expect(far.distanceLy).toBeLessThan(5_000);
  });

  test('F and Enter fly to a selected group’s members, and so does its label', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    await page.keyboard.press('l'); // the groups label mode
    const label = page
      .getByTestId('label-layer')
      .locator(`[data-label-id="${s.ids.Hearthside ?? ''}"]`);
    await label.click();
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []))
      .toEqual([s.ids.Hearthside]);
    await page.keyboard.press('f');
    await waitForIdle(page);
    await expectFramed(page, s.ids);

    await page.keyboard.press('h');
    await waitForIdle(page);
    expect((await camera(page)).distanceLy).toBeGreaterThan(10_000);
    await page.keyboard.press('Enter');
    await waitForIdle(page);
    await expectFramed(page, s.ids);

    await page.keyboard.press('h');
    await waitForIdle(page);
    await label.dblclick();
    await waitForIdle(page);
    await expectFramed(page, s.ids);
  });

  test('a search result in the galaxy view is flown to: a group, then a system', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await open(page, s.url);

    let input = await openPalette(page);
    await input.fill('hearthside');
    const options = page.getByRole('listbox', { name: 'Results and commands' }).getByRole('option');
    await expect(options.nth(0)).toContainText('Hearthside');
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []))
      .toEqual([s.ids.Hearthside]);
    await waitForIdle(page);
    await expectFramed(page, s.ids);

    input = await openPalette(page);
    await input.fill('lonely');
    await expect(options.nth(0)).toContainText('Lonely');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await camera(page)).target[0], { timeout: 10_000 })
      .toBeCloseTo(-30_000, 0);
  });

  test('from inside a system, a search result goes up to the galaxy view and flies there', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    await page.evaluate((id) => window.__GE_TEST__?.enter(id), s.ids.Lonely ?? '');
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');

    const input = await openPalette(page);
    await input.fill('hearthside');
    const options = page.getByRole('listbox', { name: 'Results and commands' }).getByRole('option');
    await expect(options.nth(0)).toContainText('Hearthside');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('galaxy');
    // Not back where the reader was before entering: on to what they asked for.
    await expect
      .poll(async () => (await camera(page)).distanceLy, { timeout: 10_000 })
      .toBeLessThan(120);
    await waitForIdle(page);
    await expectFramed(page, s.ids);
  });

  test('Enter on a row of the List flies to it, and a double-click does', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    await page.getByRole('button', { name: 'List', exact: true }).click();
    const tree = page.getByRole('tree', { name: 'Objects in this view' });
    const row = (name: string) => tree.getByRole('treeitem', { name: new RegExp(`^${name}\\b`) });

    await row('Hearthside').click();
    // Selecting alone leaves the camera where it was.
    await waitForIdle(page);
    expect((await camera(page)).distanceLy).toBeGreaterThan(10_000);
    await page.keyboard.press('Enter');
    await waitForIdle(page);
    await expectFramed(page, s.ids);

    await row('Lonely').dblclick();
    await expect
      .poll(async () => (await camera(page)).target[0], { timeout: 10_000 })
      .toBeCloseTo(-30_000, 0);
  });
});
