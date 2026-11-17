import { expect, test, type Page } from './test.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * `?cam=` (ux.md §9): a link names the camera its view opens with, and "Copy link to this view"
 * makes one from where the camera is now, so whoever opens it sees the same thing.
 */

const MAP = '/u/example-universe/main';
interface Pose {
  position: number[];
  target: number[];
}

async function poseOf(page: Page): Promise<Pose> {
  await waitForIdle(page, 300);
  const pose = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
  if (!pose) throw new Error('No camera.');
  return pose;
}

function expectNear(actual: Pose, expected: Pose, tolerance: number) {
  [...actual.position, ...actual.target].forEach((value, i) => {
    const want = [...expected.position, ...expected.target][i] ?? Number.NaN;
    expect(Math.abs(value - want), `coordinate ${String(i)}`).toBeLessThan(tolerance);
  });
}

test('a link’s cam opens its view with that camera', async ({ page }) => {
  await page.goto(`${MAP}?cam=1000,30000,20000,500,0,-200`);
  await waitForFirstFrame(page);
  expectNear(await poseOf(page), { position: [1000, 30000, 20000], target: [500, 0, -200] }, 1);
});

test('“Copy link to this view” reopens the same camera', async ({ page, context }) => {
  // The clipboard differs between browsers under test; keep what's written instead.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          (window as unknown as { copied: string }).copied = text;
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto(`${MAP}?cam=1000,30000,20000,500,0,-200`);
  await waitForFirstFrame(page);
  // Move away from where the link started, so the copy has to read the live camera.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('-');
  const moved = await poseOf(page);

  const primary =
    (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
  await page.keyboard.press(`${primary}+k`);
  await page.getByRole('combobox', { name: 'Search or run a command' }).fill('copy link');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Link to this view copied')).toBeVisible();
  const link = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(link).toContain(`${MAP}?`);
  expect(link).toMatch(/[?&]cam=[-\d.e,]+$/);

  const other = await context.newPage();
  await other.goto(link);
  await waitForFirstFrame(other);
  // Six significant digits: within a light-year at these distances.
  expectNear(await poseOf(other), moved, 2);
});
