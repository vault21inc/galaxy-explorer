import { expect, test } from '@playwright/test';
import { frameCount, framesDuring, waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** The idle budget: no frames at all while nothing moves (rendering.md §2). */
const IDLE_CHECK_MS = 3_000;

test.describe('the app shell', () => {
  test('loads, and renders no frames while idle', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Galaxy Explorer' })).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    await waitForFirstFrame(page);
    await waitForIdle(page);

    expect(await framesDuring(page, IDLE_CHECK_MS)).toBe(0);
  });

  test('renders while the camera orbits, then stops when it settles', async ({ page }) => {
    await page.goto('/');
    await waitForFirstFrame(page);
    await waitForIdle(page);
    const poseBefore = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
    const framesBefore = await frameCount(page);

    // A real left-button drag across the canvas orbits the camera.
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('The canvas has no size.');
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 200, center.y - 80, { steps: 10 });
    await page.mouse.up();

    await waitForIdle(page);
    expect(await frameCount(page)).toBeGreaterThan(framesBefore);
    expect(await page.evaluate(() => window.__GE_TEST__?.cameraPose())).not.toEqual(poseBefore);
    expect(await framesDuring(page, IDLE_CHECK_MS)).toBe(0);
  });

  test('draws only the sky, in a single draw call, where there is no view', async ({ page }) => {
    await page.goto('/');
    await waitForFirstFrame(page);

    const info = await page.evaluate(() => window.__GE_TEST__?.renderInfo());
    expect(info).toMatchObject({ calls: 1, points: 5_000 });
  });

  test('reaches the API through the web server', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: 'ok', db: 'ok' } });
  });

  test('keeps the canvas when navigating to a map', async ({ page }) => {
    await page.goto('/u/example-universe/main');
    await expect(page.getByRole('button', { name: 'Map: The Present Era' })).toBeVisible();
    await waitForFirstFrame(page);
    await page.getByRole('link', { name: 'Galaxy Explorer' }).click();
    await expect(page).toHaveURL('/');
    // Same page, same canvas: the frame counter keeps counting instead of starting again.
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(await frameCount(page)).toBeGreaterThan(0);
  });
});
