import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Custom fields (facts, M7-T1): defined in settings, set in the form, read in the panel. */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A universe of its own with one planet in the galaxy view. */
async function setUp(request: APIRequestContext) {
  const slug = `facts-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('Facts') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const planet = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Gudrun'),
    baseType: 'planet',
  });
  return { slug, universeId: universe.id, planetId: planet.id };
}

async function factsOf(request: APIRequestContext, id: string) {
  return (
    (await getJson(request, `/api/v1/entities/${id}/facts`)) as {
      data: { value: { number?: number }; isSpoiler: boolean }[];
    }
  ).data;
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Details' });
const facts = (page: Page) => panel(page).getByRole('region', { name: 'Facts' });

test('a Population fact: defined in settings, set on a planet, read and hidden (M7-T1)', async ({
  page,
}) => {
  const s = await setUp(page.request);

  // The field, in the universe settings: a number in billions, for planets.
  await page.goto(`/u/${s.slug}/settings`);
  await page.getByRole('button', { name: 'Add field definition' }).click();
  const row = page
    .getByRole('table', { name: 'Field definitions' })
    .getByRole('row', { name: 'New field definition' });
  await row.getByLabel('Label', { exact: true }).fill('Population');
  await row.getByLabel('Key', { exact: true }).fill('population');
  await row.getByLabel('Value type', { exact: true }).selectOption({ label: 'Number' });
  await row.getByLabel('Unit', { exact: true }).fill('billion');
  await row.getByLabel('Base type', { exact: true }).selectOption({ label: 'Planet' });
  await row.getByLabel('Wiki aliases', { exact: true }).fill('population, pop');
  await row.getByRole('button', { name: 'Create' }).click();
  await expect(
    page.getByRole('table', { name: 'Field definitions' }).getByRole('row', { name: /Population/ }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const list = (await getJson(
        page.request,
        `/api/v1/universes/${s.universeId}/field-definitions`,
      )) as {
        data: { key: string; unit: string; appliesToBaseType: string; wikiAliases: string[] }[];
      };
      return list.data[0];
    })
    .toMatchObject({
      key: 'population',
      unit: 'billion',
      appliesToBaseType: 'planet',
      wikiAliases: ['population', 'pop'],
    });

  // Set on the planet, in edit mode.
  await page.goto(`/u/${s.slug}/main?select=${s.planetId}`);
  await waitForFirstFrame(page);
  await waitForIdle(page, 300);
  await page.keyboard.press('e');
  const population = facts(page).getByRole('spinbutton', { name: 'Population' });
  await population.fill('12.5');
  await population.press('Enter');
  await expect
    .poll(async () => (await factsOf(page.request, s.planetId))[0]?.value.number)
    .toBe(12.5);

  // View mode shows it with its unit.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(facts(page)).toContainText('Population');
  await expect(facts(page)).toContainText('12.5 billion');

  // Flagged as a spoiler, it's blacked out until spoilers are shown.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await facts(page).getByRole('switch', { name: 'Population is a spoiler' }).click();
  await expect.poll(async () => (await factsOf(page.request, s.planetId))[0]?.isSpoiler).toBe(true);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(facts(page)).toContainText('Population');
  await expect(facts(page)).not.toContainText('12.5');
  await page.getByRole('button', { name: 'Spoilers: Hidden' }).click();
  await expect(facts(page)).toContainText('12.5 billion');
});
