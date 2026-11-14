import { expect, test, type APIRequestContext } from './test.ts';
import { getJson } from './api.ts';
import { waitForFirstFrame } from './test-hooks.ts';

/**
 * Cloning a map for another era (M7-T5): "Clone map as…" in the map switcher, a change in the
 * copy, and the panel's "On other maps" switching between the original and the copy.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function post(request: APIRequestContext, url: string, data: object) {
  const response = await request.post(url, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { data: { id: string } }).data;
}

interface ObjectRead {
  id: string;
  externalKey: string | null;
  x: number;
  version: number;
}

const systemOn = async (request: APIRequestContext, mapId: string) =>
  (
    (await getJson(request, `/api/v1/maps/${mapId}/objects?limit=100`)) as { data: ObjectRead[] }
  ).data.find((object) => object.externalKey === 'gudrun-system');

test('clone a map, move a system in the copy, and switch between them from the panel', async ({
  page,
}) => {
  const slug = `clone-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const universe = await post(page.request, '/api/v1/universes', { slug, name: plain('Clone') });
  const m41 = await post(page.request, `/api/v1/universes/${universe.id}/maps`, {
    slug: 'm41',
    name: plain('M41'),
  });
  const original = await post(page.request, `/api/v1/maps/${m41.id}/objects`, {
    name: plain('Gudrun System'),
    baseType: 'system',
    externalKey: 'gudrun-system',
    x: 1_000,
  });

  await page.goto(`/u/${slug}/m41`);
  await waitForFirstFrame(page);
  await page.getByRole('button', { name: 'Map: M41' }).click();
  await page.getByRole('menuitem', { name: 'Clone map as…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Clone M41' });
  await dialog.getByLabel('Name').fill('M42');
  await expect(dialog.getByLabel('Address')).toHaveValue('m42');
  await dialog.getByRole('button', { name: 'Clone map' }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${slug}/m42$`));

  // A change in the copy leaves the original as it was.
  const maps = (
    (await getJson(page.request, `/api/v1/universes/${universe.id}/maps`)) as {
      data: { id: string; slug: string }[];
    }
  ).data;
  const m42 = maps.find((map) => map.slug === 'm42');
  const copy = await systemOn(page.request, m42?.id ?? '');
  expect(copy?.id).not.toBe(original.id);
  const moved = await page.request.patch(`/api/v1/objects/${copy?.id ?? ''}`, {
    data: { version: copy?.version, x: 2_500 },
  });
  expect(moved.ok(), await moved.text()).toBe(true);
  expect((await systemOn(page.request, m41.id))?.x).toBe(1_000);

  // The copy's panel names the original's map; choosing it opens the original, selected.
  await page.goto(`/u/${slug}/m42?select=${copy?.id ?? ''}`);
  await waitForFirstFrame(page);
  const panel = page.getByRole('complementary', { name: 'Details' });
  const others = panel.getByRole('region', { name: 'On other maps' });
  await others.getByRole('button', { name: 'M41' }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${slug}/m41\\?select=${original.id}`));
  await expect(panel).toContainText('Gudrun System');

  // And back again.
  await others.getByRole('button', { name: 'M42' }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${slug}/m42\\?select=${copy?.id ?? ''}`));
});
