import { expect, test, type Page } from '@playwright/test';
import { galaxyObjects, systemChildren } from './demo.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Entering and leaving views by zooming, double-clicking and Enter (M5-T2, rendering.md §4). */

const MAP = '/u/example-universe/main';

const level = (page: Page) => page.evaluate(() => window.__GE_TEST__?.level() ?? null);
const transitions = (page: Page) => page.evaluate(() => window.__GE_TEST__?.transitions() ?? -1);

async function settled(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.transitioning() ?? true))
    .toBe(false);
  await waitForIdle(page, 500);
}

async function galaxyId(page: Page, name: string): Promise<string> {
  const found = (await galaxyObjects(page.request, 'example-universe', 'main')).find(
    (object) => object.namePlain === name,
  );
  if (!found) throw new Error(`No demo object ${name}`);
  return found.id;
}

/** Puts the pointer over an object, waiting until it's drawn on screen. */
async function pointAt(page: Page, id: string): Promise<{ x: number; y: number }> {
  const where = () =>
    page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target) ?? null, id);
  await expect.poll(where).not.toBeNull();
  const at = await where();
  if (!at) throw new Error('Not on screen');
  await page.mouse.move(at.x, at.y);
  return at;
}

/** Opens the galaxy view and flies near a system, with the pointer over it. */
async function nearSystem(page: Page, name: string): Promise<string> {
  await page.goto(MAP);
  await waitForFirstFrame(page);
  const id = await galaxyId(page, name);
  await page.evaluate((target) => window.__GE_TEST__?.flyTo(target), id);
  await waitForIdle(page);
  await pointAt(page, id);
  return id;
}

/** Scrolls like a mouse wheel, a notch at a time, until `done` or the notches run out. */
async function scrollUntil(page: Page, deltaY: number, done: () => Promise<boolean>) {
  for (let notch = 0; notch < 80 && !(await done()); notch++) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(60);
  }
}

test.describe('zooming between views', () => {
  test('scrolling in over an explorable system stops, fills the ring, and enters', async ({
    page,
  }) => {
    const aster = await nearSystem(page, 'Aster');
    const before = await transitions(page);
    let ringSeen = false;
    await scrollUntil(page, -100, async () => {
      ringSeen ||= (await page.getByTestId('push-ring').count()) > 0;
      return (await level(page))?.level === 'system';
    });
    expect(ringSeen).toBe(true);
    await expect.poll(() => level(page)).toEqual({ level: 'system', subjectId: aster });
    await expect(page).toHaveURL(`${MAP}/view/${aster}`);
    expect(await transitions(page)).toBe(before + 1);
  });

  test('a burst of trackpad inertia makes exactly one transition', async ({ page }) => {
    const aster = await nearSystem(page, 'Aster');
    // Zoom in until the camera stops at the enter distance and the push begins.
    await scrollUntil(page, -100, async () => (await page.getByTestId('push-ring').count()) > 0);
    await page.waitForTimeout(600); // let that push lapse: the burst starts from nothing
    const before = await transitions(page);

    // Inertia: 60 shrinking deltas a frame apart, far more than one push needs. Sent from the
    // page itself, so they arrive every 16 ms as a trackpad's do, however busy the test runner.
    const at = await pointAt(page, aster);
    await page.evaluate(
      ({ x, y }) =>
        new Promise<void>((resolve) => {
          let step = 0;
          const send = () => {
            const target = document.elementFromPoint(x, y) ?? document.body;
            const deltaY = -Math.max(2, 40 * 0.95 ** step);
            target.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY,
                clientX: x,
                clientY: y,
                bubbles: true,
                cancelable: true,
              }),
            );
            step++;
            if (step < 60) setTimeout(send, 16);
            else resolve();
          };
          send();
        }),
      at,
    );
    await settled(page);
    await page.waitForTimeout(500);
    expect(await transitions(page)).toBe(before + 1);
    expect(await level(page)).toEqual({ level: 'system', subjectId: aster });

    // None of the burst's tail zoomed the new view: the camera is at the view's resting pose,
    // so resetting the view (H) doesn't move it.
    const arrived = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
    await page.keyboard.press('h');
    await settled(page);
    const reset = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
    arrived?.position.forEach((value, axis) => {
      expect(value).toBeCloseTo(reset?.position[axis] ?? Number.NaN, 2);
    });
  });

  test('zooming out of a system view leaves it', async ({ page }) => {
    const aster = await galaxyId(page, 'Aster');
    await page.goto(`${MAP}/view/${aster}`);
    await expect.poll(() => level(page)).toEqual({ level: 'system', subjectId: aster });
    await settled(page);
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await scrollUntil(page, 100, async () => (await level(page))?.level === 'galaxy');
    await expect.poll(() => level(page)).toEqual({ level: 'galaxy', subjectId: null });
  });

  test('zooming in on an object that opens no view stops, and its info opens', async ({ page }) => {
    const fenwick = await galaxyId(page, 'Fenwick');
    const watch = (await systemChildren(page.request, fenwick)).find(
      (child) => child.namePlain === 'Fenwick Watch',
    );
    if (!watch) throw new Error('No Fenwick Watch');
    await page.goto(`${MAP}/view/${fenwick}`);
    await expect.poll(() => level(page)).toEqual({ level: 'system', subjectId: fenwick });
    await settled(page);
    await pointAt(page, watch.id);

    await scrollUntil(page, -100, async () => {
      const selected = await page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);
      return selected.includes(watch.id);
    });
    await expect(page.getByRole('complementary', { name: 'Details' })).toContainText(
      'Fenwick Watch',
    );
    await settled(page);
    // It stopped short of the station instead of flying through it, and stayed in this view.
    const pose = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
    const [px, py, pz] = pose?.position ?? [0, 0, 0];
    const [tx, ty, tz] = pose?.target ?? [0, 0, 0];
    expect(Math.hypot(px - tx, py - ty, pz - tz)).toBeGreaterThan(0.19);
    expect(await level(page)).toEqual({ level: 'system', subjectId: fenwick });
  });

  test('a double-click or Enter enters at once', async ({ page }) => {
    const aster = await nearSystem(page, 'Aster');
    const at = await pointAt(page, aster);
    await page.mouse.dblclick(at.x, at.y);
    await expect.poll(() => level(page)).toEqual({ level: 'system', subjectId: aster });
    await settled(page);

    await page.keyboard.press('Escape');
    await expect.poll(() => level(page)).toEqual({ level: 'galaxy', subjectId: null });
    await settled(page);
    await page.goto(`${MAP}?select=${aster}`);
    await waitForFirstFrame(page);
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds()))
      .toEqual([aster]);
    await settled(page);
    await page.keyboard.press('Enter');
    await expect.poll(() => level(page)).toEqual({ level: 'system', subjectId: aster });
  });
});
