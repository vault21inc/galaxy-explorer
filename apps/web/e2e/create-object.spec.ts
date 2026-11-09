import { expect, test, type Page } from '@playwright/test';
import { framesDuring, waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * A fresh universe with one empty map for each test, so creating objects never disturbs the
 * demo maps other tests count on.
 */
async function freshMap(page: Page): Promise<string> {
  const slug = `create-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const universe = await page.request.post('/api/v1/universes', {
    data: { slug, name: { format: 'plain', source: 'Create test', spoiler: false } },
  });
  expect(universe.ok()).toBe(true);
  const { data } = (await universe.json()) as { data: { id: string } };
  const map = await page.request.post(`/api/v1/universes/${data.id}/maps`, {
    data: { slug: 'main', name: { format: 'plain', source: 'Main', spoiler: false } },
  });
  expect(map.ok()).toBe(true);
  return `/u/${slug}/main`;
}

async function startPlacing(page: Page, type: string) {
  await page.keyboard.press('e');
  await page.getByRole('button', { name: /^Add/ }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toContainText(
    `Click to place a ${type.toLowerCase()}`,
  );
}

async function canvasPoint(page: Page, fx: number, fy: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('The canvas has no size.');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

test.describe('creating objects (M3-T2)', () => {
  test('adds a system where the plane was clicked, selected, with its name field focused', async ({
    page,
  }) => {
    await page.goto(await freshMap(page));
    await waitForFirstFrame(page);
    await waitForIdle(page);
    await startPlacing(page, 'System');

    const at = await canvasPoint(page, 0.35, 0.62);
    await page.mouse.move(at.x, at.y, { steps: 5 });
    const expected = await page.evaluate(
      ({ x, y }) => window.__GE_TEST__?.workPlanePointAt(x, y),
      at,
    );
    if (!expected) throw new Error('The point should be on the plane.');
    // The ghost follows the pointer.
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.placement()?.baseType))
      .toBe('system');

    await page.mouse.click(at.x, at.y);
    await expect
      .poll(async () => {
        const ids = await page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);
        return ids.length === 1 && !ids[0]?.startsWith('pending');
      })
      .toBe(true);
    const [id] = await page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);
    await expect
      .poll(() =>
        page.evaluate((objectId) => window.__GE_TEST__?.drawnObject(objectId)?.label, id ?? ''),
      )
      .toBe('New system');

    // Within 1 % of the camera's distance to the point.
    const result = await page.evaluate(
      (objectId) => ({
        center: window.__GE_TEST__?.drawnObject(objectId)?.center,
        camera: window.__GE_TEST__?.cameraPose()?.position,
      }),
      id ?? '',
    );
    const [cx = 0, cy = 0, cz = 0] = result.center ?? [];
    const [px = 0, py = 0, pz = 0] = result.camera ?? [];
    const error = Math.hypot(cx - expected[0], cy - expected[1], cz - expected[2]);
    const cameraDistance = Math.hypot(px - expected[0], py - expected[1], pz - expected[2]);
    expect(error).toBeLessThan(cameraDistance * 0.01);
    expect(await page.evaluate(() => window.__GE_TEST__?.placement())).toBeNull();

    // The name field has focus: typing renames it, and the label follows.
    const name = page.getByLabel('Name', { exact: true });
    await expect(name).toBeFocused();
    await page.keyboard.type('Nova Prime');
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        page.evaluate((objectId) => window.__GE_TEST__?.drawnObject(objectId)?.label, id ?? ''),
      )
      .toBe('Nova Prime');
  });

  test('Esc cancels placing', async ({ page }) => {
    await page.goto(await freshMap(page));
    await waitForFirstFrame(page);
    await startPlacing(page, 'Station');
    const at = await canvasPoint(page, 0.5, 0.6);
    await page.mouse.move(at.x, at.y, { steps: 5 });
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.placement())).not.toBeNull();
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.placement())).toBeNull();
    await page.mouse.click(at.x, at.y);
    await waitForIdle(page);
    // Nothing was created: the empty map still draws only its background.
    expect(await page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls)).toBe(4);
  });

  test('a failed create leaves no ghost and shows a toast', async ({ page }) => {
    await page.goto(await freshMap(page));
    await waitForFirstFrame(page);
    await page.route('**/api/v1/maps/*/objects', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Server error',
            status: 500,
            detail: 'Boom.',
          }),
        });
      } else {
        await route.fallback();
      }
    });
    await startPlacing(page, 'System');
    const at = await canvasPoint(page, 0.4, 0.6);
    await page.mouse.move(at.x, at.y, { steps: 5 });
    await page.mouse.click(at.x, at.y);

    await expect(page.getByRole('alert')).toContainText("Couldn't add the object: Boom.");
    expect(await page.evaluate(() => window.__GE_TEST__?.placement())).toBeNull();
    // The optimistic object was taken back: only the background is drawn again.
    await waitForIdle(page);
    expect(await page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls)).toBe(4);
    expect(await framesDuring(page, 500)).toBe(0);
  });
});
