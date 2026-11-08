import { expect, test } from '@playwright/test';
import { galaxyObjects } from './demo.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** tuning.ts: the redaction color, and the smallest on-screen height of a body. */
const REDACTION_COLOR = '#6b7280';
const GALAXY_BODY_MIN_PX = 8;
const REGIONS = new Set(['nebula', 'anomaly']);

test.describe('bodies and regions in the galaxy view', () => {
  test('the stress map draws 5,000 objects in one call for bodies and one for regions', async ({
    page,
  }) => {
    const objects = await galaxyObjects(page.request, 'stress-test', 'main');
    expect(objects.length).toBe(5_000);
    const someRegion = objects.find((object) => REGIONS.has(object.baseType));
    const someBody = objects.find((object) => !REGIONS.has(object.baseType));

    await page.goto('/u/stress-test/main');
    await waitForFirstFrame(page);
    // Wait for every layer: the depth stars (points) and both object renderers.
    await expect
      .poll(
        () =>
          page.evaluate(
            ([body, region]) => ({
              points: window.__GE_TEST__?.renderInfo()?.points,
              body: window.__GE_TEST__?.drawnObject(body)?.renderer,
              region: window.__GE_TEST__?.drawnObject(region)?.renderer,
            }),
            [someBody?.id ?? '', someRegion?.id ?? ''] as [string, string],
          ),
        { timeout: 20_000 },
      )
      .toEqual({ points: 25_000, body: 'instanced-bodies', region: 'region-cloud' });
    await waitForIdle(page);

    // Four for the background (galaxy.spec.ts), one for all bodies, one for all regions.
    const info = await page.evaluate(() => window.__GE_TEST__?.renderInfo());
    expect(info?.calls).toBe(6);
  });

  test('zoomed all the way out, every body is still at least the minimum size', async ({
    page,
  }) => {
    const objects = await galaxyObjects(page.request, 'example-universe', 'main');
    await page.goto('/u/example-universe/main');
    await waitForFirstFrame(page);
    await expect
      .poll(() => page.evaluate((id) => window.__GE_TEST__?.drawnObject(id), objects[0]?.id ?? ''))
      .not.toBeNull();

    // Real wheel input over the canvas's center until the camera stops at its maximum
    // distance, 3 galaxy radii (tuning.ts GALAXY_MAX_DISTANCE_RADII).
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('The canvas has no size.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const distance = () =>
      page.evaluate(() => {
        const pose = window.__GE_TEST__?.cameraPose();
        if (!pose) return 0;
        const [x, y, z] = pose.position.map((value, i) => value - (pose.target[i] ?? 0));
        return Math.hypot(x ?? 0, y ?? 0, z ?? 0);
      });
    await expect
      .poll(
        async () => {
          await page.mouse.wheel(0, 2_000);
          return Math.round(await distance());
        },
        { timeout: 20_000, intervals: [250] },
      )
      .toBe(150_000);
    await waitForIdle(page);

    const bodies = objects.filter((object) => !REGIONS.has(object.baseType));
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const measured = await page.evaluate(
        (id) => ({
          position: window.__GE_TEST__?.screenPositionOf(id),
          radiusPx: window.__GE_TEST__?.screenRadiusOf(id),
        }),
        body.id,
      );
      expect(measured.position, `${body.namePlain} is on screen`).not.toBeNull();
      expect((measured.radiusPx ?? 0) * 2, `${body.namePlain}'s height`).toBeGreaterThanOrEqual(
        GALAXY_BODY_MIN_PX,
      );
    }
  });

  test('spoiler objects are drawn in the redaction color while spoilers are hidden', async ({
    page,
  }) => {
    const objects = await galaxyObjects(page.request, 'example-universe', 'main');
    const spoiler = objects.find((object) => object.isSpoiler);
    const visible = objects.find((object) => !object.isSpoiler && object.baseType === 'system');
    if (!spoiler || !visible) throw new Error('The demo seed should have both.');

    await page.goto('/u/example-universe/main');
    await waitForFirstFrame(page);
    await expect
      .poll(() => page.evaluate((id) => window.__GE_TEST__?.drawnObject(id), spoiler.id))
      .toMatchObject({ state: 'redacted', color: REDACTION_COLOR });
    const other = await page.evaluate((id) => window.__GE_TEST__?.drawnObject(id), visible.id);
    expect(other).toMatchObject({ state: 'normal' });
    expect(other?.color).not.toBe(REDACTION_COLOR);
  });
});
