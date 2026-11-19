import { expect, test, type APIRequestContext } from './test.ts';
import { accountFromInvite, AUTH_URL, signInThrough, uniqueName } from './accounts.ts';
import { expectBarFits, layoutOf } from './layout.ts';
import { waitForFirstFrame } from './test-hooks.ts';

/**
 * The top bar at every width from 768 px (docs/plan/later/phone-usability.md, L3-T1), in its
 * widest case: a signed-in owner (so Edit and a username are there) in an orbit view, three
 * breadcrumbs deep, of a universe and map with long names. Against the API with accounts.
 */
test.use({ baseURL: AUTH_URL });

const plain = (text: string) => ({ format: 'plain', source: text });

/** A universe of the owner's with a system and a planet to open, returning the planet's page. */
async function orbitView(api: APIRequestContext): Promise<string> {
  const post = async (url: string, data: unknown) => {
    const response = await api.post(url, { headers: { origin: AUTH_URL }, data });
    if (!response.ok())
      throw new Error(`${url}: ${String(response.status())} ${await response.text()}`);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const slug = uniqueName('bar');
  const universe = await post('/api/v1/universes', {
    slug,
    name: plain('The Imperium of Man and its Neighbours'),
  });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('The Age of the Great Crusade'),
  });
  const system = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Sol System, Segmentum Solar'),
    baseType: 'system',
    explorable: true,
  });
  const planet = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Holy Terra, Throneworld of the Imperium'),
    baseType: 'planet',
    parentId: system.id,
    x: 3,
    explorable: true,
  });
  return `/u/${slug}/main/view/${planet.id}`;
}

test('the top bar fits on one row from 768 px wide, with icons alone below 1,280', async ({
  page,
}) => {
  const owner = await accountFromInvite();
  await signInThrough(page.request, owner);
  const url = await orbitView(page.request);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await waitForFirstFrame(page);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumbs' });
  await expect(crumbs.getByRole('listitem')).toHaveCount(3);
  await expect(crumbs).toContainText('Holy Terra');
  const edit = page.getByRole('button', { name: 'Edit', exact: true });
  const account = page.getByRole('button', { name: `Account: ${owner.username}` });
  await expect(edit).toBeVisible();
  await expect(account).toBeVisible();

  for (const width of [1440, 1280, 1279, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const tier = width >= 1280 ? 'full' : 'compact';
    await expect.poll(async () => (await layoutOf(page))?.tier).toBe(tier);
    await expectBarFits(page);

    // Below 1,280 px the buttons show their icons alone, and keep their names.
    const events = page.getByRole('button', { name: 'Events' });
    const box = await events.boundingBox();
    if (!box) throw new Error('No Events button');
    if (tier === 'full') expect(box.width, `Events at ${String(width)}`).toBeGreaterThan(60);
    else expect(box.width, `Events at ${String(width)}`).toBeLessThanOrEqual(44);
    await expect(edit).toBeVisible();
    await expect(account).toBeVisible();
    await expect(page.getByRole('link', { name: 'Galaxy Explorer' })).toBeVisible();
  }
});
