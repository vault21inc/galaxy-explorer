import { expect, test, type Page } from '@playwright/test';
import { galaxyObjects, systemChildren } from './demo.ts';
import { framesDuring, waitForFirstFrame, waitForIdle } from './test-hooks.ts';

const MAP = '/u/example-universe/main';

interface OnScreen {
  id: string;
  name: string;
  x: number;
  y: number;
}

/** Demo bodies on screen, each at least 40 px from every other object, so clicks are clear. */
async function clearTargets(page: Page): Promise<OnScreen[]> {
  const objects = await galaxyObjects(page.request, 'example-universe', 'main');
  await expect
    .poll(
      () => page.evaluate((id) => window.__GE_TEST__?.screenPositionOf(id), objects[0]?.id ?? ''),
      {
        timeout: 15_000,
      },
    )
    .not.toBeNull();
  await waitForIdle(page);
  const placed = await page.evaluate(
    (list) =>
      list.map((object) => ({
        ...object,
        at: window.__GE_TEST__?.screenPositionOf(object.id) ?? null,
      })),
    objects.map((object) => ({ id: object.id, name: object.namePlain, baseType: object.baseType })),
  );
  const visible = placed.filter((object) => object.at !== null);
  return visible
    .filter((object) => !['nebula', 'anomaly'].includes(object.baseType))
    .filter((object) =>
      visible.every(
        (other) =>
          other.id === object.id ||
          Math.hypot(
            (other.at?.x ?? 0) - (object.at?.x ?? 0),
            (other.at?.y ?? 0) - (object.at?.y ?? 0),
          ) > 40,
      ),
    )
    .map((object) => ({
      id: object.id,
      name: object.name,
      x: object.at?.x ?? 0,
      y: object.at?.y ?? 0,
    }));
}

const selected = (page: Page) => page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);

async function openMap(page: Page) {
  await page.goto(MAP);
  await waitForFirstFrame(page);
  const targets = await clearTargets(page);
  expect(targets.length).toBeGreaterThanOrEqual(2);
  return targets;
}

test.describe('picking, hover and selection', () => {
  test('click selects, Shift-click adds, Esc clears, and the URL follows', async ({ page }) => {
    const [first, second] = await openMap(page);
    if (!first || !second) throw new Error('Two targets expected.');

    await page.mouse.click(first.x, first.y);
    expect(await selected(page)).toEqual([first.id]);
    await expect(page).toHaveURL(new RegExp(`select=${first.id}$`));
    await expect(page.getByText(`Selected ${first.name}`)).toBeAttached();

    await page.keyboard.down('Shift');
    await page.mouse.click(second.x, second.y);
    await page.keyboard.up('Shift');
    expect(await selected(page)).toEqual([first.id, second.id]);
    await expect(page).toHaveURL(new RegExp(`select=${first.id}%2C${second.id}$`));

    await page.keyboard.press('Escape');
    expect(await selected(page)).toEqual([]);
    await expect(page).toHaveURL(MAP);
  });

  test('the selection survives a reload through the URL', async ({ page }) => {
    const [first, second] = await openMap(page);
    if (!first || !second) throw new Error('Two targets expected.');
    await page.mouse.click(first.x, first.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(second.x, second.y);
    await page.keyboard.up('Shift');
    await expect.poll(() => selected(page)).toEqual([first.id, second.id]);

    await page.reload();
    await waitForFirstFrame(page);
    await expect.poll(() => selected(page)).toEqual([first.id, second.id]);
  });

  test('a click on empty space clears; Cmd/Ctrl-click toggles', async ({ page }) => {
    const [first] = await openMap(page);
    if (!first) throw new Error('A target expected.');
    const primary =
      (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';

    await page.mouse.click(first.x, first.y);
    expect(await selected(page)).toEqual([first.id]);
    // A spot in the top bar's shadow but on the canvas, far from any object.
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click((box?.x ?? 0) + 5, (box?.y ?? 0) + (box?.height ?? 0) - 5);
    expect(await selected(page)).toEqual([]);

    await page.keyboard.down(primary);
    await page.mouse.click(first.x, first.y);
    expect(await selected(page)).toEqual([first.id]);
    await page.mouse.click(first.x, first.y);
    expect(await selected(page)).toEqual([]);
    await page.keyboard.up(primary);
  });

  test('hovering shows the pointer cursor and a ring, without rendering while still', async ({
    page,
  }) => {
    const [first] = await openMap(page);
    if (!first) throw new Error('A target expected.');
    const callsBefore = await page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls ?? 0);

    await page.mouse.move(first.x, first.y);
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.hoveredId())).toBe(first.id);
    await expect(page.locator('canvas')).toHaveCSS('cursor', 'pointer');
    // The ring is one more draw call.
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls))
      .toBe(callsBefore + 1);
    // Holding the pointer still renders nothing: hover lives outside React and the frame loop.
    await waitForIdle(page);
    expect(await framesDuring(page, 1_000)).toBe(0);

    await page.mouse.move(first.x + 200, first.y + 200);
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.hoveredId())).toBeNull();
  });

  test('a double-click flies to an object that opens no view, and selects it', async ({ page }) => {
    // Every body in the demo galaxy opens a view (M5-T2), so this happens in a system view.
    const fenwick = (await galaxyObjects(page.request, 'example-universe', 'main')).find(
      (object) => object.namePlain === 'Fenwick',
    );
    const watch = (await systemChildren(page.request, fenwick?.id ?? '')).find(
      (child) => child.namePlain === 'Fenwick Watch',
    );
    if (!fenwick || !watch) throw new Error('Fenwick Watch expected.');
    await page.goto(`${MAP}/view/${fenwick.id}`);
    await waitForFirstFrame(page);
    const where = () =>
      page.evaluate((id) => window.__GE_TEST__?.screenPositionOf(id) ?? null, watch.id);
    await expect.poll(where).not.toBeNull();
    await waitForIdle(page);
    const at = await where();
    const center = await page.evaluate(
      (id) => window.__GE_TEST__?.drawnObject(id)?.center,
      watch.id,
    );
    await page.mouse.dblclick(at?.x ?? 0, at?.y ?? 0);
    await waitForIdle(page);
    expect(await page.evaluate(() => window.__GE_TEST__?.selectedIds())).toEqual([watch.id]);
    const pose = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
    const [tx = 0, ty = 0, tz = 0] = pose?.target ?? [];
    const [cx = 0, cy = 0, cz = 0] = center ?? [];
    expect(Math.hypot(tx - cx, ty - cy, tz - cz)).toBeLessThan(0.01);
    const [px = 0, py = 0, pz = 0] = pose?.position ?? [];
    // Close in, but framing the neighborhood (SYSTEM_FLY_TO_MIN_RADIUS_SU), not the station.
    expect(Math.hypot(px - tx, py - ty, pz - tz)).toBeLessThan(5);
    expect(await page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');
  });

  test('F frames the selection', async ({ page }) => {
    const [first] = await openMap(page);
    if (!first) throw new Error('A target expected.');
    await page.mouse.click(first.x, first.y);
    await page.keyboard.press('f');
    await waitForIdle(page);
    const pose = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
    const center = await page.evaluate(
      (id) => window.__GE_TEST__?.drawnObject(id)?.center,
      first.id,
    );
    const [tx = 0, , tz = 0] = pose?.target ?? [];
    expect(Math.hypot(tx - (center?.[0] ?? 0), tz - (center?.[2] ?? 0))).toBeLessThan(1);
  });
});
