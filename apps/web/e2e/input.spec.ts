import { expect, test, type Page } from '@playwright/test';
import { galaxyObjects } from './demo.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

type Vec3 = [number, number, number];
interface Pose {
  position: Vec3;
  target: Vec3;
}

const pose = async (page: Page): Promise<Pose> => {
  const value = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
  if (!value) throw new Error('No camera pose.');
  return value;
};

/** The camera's angle around the vertical axis through its target, in radians. */
const azimuth = ({ position, target }: Pose) =>
  Math.atan2(position[0] - target[0], position[2] - target[2]);

const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(...a.map((value, i) => value - (b[i] ?? 0)));

/** Opens the demo map and waits until its camera has settled at the starting pose. */
async function openDemo(page: Page) {
  await page.goto('/u/example-universe/main');
  await waitForFirstFrame(page);
  await expect
    .poll(async () => Math.round(distance((await pose(page)).position, [0, 0, 0])), {
      timeout: 15_000,
    })
    .toBe(110_000);
  await waitForIdle(page);
}

async function canvasCenter(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('The canvas has no size.');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(
  page: Page,
  options: { button?: 'left' | 'right' | 'middle'; dx: number; dy: number; key?: string },
) {
  const center = await canvasCenter(page);
  if (options.key) await page.keyboard.down(options.key);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: options.button ?? 'left' });
  await page.mouse.move(center.x + options.dx, center.y + options.dy, { steps: 12 });
  await page.mouse.up({ button: options.button ?? 'left' });
  if (options.key) await page.keyboard.up(options.key);
  await waitForIdle(page);
}

/** The key the app treats as primary: Cmd where it detected macOS, Ctrl elsewhere. */
async function primaryKey(page: Page): Promise<string> {
  const platform = await page.evaluate(() => window.__GE_TEST__?.platform());
  return platform === 'mac' ? 'Meta' : 'Control';
}

test.describe('camera input (ux.md §3–4)', () => {
  test('left-drag rotates around the target', async ({ page }) => {
    await openDemo(page);
    const before = await pose(page);
    await drag(page, { dx: 250, dy: 0 });
    const after = await pose(page);
    expect(Math.abs(azimuth(after) - azimuth(before))).toBeGreaterThan(0.1);
    expect(distance(after.target, before.target)).toBeLessThan(1);
  });

  test('right-drag pans: the target moves', async ({ page }) => {
    await openDemo(page);
    const before = await pose(page);
    await drag(page, { button: 'right', dx: 200, dy: 80 });
    const after = await pose(page);
    expect(distance(after.target, before.target)).toBeGreaterThan(1_000);
  });

  test('Cmd-drag on a Mac, Ctrl-drag elsewhere, pans', async ({ page }) => {
    await openDemo(page);
    const before = await pose(page);
    await drag(page, { dx: 200, dy: 80, key: await primaryKey(page) });
    const after = await pose(page);
    expect(distance(after.target, before.target)).toBeGreaterThan(1_000);
    // A pan keeps the viewing angle.
    expect(Math.abs(azimuth(after) - azimuth(before))).toBeLessThan(0.01);
  });

  test('the browser menu never opens on the canvas', async ({ page }) => {
    await openDemo(page);
    await page.evaluate(() => {
      window.addEventListener('contextmenu', (event) => {
        (window as unknown as { menuBlocked: boolean }).menuBlocked = event.defaultPrevented;
      });
    });
    const center = await canvasCenter(page);
    await page.mouse.click(center.x, center.y, { button: 'right' });
    expect(
      await page.evaluate(() => (window as unknown as { menuBlocked: boolean }).menuBlocked),
    ).toBe(true);
  });

  test('the wheel over an off-center object moves the target toward it', async ({ page }) => {
    const objects = await galaxyObjects(page.request, 'example-universe', 'main');
    await openDemo(page);
    const center = await canvasCenter(page);
    // The visible object farthest from the screen's center.
    const candidates = await page.evaluate(
      (ids) => ids.map((id) => ({ id, at: window.__GE_TEST__?.screenPositionOf(id) ?? null })),
      objects.map((object) => object.id),
    );
    const [farthest] = candidates
      .filter((candidate) => candidate.at !== null)
      .sort(
        (a, b) =>
          distance([b.at?.x ?? 0, b.at?.y ?? 0], [center.x, center.y]) -
          distance([a.at?.x ?? 0, a.at?.y ?? 0], [center.x, center.y]),
      );
    if (!farthest?.at) throw new Error('No object on screen.');
    const objectCenter = (
      await page.evaluate((id) => window.__GE_TEST__?.drawnObject(id), farthest.id)
    )?.center;
    if (!objectCenter) throw new Error('The object was not drawn.');

    const before = distance((await pose(page)).target, objectCenter);
    await page.mouse.move(farthest.at.x, farthest.at.y);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120);
    await waitForIdle(page);
    const after = distance((await pose(page)).target, objectCenter);
    expect(after).toBeLessThan(before * 0.8);
  });

  test('arrow keys pan, + and − zoom, H resets', async ({ page }) => {
    await openDemo(page);
    const start = await pose(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await waitForIdle(page);
    const panned = await pose(page);
    expect(distance(panned.target, start.target)).toBeGreaterThan(1_000);

    await page.keyboard.press('+');
    await waitForIdle(page);
    const zoomed = await pose(page);
    expect(distance(zoomed.position, zoomed.target)).toBeLessThan(
      distance(panned.position, panned.target) * 0.9,
    );

    await page.keyboard.press('h');
    await waitForIdle(page);
    const reset = await pose(page);
    expect(distance(reset.target, start.target)).toBeLessThan(1);
    expect(distance(reset.position, start.position)).toBeLessThan(1);
  });

  test('camera keys are ignored while typing', async ({ page }) => {
    await page.goto('/');
    await waitForFirstFrame(page);
    await waitForIdle(page);
    const before = await pose(page);
    await page.getByLabel('Name').click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('h');
    await waitForIdle(page);
    expect(await pose(page)).toEqual(before);
  });

  test('zooming keeps the target near the galactic plane', async ({ page }) => {
    await openDemo(page);
    const center = await canvasCenter(page);
    // Toward the lower part of the screen, where the cursor ray would dive under the disc.
    await page.mouse.move(center.x, center.y * 1.6);
    for (let i = 0; i < 25; i++) await page.mouse.wheel(0, -200);
    await waitForIdle(page);
    const { target } = await pose(page);
    // tuning.ts GALAXY_TARGET_HEIGHT_RADII: 0.05 × 50,000 ly.
    expect(Math.abs(target[1])).toBeLessThanOrEqual(2_500 + 1);
  });
});
