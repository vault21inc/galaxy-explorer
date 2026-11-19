import { expect, type Page } from './test.ts';

/** What the top bar's layout looks like now, read from the page. */
interface BarReport {
  viewportWidth: number;
  viewportHeight: number;
  headerHeight: number;
  scrollWidth: number;
  clientWidth: number;
  /** Each visible control in the bar that isn't wholly inside the viewport. */
  outside: string[];
}

/**
 * Checks that the top bar fits the window (docs/plan/later/phone-usability.md, L3-T1): every
 * visible link and button in `<header>` lies wholly inside the viewport, the bar is one row,
 * and the page doesn't scroll sideways.
 */
export async function expectBarFits(page: Page): Promise<void> {
  const report = await page.evaluate((): BarReport => {
    const header = document.querySelector('header');
    if (!header) throw new Error('No top bar on the page.');
    const outside: string[] = [];
    for (const control of header.querySelectorAll<HTMLElement>('a, button')) {
      const box = control.getBoundingClientRect();
      // sr-only text and closed menus have no size; they aren't on screen to fit.
      if (box.width === 0 || box.height === 0) continue;
      const inside =
        box.left >= -0.5 &&
        box.top >= -0.5 &&
        box.right <= window.innerWidth + 0.5 &&
        box.bottom <= window.innerHeight + 0.5;
      if (!inside) {
        const name = control.getAttribute('aria-label') ?? control.textContent.trim();
        const span = `${String(Math.round(box.left))}–${String(Math.round(box.right))}`;
        outside.push(`${name} at ${span} px`);
      }
    }
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      headerHeight: header.getBoundingClientRect().height,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      outside,
    };
  });
  const at = `at ${String(report.viewportWidth)} × ${String(report.viewportHeight)}`;
  expect(report.outside, `controls off screen ${at}`).toEqual([]);
  expect(report.scrollWidth, `the page scrolls sideways ${at}`).toBeLessThanOrEqual(
    report.clientWidth,
  );
  // One row of 32–44 px controls with 12 px above and below; a second row would double it.
  expect(report.headerHeight, `the bar wraps ${at}`).toBeLessThanOrEqual(72);
}

/** `window.__GE_TEST__.layout()`, for specs about the tiers. */
export function layoutOf(page: Page) {
  return page.evaluate(() => window.__GE_TEST__?.layout() ?? null);
}
