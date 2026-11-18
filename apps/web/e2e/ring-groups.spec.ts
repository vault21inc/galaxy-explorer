import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Ring-shaped groups in the galaxy view (D-53, rendering.md §6). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

type Outline = NonNullable<ReturnType<NonNullable<Window['__GE_TEST__']>['groupOutline']>>;

async function setUp(request: APIRequestContext) {
  const slug = `rings-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const send = async (method: 'post' | 'patch', url: string, data: object) => {
    const response = await request[method](url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const post = (url: string, data: object) => send('post', url, data);
  const universeId = await post('/api/v1/universes', { slug, name: plain('Rings test') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const regionType = await post(`/api/v1/universes/${universeId}/group-types`, {
    name: 'Region',
    layer: 'Astrographic',
    defaultColor: '#4fd1ff',
  });
  const sectorType = await post(`/api/v1/universes/${universeId}/group-types`, {
    name: 'Sector',
    layer: 'Administrative',
    defaultColor: '#c8a24a',
  });
  const system = (name: string, x: number, z: number) =>
    post(`/api/v1/maps/${mapId}/objects`, { name: plain(name), baseType: 'system', x, y: 0, z });
  const group = async (name: string, groupTypeId: string, style: object, members: string[]) => {
    const id = await post(`/api/v1/maps/${mapId}/groups`, {
      name: plain(name),
      groupTypeId,
      style,
    });
    if (members.length > 0) {
      await post(`/api/v1/groups/${id}/members`, {
        members: members.map((objectId) => ({ objectId })),
      });
    }
    return id;
  };
  return { url: `/u/${slug}/main`, mapId, regionType, sectorType, system, group, send };
}

const outline = (page: Page, id: string) =>
  page.evaluate((target) => window.__GE_TEST__?.groupOutline(target) ?? null, id);

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page);
}

test.describe('ring groups (D-53)', () => {
  test('six concentric rings draw as bands beside a hull, in the same three draw calls', async ({
    page,
  }) => {
    const s = await setUp(page.request);

    // One system per band, at growing distances from the centre and at different angles.
    const regions: [string, number, object][] = [
      ['Deep Core', 2_000, { shape: 'ring', ring: { innerRadiusLy: 0 } }],
      ['Core Worlds', 6_000, { shape: 'ring' }],
      ['Colonies', 10_000, { shape: 'ring', ring: { labelDeg: 0 } }],
      ['Inner Rim', 14_000, { shape: 'ring' }],
      ['Mid Rim', 18_000, { shape: 'ring', dashed: true }],
    ];
    const members: string[] = [];
    for (const [index, [name, radius]] of regions.entries()) {
      const angle = index * 1.1;
      members.push(await s.system(name, radius * Math.cos(angle), radius * Math.sin(angle)));
    }
    const near = await s.system('Near', 17_000, -2_000);
    const far = await s.system('Far', 19_000, 1_000);
    // The draw calls with the systems but no groups.
    await open(page, s.url);
    const before = await page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls ?? 0);

    const ids: string[] = [];
    for (const [index, [name, , style]] of regions.entries()) {
      ids.push(await s.group(name, s.regionType, style, [members[index] ?? '']));
    }
    // Laid out ahead of its systems: pinned, with no members yet.
    ids.push(
      await s.group(
        'Outer Rim',
        s.regionType,
        { shape: 'ring', ring: { innerRadiusLy: 21_000, outerRadiusLy: 27_000 } },
        [],
      ),
    );
    // A sector made of two Mid Rim neighbours: still a hull.
    const sector = await s.group('Sector', s.sectorType, {}, [near, far]);

    // Reload: the rings come back from the saved styles.
    await open(page, s.url);
    await expect.poll(() => outline(page, ids.at(-1) ?? '')).not.toBeNull();
    const rings: Outline[] = [];
    for (const id of ids) {
      const drawn = await outline(page, id);
      expect(drawn?.shape).toBe('ring');
      if (drawn) rings.push(drawn);
    }
    expect(rings).toHaveLength(6);

    // A disc, then bands, from the centre out, none overlapping the next.
    expect(rings[0]).toMatchObject({ loopCount: 1, ring: { innerRadiusLy: 0 } });
    expect(rings[5]).toMatchObject({
      loopCount: 2,
      memberCount: 0,
      ring: { innerRadiusLy: 21_000, outerRadiusLy: 27_000 },
    });
    for (const [index, ring] of rings.entries()) {
      const band = ring.ring;
      if (!band) throw new Error('A ring without radii.');
      expect(band.center).toEqual([0, 0]);
      const next = rings[index + 1]?.ring;
      if (next) expect(band.outerRadiusLy).toBeLessThanOrEqual(next.innerRadiusLy);
      // The label is on its own band.
      const [x, , z] = ring.centroid;
      const radius = Math.hypot(x - band.center[0], z - band.center[1]);
      expect(radius).toBeGreaterThanOrEqual(band.innerRadiusLy);
      expect(radius).toBeLessThanOrEqual(band.outerRadiusLy);
    }
    // Colonies' label is turned to +x; the others sit above the centre (−z).
    expect(rings[2]?.centroid[2]).toBeCloseTo(0, 0);
    expect(rings[1]?.centroid[2]).toBeLessThan(0);

    // The hull beside them is as before: one loop around its two members.
    expect(await outline(page, sector)).toMatchObject({
      shape: 'hull',
      loopCount: 1,
      ring: null,
      memberCount: 2,
    });

    // Fills, solid lines and dashed lines: three more draw calls, rings and hulls together.
    await waitForIdle(page);
    const after = await page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls ?? 0);
    expect(after - before).toBe(3);

    // Their labels show in the groups label mode.
    await page.keyboard.press('l');
    await expect
      .poll(() =>
        page.evaluate(() => (window.__GE_TEST__?.visibleLabels() ?? []).map((label) => label.text)),
      )
      .toEqual(expect.arrayContaining(['Deep Core', 'Core Worlds', 'Mid Rim', 'Outer Rim']));
  });

  test('the form makes a group a ring and pins its outer radius', async ({ page }) => {
    const s = await setUp(page.request);
    const a = await s.system('Alpha', 8_000, 0);
    const b = await s.system('Beta', 0, 12_000);
    const id = await s.group('Mid Rim', s.regionType, {}, [a, b]);
    await open(page, `${s.url}?select=${id}`);
    await expect.poll(() => outline(page, id)).toMatchObject({ shape: 'hull' });
    await page.keyboard.press('e');
    const panel = page.getByRole('complementary', { name: 'Details' });
    const style = async () => {
      const response = await page.request.get(`/api/v1/groups/${id}`);
      return ((await response.json()) as { data: { style: object } }).data.style;
    };

    // The ring's fields show only once it's a ring.
    await expect(panel.getByLabel('Outer radius (ly)')).toHaveCount(0);
    await panel.getByLabel('Shape').selectOption({ label: 'Ring around the centre' });
    await expect.poll(style).toEqual({ shape: 'ring' });
    await expect.poll(() => outline(page, id)).toMatchObject({ shape: 'ring', loopCount: 2 });

    const outer = panel.getByLabel('Outer radius (ly)');
    await outer.fill('30000');
    await outer.press('Enter');
    await expect.poll(style).toEqual({ shape: 'ring', ring: { outerRadiusLy: 30_000 } });
    await expect.poll(async () => (await outline(page, id))?.ring?.outerRadiusLy).toBe(30_000);

    // An inner radius past the outer one is refused, and nothing changes.
    const inner = panel.getByLabel('Inner radius (ly)');
    await inner.fill('40000');
    await inner.press('Enter');
    await expect(page.getByText(/Couldn't save/)).toBeVisible();
    expect(await style()).toEqual({ shape: 'ring', ring: { outerRadiusLy: 30_000 } });

    // Saved: the ring is still there after a reload.
    await open(page, s.url);
    await expect
      .poll(() => outline(page, id))
      .toMatchObject({ shape: 'ring', ring: { outerRadiusLy: 30_000 } });
  });
});
