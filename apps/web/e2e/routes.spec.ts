import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Routes (M4-T7): the Route tool, "Create route" on a selection, the panel and the line. */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });
type Vec3 = [number, number, number];
const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'] as const;

interface Setup {
  url: string;
  mapId: string;
  ids: Record<(typeof NAMES)[number], string>;
}

async function setUp(request: APIRequestContext): Promise<Setup> {
  const slug = `routes-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('Routes test') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const ids: Partial<Setup['ids']> = {};
  // A zigzag, so no three systems are in line and each segment is clear of the others.
  for (const [index, name] of NAMES.entries()) {
    ids[name] = await post(`/api/v1/maps/${mapId}/objects`, {
      name: plain(name),
      baseType: 'system',
      x: (index - 2) * 7_000,
      y: 0,
      z: index % 2 === 0 ? -3_000 : 3_000,
    });
  }
  return { url: `/u/${slug}/main`, mapId, ids: ids as Setup['ids'] };
}

interface Route {
  id: string;
  namePlain: string;
  waypoints: string[];
}

async function routes(page: Page, s: Setup): Promise<Route[]> {
  const view = (await getJson(page.request, `/api/v1/maps/${s.mapId}/views/galaxy`)) as {
    data: { routes: Route[] };
  };
  return view.data.routes;
}

async function positionOf(page: Page, id: string): Promise<Vec3> {
  const object = (await getJson(page.request, `/api/v1/objects/${id}`)) as {
    data: { x: number; y: number; z: number };
  };
  return [object.data.x, object.data.y, object.data.z];
}

async function screenOf(page: Page, id: string) {
  const at = await page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id);
  if (!at) throw new Error(`${id} is off screen.`);
  return at;
}

async function clickObject(page: Page, id: string, button: 'left' | 'right' = 'left') {
  const at = await screenOf(page, id);
  await page.mouse.click(at.x, at.y, { button });
}

/** Opens the map in edit mode, optionally with a selection (`?select=` keeps its order). */
async function open(page: Page, s: Setup, select: string[] = []) {
  await page.goto(select.length > 0 ? `${s.url}?select=${select.join(',')}` : s.url);
  await waitForFirstFrame(page);
  await waitForIdle(page);
  await page.keyboard.press('e');
}

const routeLine = (page: Page, id: string) =>
  page.evaluate((target) => window.__GE_TEST__?.routeLine(target) ?? null, id);

const near = (p: readonly number[], q: readonly number[], tolerance: number) =>
  Math.hypot((p[0] ?? 0) - (q[0] ?? 0), (p[2] ?? 0) - (q[2] ?? 0)) < tolerance;

test.describe('routes (M4-T7)', () => {
  test('the Route tool draws a route through four systems, and moving one moves the line', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await open(page, s);
    const tools = page.getByRole('toolbar', { name: 'Edit tools' });
    await tools.getByRole('button', { name: 'Route' }).click();
    await expect(tools.getByRole('status')).toContainText('Click objects in order');

    // Four clicks, one taken back with Backspace and clicked again.
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Echo'] as const) {
      await clickObject(page, s.ids[name]);
    }
    await expect(tools.getByRole('status')).toContainText('4 stops');
    await page.keyboard.press('Backspace');
    await expect(tools.getByRole('status')).toContainText('3 stops');
    await clickObject(page, s.ids.Delta);
    await page.keyboard.press('Enter');

    const expected = [s.ids.Alpha, s.ids.Bravo, s.ids.Charlie, s.ids.Delta];
    await expect
      .poll(() => routes(page, s))
      .toEqual([expect.objectContaining({ namePlain: 'Alpha to Delta', waypoints: expected })]);
    const [route] = await routes(page, s);
    const routeId = route?.id ?? '';
    // The tool is off, the new route is selected, and its panel lists the waypoints in order.
    await expect(tools.getByRole('button', { name: 'Route' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds()))
      .toEqual([routeId]);
    const waypoints = page.getByRole('list', { name: 'Waypoints' }).getByRole('listitem');
    await expect(waypoints).toHaveText([/Alpha/, /Bravo/, /Charlie/, /Delta/]);
    // Its waypoints are ringed, not the route.
    await expect
      .poll(async () => (await page.evaluate(() => window.__GE_TEST__?.ringedIds()))?.sort())
      .toEqual([...expected].sort());

    // Drawn through the four systems.
    const line = await routeLine(page, routeId);
    expect(line?.waypointIds).toEqual(expected);
    expect(line?.dashed).toBe(false);
    const bravo = await positionOf(page, s.ids.Bravo);
    expect(near(line?.points[1] ?? [], bravo, 1)).toBe(true);

    // Drag Bravo: the line follows during the drag, and after the save.
    await page.keyboard.press('Escape');
    await waitForIdle(page);
    const start = await screenOf(page, s.ids.Bravo);
    const end = { x: start.x + 60, y: start.y + 80 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    const during = await routeLine(page, routeId);
    expect(near(during?.points[1] ?? [], bravo, 500)).toBe(false);
    await page.mouse.up();
    await expect
      .poll(async () => near(await positionOf(page, s.ids.Bravo), bravo, 500))
      .toBe(false);
    const moved = await positionOf(page, s.ids.Bravo);
    await expect
      .poll(async () => near((await routeLine(page, routeId))?.points[1] ?? [], moved, 1))
      .toBe(true);
  });

  test('Create route follows the selection order; the panel reorders and removes waypoints', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await open(page, s, [s.ids.Charlie, s.ids.Alpha, s.ids.Echo]);
    await clickObject(page, s.ids.Alpha, 'right');
    await page.getByRole('menuitem', { name: 'Create route' }).click();
    await expect
      .poll(() => routes(page, s))
      .toEqual([
        expect.objectContaining({
          namePlain: 'Charlie to Echo',
          waypoints: [s.ids.Charlie, s.ids.Alpha, s.ids.Echo],
        }),
      ]);

    // Alpha's handle, Arrow Up: Alpha goes first.
    const list = page.getByRole('list', { name: 'Waypoints' });
    await list.getByRole('button', { name: 'Move Alpha', exact: true }).focus();
    await page.keyboard.press('ArrowUp');
    await expect
      .poll(async () => (await routes(page, s))[0]?.waypoints)
      .toEqual([s.ids.Alpha, s.ids.Charlie, s.ids.Echo]);
    await list.getByRole('button', { name: 'Remove Charlie from the route' }).click();
    await expect
      .poll(async () => (await routes(page, s))[0]?.waypoints)
      .toEqual([s.ids.Alpha, s.ids.Echo]);
    await expect(list.getByRole('listitem')).toHaveCount(2);
  });

  test('a click on the line selects the route; Delete removes it with its waypoints', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    const response = await page.request.post('/api/v1/batch', {
      data: {
        description: 'Create route',
        operations: [
          { op: 'create', kind: 'route', mapId: s.mapId, data: { name: plain('Run') } },
          { op: 'setWaypoints', id: '$op:0', data: [s.ids.Alpha, s.ids.Bravo] },
        ],
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    await open(page, s);
    const [route] = await routes(page, s);
    const routeId = route?.id ?? '';
    // Drawn (and so pickable) once the view has loaded it.
    await expect.poll(() => routeLine(page, routeId)).not.toBeNull();
    await waitForIdle(page);

    // Halfway along the segment, well away from both systems.
    const [a, b] = [await positionOf(page, s.ids.Alpha), await positionOf(page, s.ids.Bravo)];
    const middle: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const at = await page.evaluate((point) => window.__GE_TEST__?.projectPoint(point), middle);
    if (!at) throw new Error('The route should be on screen.');
    await page.mouse.click(at.x, at.y);
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds()))
      .toEqual([routeId]);
    // A route has no position of its own: no height gizmo.
    expect(await page.evaluate(() => window.__GE_TEST__?.gizmoHandleAt())).toBeNull();
    // Its label sits on the line.
    await expect
      .poll(async () =>
        (await page.evaluate(() => window.__GE_TEST__?.visibleLabels()))?.map((l) => l.text),
      )
      .toContain('Run');

    await page.locator('canvas').focus();
    await page.keyboard.press('Delete');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('Delete “Run”?');
    await expect(dialog).toContainText('2 route waypoints');
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => routes(page, s)).toEqual([]);
    await expect.poll(() => routeLine(page, routeId)).toBeNull();
  });
});
