import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * A look per kind of body in the galaxy view (D-28, D-29, M4-T8): which renderer draws each
 * type, what a system's glyph is told, and a system following its own color and size.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function setUp(request: APIRequestContext) {
  const slug = `looks-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: unknown }).data;
  };
  const universe = (await post('/api/v1/universes', { slug, name: plain('Looks') })) as {
    id: string;
  };
  const map = (await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  })) as { id: string };
  const top = (name: string, baseType: string, x: number) => ({
    op: 'create',
    kind: 'celestial_object',
    mapId: map.id,
    data: { name: plain(name), baseType, x, y: 0, z: 0 },
  });
  const inside = (name: string, baseType: string, extra: object = {}) => ({
    op: 'create',
    kind: 'celestial_object',
    mapId: map.id,
    data: { name: plain(name), baseType, parentId: '$op:0', ...extra },
  });
  const built = (await post('/api/v1/batch', {
    description: 'Looks',
    operations: [
      top('Alpha', 'system', -8_000),
      inside('A', 'star', { appearance: { color: '#ffd27f' } }),
      inside('B', 'star', { appearance: { color: '#7fb0ff', scale: { system: 0.5 } } }),
      inside('I', 'planet'),
      inside('II', 'planet'),
      inside('III', 'planet'),
      top('Rogue', 'planet', -4_000),
      top('Outpost', 'station', 0),
      top('Waypoint', 'marker', 4_000),
      top('Maw', 'black_hole', 8_000),
    ],
  })) as { results: { op: string; id: string; data: { namePlain: string } }[] };
  const ids = Object.fromEntries(
    built.results.map((result) => [result.data.namePlain, result.id]),
  ) as Record<string, string>;
  return { url: `/u/${slug}/main`, mapId: map.id, ids };
}

const drawn = (page: Page, id: string) =>
  page.evaluate((target) => window.__GE_TEST__?.drawnObject(target) ?? null, id);

test.describe('a look per kind of body (M4-T8)', () => {
  test('each type has its renderer, and a system knows its planets and stars', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    await waitForFirstFrame(page);
    await waitForIdle(page);

    const renderers = await page.evaluate(
      (ids) =>
        Object.fromEntries(
          Object.entries(ids).map(([name, id]) => [
            name,
            window.__GE_TEST__?.drawnObject(id)?.renderer ?? null,
          ]),
        ),
      {
        Alpha: s.ids.Alpha ?? '',
        Rogue: s.ids.Rogue ?? '',
        Outpost: s.ids.Outpost ?? '',
        Waypoint: s.ids.Waypoint ?? '',
        Maw: s.ids.Maw ?? '',
      },
    );
    expect(renderers).toEqual({
      Alpha: 'system-glyphs',
      Rogue: 'instanced-bodies',
      Outpost: 'icon-sprites',
      Waypoint: 'icon-sprites',
      Maw: 'black-holes',
    });

    const view = (await getJson(page.request, `/api/v1/maps/${s.mapId}/views/galaxy`)) as {
      data: { objects: { namePlain: string; planetCount: number; stars: { color: string }[] }[] };
    };
    const alpha = view.data.objects.find((object) => object.namePlain === 'Alpha');
    expect(alpha?.planetCount).toBe(3);
    expect(alpha?.stars.map((star) => star.color)).toEqual(['#ffd27f', '#7fb0ff']);
    // The glyph shows the binary's main star.
    expect((await drawn(page, s.ids.Alpha ?? ''))?.color).toBe('#ffd27f');

    // The galaxy view's draw calls: background (4), plus one each for the bodies, the
    // systems, the icons and the black holes.
    const calls = await page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls ?? 0);
    expect(calls).toBeLessThanOrEqual(8);
  });

  test('a system without stars follows its own color and size', async ({ page }) => {
    const s = await setUp(page.request);
    // A system with no star objects: its glyph uses the system's own appearance.
    const lone = await page.request.post(`/api/v1/maps/${s.mapId}/objects`, {
      data: { name: plain('Lone'), baseType: 'system', x: 0, y: 0, z: 6_000 },
    });
    const { data } = (await lone.json()) as { data: { id: string; version: number } };
    await page.goto(s.url);
    await waitForFirstFrame(page);
    await waitForIdle(page);
    await page.evaluate((id) => window.__GE_TEST__?.flyTo(id), data.id);
    await waitForIdle(page);
    const before = await page.evaluate(
      (id) => window.__GE_TEST__?.screenRadiusOf(id) ?? 0,
      data.id,
    );
    expect((await drawn(page, data.id))?.color).toBe('#ffe6a8');

    const patched = await page.request.patch(`/api/v1/objects/${data.id}`, {
      data: { version: data.version, appearance: { color: '#ff4040', scale: { galaxy: 0.5 } } },
    });
    expect(patched.ok()).toBe(true);
    // The view refetches when the window regains focus or on the next write; reload to see it.
    await page.reload();
    await waitForFirstFrame(page);
    await page.evaluate((id) => window.__GE_TEST__?.flyTo(id), data.id);
    await waitForIdle(page);
    expect((await drawn(page, data.id))?.color).toBe('#ff4040');
    const after = await page.evaluate((id) => window.__GE_TEST__?.screenRadiusOf(id) ?? 0, data.id);
    expect(after).toBeLessThan(before);
  });
});
