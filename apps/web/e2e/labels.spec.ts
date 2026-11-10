import { expect, test, type Page } from '@playwright/test';
import { galaxyObjects } from './demo.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Set by GitHub Actions. The e2e tsconfig has no Node types, hence the narrow cast. */
const isCI = Boolean(
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI,
);

const labels = (page: Page) => page.evaluate(() => window.__GE_TEST__?.visibleLabels() ?? []);

/** The label elements actually on screen, with their boxes. */
async function shownLabelBoxes(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="label-layer"] > div')]
      .filter((element) => element.style.display !== 'none')
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          text: element.textContent,
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
        };
      }),
  );
}

async function openDemo(page: Page) {
  await page.goto('/u/example-universe/main');
  await waitForFirstFrame(page);
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
  // Park the pointer in a corner, away from every object.
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move((box?.x ?? 0) + 2, (box?.y ?? 0) + (box?.height ?? 0) - 2);
  return objects;
}

test.describe('labels (rendering.md §11, ux.md §7)', () => {
  test('hovering an object shows exactly its label', async ({ page }) => {
    const objects = await openDemo(page);
    expect(await labels(page)).toEqual([]);
    const aster = objects.find((object) => object.namePlain === 'Aster');
    const at = await page.evaluate(
      (id) => window.__GE_TEST__?.screenPositionOf(id),
      aster?.id ?? '',
    );
    if (!aster || !at) throw new Error('Aster should be on screen.');

    await page.mouse.move(at.x, at.y);
    await expect.poll(() => labels(page)).toEqual([{ id: aster.id, text: 'Aster' }]);
    const shown = await shownLabelBoxes(page);
    expect(shown.map((label) => label.text)).toEqual(['Aster']);
    // To the right of the body.
    expect(shown[0]?.left).toBeGreaterThan(at.x);
  });

  test('L cycles hover → groups → all, and the mode is remembered', async ({ page }) => {
    await openDemo(page);
    // groups: the demo's sector and its two sub-sectors (M4-T3), and its route (M4-T7)
    await page.keyboard.press('l');
    await expect
      .poll(async () => (await labels(page)).map((label) => label.text).sort())
      .toEqual(['Inner Reach', 'Outer Reach', 'Reach Run', 'Vela Sector']);
    await page.keyboard.press('l'); // all
    await expect.poll(async () => (await labels(page)).length).toBeGreaterThan(5);

    await page.reload();
    await waitForFirstFrame(page);
    await expect
      .poll(async () => (await labels(page)).length, { timeout: 15_000 })
      .toBeGreaterThan(5);

    await page.keyboard.press('l'); // back to hover
    await expect.poll(async () => (await labels(page)).length).toBe(0);
  });

  test('holding Space shows many labels, none overlapping, and hidden spoilers stay hidden', async ({
    page,
  }) => {
    const objects = await openDemo(page);
    await page.keyboard.down(' ');
    await expect.poll(async () => (await labels(page)).length).toBeGreaterThan(5);

    const boxes = await shownLabelBoxes(page);
    expect(boxes.length).toBe((await labels(page)).length);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b) continue;
        const overlap =
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `"${a.text}" and "${b.text}" overlap`).toBe(false);
      }
    }
    // Erebus is a whole-entity spoiler: its label is a redaction bar, never its name.
    const texts = boxes.map((label) => label.text);
    expect(texts).not.toContain('Erebus');
    const erebus = objects.find((object) => object.namePlain === 'Erebus');
    const erebusLabel = (await labels(page)).find((label) => label.id === erebus?.id);
    if (erebusLabel) expect(erebusLabel.text).toMatch(/^▇+$/);

    await page.keyboard.up(' ');
    await expect.poll(async () => (await labels(page)).length).toBe(0);
  });

  test('updating up to 200 labels stays fast', async ({ page, browserName }) => {
    // WebKit rounds performance.now() to whole milliseconds, too coarse for a 2 ms budget.
    test.skip(browserName === 'webkit', 'needs a sub-millisecond timer');
    // Headless browsers draw in software, where the stress map's 300 overlapping group fills
    // (M4-T3) cost real fill rate: each frame is slower here, though not on a GPU (`pnpm perf`).
    test.slow();
    await page.goto('/u/stress-test/main');
    await waitForFirstFrame(page);
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.renderInfo()?.points), {
        timeout: 20_000,
      })
      .toBe(25_000);
    await page.keyboard.down(' ');
    await expect.poll(async () => (await labels(page)).length).toBeGreaterThan(100);

    await page.evaluate(() => window.__GE_TEST__?.resetLabelStats());
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('The canvas has no size.');
    // Few steps: headless browsers draw the stress map in software, a few frames a second, so
    // a long drag would mostly wait on the GPU, not exercise the labels.
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55, { steps: 10 });
    await page.mouse.up();
    await waitForIdle(page);
    const stats = await page.evaluate(() => window.__GE_TEST__?.labelStats());
    const count = (await labels(page)).length;
    console.log(`Label updates with ${count.toString()} labels: ${JSON.stringify(stats)}`);
    expect(stats?.count).toBeGreaterThan(5);
    // The 2 ms budget (rendering.md §11) is measured headed on the owner's Mac, where this
    // runs at about 0.7 / 1.1 ms (docs/perf/README.md; M2-T8's `pnpm perf` checks it). Locally
    // the headless browsers share the CPU with parallel tests and software rendering, so this
    // only guards against regressions. GitHub's shared runners vary too much to time anything
    // (5 ms median, 13–25 ms p95 on the same code), so CI only logs the numbers.
    if (!isCI) expect(stats?.p95Ms).toBeLessThan(5);
    await page.keyboard.up(' ');
  });
});
