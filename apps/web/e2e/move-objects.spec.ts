import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';
import { getJson } from './api.ts';

type Vec3 = [number, number, number];
const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A fresh universe whose map holds two systems, A at the center and B to its east. */
async function setUp(request: APIRequestContext) {
  const slug = `move-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const universe = (
    (await (
      await request.post('/api/v1/universes', { data: { slug, name: plain('Move test') } })
    ).json()) as {
      data: { id: string };
    }
  ).data;
  const map = (
    (await (
      await request.post(`/api/v1/universes/${universe.id}/maps`, {
        data: { slug: 'main', name: plain('Main') },
      })
    ).json()) as { data: { id: string } }
  ).data;
  const create = async (name: string, x: number, z: number) =>
    (
      (await (
        await request.post(`/api/v1/maps/${map.id}/objects`, {
          data: { name: plain(name), baseType: 'system', explorable: true, x, y: 0, z },
        })
      ).json()) as { data: { id: string } }
    ).data.id;
  const a = await create('Alpha', 0, 0);
  const b = await create('Beta', 9_000, 3_000);
  return { url: `/u/${slug}/main`, universeId: universe.id, a, b };
}

async function positionOf(request: APIRequestContext, id: string): Promise<Vec3> {
  const object = (
    (await getJson(request, `/api/v1/objects/${id}`)) as {
      data: { x: number; y: number; z: number };
    }
  ).data;
  return [object.x, object.y, object.z];
}

async function batches(request: APIRequestContext, universeId: string) {
  const history = (await getJson(request, `/api/v1/universes/${universeId}/history`)) as {
    data: { description: string }[];
  };
  return history.data;
}

async function screenOf(page: Page, id: string) {
  const at = await page.evaluate((objectId) => window.__GE_TEST__?.screenPositionOf(objectId), id);
  if (!at) throw new Error(`${id} isn't on screen.`);
  return at;
}

async function open(page: Page, url: string, a: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await expect
    .poll(() => page.evaluate((id) => window.__GE_TEST__?.screenPositionOf(id), a), {
      timeout: 15_000,
    })
    .not.toBeNull();
  await waitForIdle(page);
  await page.keyboard.press('e');
}

async function cameraDistanceTo(page: Page, point: Vec3) {
  const pose = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
  const [x = 0, y = 0, z = 0] = pose?.position ?? [];
  return Math.hypot(x - point[0], y - point[1], z - point[2]);
}

const distance = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

test.describe('moving objects (M3-T3)', () => {
  test('a dragged object follows the cursor, is saved, and makes one batch', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url, s.a);
    const before = (await batches(page.request, s.universeId)).length;
    const start = await screenOf(page, s.a);
    const end = { x: start.x + 160, y: start.y + 70 };
    const plane = (p: { x: number; y: number }) =>
      page.evaluate(({ x, y }) => window.__GE_TEST__?.workPlanePointAt(x, y), p);
    const [from, to] = [await plane(start), await plane(end)];
    if (!from || !to) throw new Error('Both points should be on the plane.');
    const expected: Vec3 = [to[0] - from[0], 0, to[2] - from[2]];

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    // While dragging, the object is under the cursor.
    const midway = await screenOf(page, s.a);
    expect(Math.hypot(midway.x - end.x, midway.y - end.y)).toBeLessThan(3);
    await page.mouse.up();

    const tolerance = (await cameraDistanceTo(page, expected)) * 0.01;
    await expect
      .poll(async () => distance(await positionOf(page.request, s.a), expected))
      .toBeLessThan(tolerance);
    await waitForIdle(page);
    const settled = await screenOf(page, s.a);
    expect(Math.hypot(settled.x - end.x, settled.y - end.y)).toBeLessThan(3);

    const after = await batches(page.request, s.universeId);
    expect(after.length).toBe(before + 1);
    expect(after[0]?.description).toBe('Moved 1 object');
  });

  test('dragging two selected objects keeps their offset', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url, s.a);
    const a = await screenOf(page, s.a);
    const b = await screenOf(page, s.b);
    await page.mouse.click(a.x, a.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(b.x, b.y);
    await page.keyboard.up('Shift');
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds().length)).toBe(2);
    const before = (await batches(page.request, s.universeId)).length;

    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x - 120, a.y + 90, { steps: 10 });
    await page.mouse.up();

    await expect.poll(async () => (await positionOf(page.request, s.a))[0]).not.toBe(0);
    const [movedA, movedB] = [
      await positionOf(page.request, s.a),
      await positionOf(page.request, s.b),
    ];
    const deltaA = [movedA[0] - 0, movedA[2] - 0];
    const deltaB = [movedB[0] - 9_000, movedB[2] - 3_000];
    expect(deltaB[0]).toBeCloseTo(deltaA[0] ?? 0, 3);
    expect(deltaB[1]).toBeCloseTo(deltaA[1] ?? 0, 3);
    const after = await batches(page.request, s.universeId);
    expect(after.length).toBe(before + 1);
    expect(after[0]?.description).toBe('Moved 2 objects');
  });

  test('the gizmo changes only the height', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url, s.a);
    const a = await screenOf(page, s.a);
    await page.mouse.click(a.x, a.y);
    await waitForIdle(page);
    const handle = await page.evaluate(() => window.__GE_TEST__?.gizmoHandleAt());
    if (!handle) throw new Error('The gizmo should show for a selection.');
    await page.mouse.move(handle.x, handle.y, { steps: 3 });
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.gizmoAxis())).toBe('Y');

    await page.mouse.down();
    await page.mouse.move(handle.x + 40, handle.y - 60, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await positionOf(page.request, s.a))[1]).not.toBe(0);
    const [x, y, z] = await positionOf(page.request, s.a);
    expect(x).toBe(0);
    expect(z).toBe(0);
    expect(y).toBeGreaterThan(0);
  });

  test('a typed position applies', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url, s.a);
    const a = await screenOf(page, s.a);
    await page.mouse.click(a.x, a.y);
    const field = page.getByLabel('Position X');
    await expect(field).toHaveValue('0');
    await field.fill('1234');
    await field.press('Enter');
    await expect.poll(async () => (await positionOf(page.request, s.a))[0]).toBe(1234);
  });
});
