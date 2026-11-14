import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Group outlines and their labels in the galaxy view (M4-T3, rendering.md §6). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function setUp(request: APIRequestContext) {
  const slug = `outlines-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('Outlines test') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const sectorType = await post(`/api/v1/universes/${universeId}/group-types`, {
    name: 'Sector',
    layer: 'Administrative',
    defaultColor: '#4fd1ff',
  });
  const subType = await post(`/api/v1/universes/${universeId}/group-types`, {
    name: 'Sub-sector',
    layer: 'Administrative',
    parentGroupTypeId: sectorType,
    defaultColor: '#c8a24a',
  });
  const ids: Record<string, string> = {};
  const places: [string, number, number][] = [
    ['Alpha', -14_000, -3_000],
    ['Beta', -9_000, 2_000],
    ['Gamma', 6_000, -2_000],
    ['Delta', 11_000, 3_000],
    ['Epsilon', 0, 14_000],
  ];
  for (const [name, x, z] of places) {
    ids[name] = await post(`/api/v1/maps/${mapId}/objects`, {
      name: plain(name),
      baseType: 'system',
      x,
      y: 0,
      z,
    });
  }
  return { url: `/u/${slug}/main`, mapId, ids, sectorType, subType, post };
}

type Setup = Awaited<ReturnType<typeof setUp>>;

/** Adds the groups: a sector holding two sub-sectors, and a dashed spoiler group. */
async function addGroups(s: Setup) {
  const group = async (name: string, groupTypeId: string, extra: object, members: string[]) => {
    const id = await s.post(`/api/v1/maps/${s.mapId}/groups`, {
      name: plain(name),
      groupTypeId,
      outlineColor: name === 'Helican' ? '#c8a24a' : '#4fd1ff',
      ...extra,
    });
    if (members.length > 0) {
      await s.post(`/api/v1/groups/${id}/members`, {
        members: members.map((member) => ({ objectId: s.ids[member] ?? '' })),
      });
    }
    return id;
  };
  const scarus = await group('Scarus', s.sectorType, {}, []);
  const helican = await group('Helican', s.subType, { parentGroupId: scarus }, ['Alpha', 'Beta']);
  const ophidian = await group('Ophidian', s.subType, { parentGroupId: scarus }, [
    'Gamma',
    'Delta',
  ]);
  const hidden = await group(
    'The Veiled Reach',
    s.subType,
    { isSpoiler: true, style: { dashed: true, lineWidthPx: 4 } },
    ['Epsilon'],
  );
  return { scarus, helican, ophidian, hidden };
}

const outline = (page: Page, id: string) =>
  page.evaluate((target) => window.__GE_TEST__?.groupOutline(target) ?? null, id);

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page);
}

test.describe('group outlines (M4-T3)', () => {
  test('outlines nest, take their look from the group, and cost three draw calls', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    const before = await page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls ?? 0);

    const ids = await addGroups(s);
    await open(page, s.url);
    await expect.poll(() => outline(page, ids.scarus)).not.toBeNull();

    // The sector encloses both sub-sectors' members, with its label at the centroid.
    expect(await outline(page, ids.scarus)).toMatchObject({ memberCount: 4, color: '#4fd1ff' });
    expect(await outline(page, ids.helican)).toMatchObject({
      memberCount: 2,
      color: '#c8a24a',
      dashed: false,
      widthPx: 2,
    });
    // Hidden spoiler group: grey, a redacted label, still dashed and 4 px.
    const hidden = await outline(page, ids.hidden);
    expect(hidden).toMatchObject({ redacted: true, dashed: true, widthPx: 4, color: '#6b7280' });
    expect(hidden?.label).not.toContain('Veiled');

    // Fills, solid lines and dashed lines: three more draw calls, whatever the group count.
    await waitForIdle(page);
    const after = await page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls ?? 0);
    expect(after - before).toBe(3);
  });

  test('group labels show in the groups label mode, larger groups first', async ({ page }) => {
    const s = await setUp(page.request);
    const ids = await addGroups(s);
    await open(page, s.url);
    await expect.poll(() => outline(page, ids.scarus)).not.toBeNull();
    const shown = () =>
      page.evaluate(() => (window.__GE_TEST__?.visibleLabels() ?? []).map((label) => label.text));
    expect(await shown()).toEqual([]);

    // L cycles hover → groups.
    await page.keyboard.press('l');
    await expect.poll(shown).toEqual(expect.arrayContaining(['Scarus', 'Helican', 'Ophidian']));
    expect(await shown()).not.toContain('The Veiled Reach');
  });

  test('showing spoilers reveals the spoiler group', async ({ page }) => {
    const s = await setUp(page.request);
    const ids = await addGroups(s);
    await open(page, s.url);
    await expect.poll(() => outline(page, ids.hidden)).toMatchObject({ redacted: true });
    await page.getByRole('button', { name: 'Spoilers: Hidden' }).click();
    await expect
      .poll(() => outline(page, ids.hidden))
      .toMatchObject({ redacted: false, color: '#4fd1ff', label: 'The Veiled Reach' });
  });
});
