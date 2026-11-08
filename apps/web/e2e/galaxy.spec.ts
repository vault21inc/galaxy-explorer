import { expect, test } from '@playwright/test';
import { framesDuring, waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Sky stars (tuning.ts SKY_STAR_COUNT) plus depth stars at the default quality, Medium. */
const SKY_POINTS = 5_000;
const DEPTH_STARS = 20_000;
/** rendering.md §2 and M2-T2: the background may use at most five draw calls. */
const BACKGROUND_DRAW_CALL_BUDGET = 5;

test.describe('the galaxy background', () => {
  test('draws the disc, glow, depth stars and sky within its draw-call budget', async ({
    page,
  }) => {
    // "After the Fall" has no objects, so every draw call is the background's.
    await page.goto('/u/example-universe/after-the-fall');
    await waitForFirstFrame(page);
    // The depth stars arrive from the worker a moment after the disc.
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.renderInfo()?.points), {
        timeout: 15_000,
      })
      .toBe(SKY_POINTS + DEPTH_STARS);

    const info = await page.evaluate(() => window.__GE_TEST__?.renderInfo());
    expect(info?.calls).toBeLessThanOrEqual(BACKGROUND_DRAW_CALL_BUDGET);
    // The baked disc is the only texture.
    expect(info?.textures).toBe(1);
  });

  test('renders nothing while idle', async ({ page }) => {
    await page.goto('/u/example-universe/main');
    await waitForFirstFrame(page);
    await waitForIdle(page);
    expect(await framesDuring(page, 3_000)).toBe(0);
  });

  test('frames the whole galaxy from above at the start', async ({ page }) => {
    await page.goto('/u/example-universe/main');
    await waitForFirstFrame(page);
    // The demo galaxy's radius is 50,000 ly; the camera starts 2.2 radii out (tuning.ts), once
    // the galaxy view's code and payload have loaded.
    const distance = async () => {
      const pose = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
      const [x = 0, y = 0, z = 0] = pose?.position ?? [];
      return Math.round(Math.hypot(x, y, z));
    };
    await expect.poll(distance, { timeout: 15_000 }).toBe(110_000);
    const pose = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
    expect(pose?.target).toEqual([0, 0, 0]);
    expect(pose?.position[1]).toBeGreaterThan(0);
  });

  test('switching maps bakes one disc per map, reuses it, and leaks nothing', async ({ page }) => {
    const info = () => page.evaluate(() => window.__GE_TEST__?.renderInfo());
    await page.goto('/u/example-universe/main');
    await waitForFirstFrame(page);
    await expect
      .poll(async () => (await info())?.points, { timeout: 15_000 })
      .toBe(SKY_POINTS + DEPTH_STARS);

    // "After the Fall" has its own galaxy settings, so its own disc: three textures with the
    // first map's disc and the region sprite.
    await page.getByRole('button', { name: 'Map: The Present Era' }).click();
    await page.getByRole('menuitemradio', { name: 'After the Fall' }).click();
    await expect(page).toHaveURL(/after-the-fall$/);
    await expect.poll(async () => (await info())?.textures, { timeout: 15_000 }).toBe(3);

    // Back on the first map, its disc comes from the bake cache: still three textures. The
    // geometries are the sky, disc, glow, depth stars, bodies and regions, so the other map's
    // were disposed.
    // Polled as a whole: until the first frame after Back, the numbers describe the other map.
    await page.goBack();
    await expect
      .poll(info, { timeout: 15_000 })
      .toMatchObject({ points: SKY_POINTS + DEPTH_STARS, textures: 3, geometries: 6 });
  });
});
