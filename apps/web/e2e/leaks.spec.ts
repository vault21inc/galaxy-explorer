import { expect, test, type Page } from '@playwright/test';
import { galaxyObjects, systemChildren } from './demo.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * GPU memory stays level across views (M5-T5, rendering.md §2, §13): 20 galaxy ↔ system round
 * trips leave as many geometries and textures on the GPU as there were before, within 5 %. A
 * view that forgot to dispose of something it made would add to them on every trip.
 *
 * The baseline is taken after one warm-up trip: the first entry bakes the star surface
 * (granulation-bake.ts) into the app's bake cache, which keeps it for the page on purpose.
 * Reduced motion makes each change of view a quick fade; the views swap the same way.
 */
test.use({ reducedMotion: 'reduce' });

const MAP = '/u/example-universe/main';
const ROUND_TRIPS = 20;

/**
 * Waits until no change of view is under way and nothing has been drawn for a while: the view
 * has arrived and drawn itself. In CI, which renders in software, a view can take seconds to
 * arrive, and memory read before then misses what it hasn't uploaded yet.
 */
async function settled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.transitioning() ?? true), {
      timeout: 20_000,
    })
    .toBe(false);
  await waitForIdle(page);
}

async function memory(page: Page) {
  const info = await page.evaluate(() => window.__GE_TEST__?.renderInfo());
  if (!info) throw new Error('No render info.');
  return { geometries: info.geometries, textures: info.textures };
}

async function deepTrip(page: Page, systemId: string, planetId: string) {
  await page.evaluate((id) => window.__GE_TEST__?.enter(id), systemId);
  await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');
  await page.evaluate((id) => window.__GE_TEST__?.enter(id), planetId);
  await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('orbit');
  await page.evaluate(() => window.__GE_TEST__?.exit());
  await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');
  await page.evaluate(() => window.__GE_TEST__?.exit());
  await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('galaxy');
}

async function roundTrip(page: Page, systemId: string) {
  await page.evaluate((id) => window.__GE_TEST__?.enter(id), systemId);
  await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');
  await page.evaluate(() => window.__GE_TEST__?.exit());
  await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('galaxy');
}

test('20 galaxy ↔ system round trips leave GPU memory level', async ({ page }) => {
  test.setTimeout(180_000);
  const aster = (await galaxyObjects(page.request, 'example-universe', 'main')).find(
    (object) => object.namePlain === 'Aster',
  );
  if (!aster) throw new Error('No Aster in the demo.');
  await page.goto(MAP);
  await waitForFirstFrame(page);
  await waitForIdle(page);

  await roundTrip(page, aster.id);
  await settled(page);
  const before = await memory(page);

  for (let trip = 0; trip < ROUND_TRIPS; trip++) await roundTrip(page, aster.id);
  await settled(page);
  const after = await memory(page);

  test.info().annotations.push({
    type: 'GPU memory',
    description: `${JSON.stringify(before)} → ${JSON.stringify(after)} after ${ROUND_TRIPS.toString()} round trips`,
  });
  for (const key of ['geometries', 'textures'] as const) {
    expect(Math.abs(after[key] - before[key]), key).toBeLessThanOrEqual(before[key] * 0.05);
  }
});

/**
 * The same through the orbit view (M6-T3): galaxy → system → orbit and back. The first trip
 * also bakes the planet's globe textures into the bake cache, which keeps them on purpose.
 */
test('20 galaxy → system → orbit round trips leave GPU memory level', async ({ page }) => {
  test.setTimeout(300_000);
  const aster = (await galaxyObjects(page.request, 'example-universe', 'main')).find(
    (object) => object.namePlain === 'Aster',
  );
  if (!aster) throw new Error('No Aster in the demo.');
  const primus = (await systemChildren(page.request, aster.id)).find(
    (object) => object.namePlain === 'Primus',
  );
  if (!primus) throw new Error('No Primus in the demo.');
  await page.goto(MAP);
  await waitForFirstFrame(page);
  await waitForIdle(page);

  await deepTrip(page, aster.id, primus.id);
  await settled(page);
  const before = await memory(page);

  for (let trip = 0; trip < ROUND_TRIPS; trip++) await deepTrip(page, aster.id, primus.id);
  await settled(page);
  const after = await memory(page);

  test.info().annotations.push({
    type: 'GPU memory',
    description: `${JSON.stringify(before)} → ${JSON.stringify(after)} after ${ROUND_TRIPS.toString()} round trips`,
  });
  for (const key of ['geometries', 'textures'] as const) {
    expect(Math.abs(after[key] - before[key]), key).toBeLessThanOrEqual(before[key] * 0.05);
  }
});
