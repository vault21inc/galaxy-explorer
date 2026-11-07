import { expect, type Page } from '@playwright/test';

/** Reads the frame counter from `window.__GE_TEST__` (rendering.md §14). */
export function frameCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__GE_TEST__?.frameCount ?? -1);
}

/** Waits until the canvas has drawn its first frame and the test hooks are installed. */
export async function waitForFirstFrame(page: Page): Promise<void> {
  await expect.poll(() => frameCount(page), { timeout: 15_000 }).toBeGreaterThan(0);
}

/**
 * Waits until no frame has rendered for `quietMs`: the camera has settled and the resolution
 * has returned to full after moving.
 */
export async function waitForIdle(page: Page, quietMs = 1_000): Promise<void> {
  let last = await frameCount(page);
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(quietMs);
        const now = await frameCount(page);
        const settled = now === last;
        last = now;
        return settled;
      },
      { timeout: 20_000, intervals: [0] },
    )
    .toBe(true);
}

/** How many frames render during `durationMs` of doing nothing. */
export async function framesDuring(page: Page, durationMs: number): Promise<number> {
  const before = await frameCount(page);
  await page.waitForTimeout(durationMs);
  return (await frameCount(page)) - before;
}
