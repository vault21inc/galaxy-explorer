import { expect, test, type APIRequestContext } from './test.ts';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * "Fill from wiki" (M7-T3), against the fixture wiki the e2e run starts
 * (apps/api/test/fixtures/wiki): the real Gudrun page, saved.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function setUp(request: APIRequestContext) {
  const slug = `wiki-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('Wiki') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const planet = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Gudrun'),
    baseType: 'planet',
  });
  const field = (body: object) =>
    post(`/api/v1/universes/${universe.id}/field-definitions`, {
      appliesToKind: 'celestial_object',
      ...body,
    });
  // Population matches by its key; Sub-sector by its label ("sub-sector" in the info box);
  // Region by nothing until the dialog gives it the alias "segmentum".
  await field({ key: 'population', label: 'Population', valueType: 'number', unit: 'billion' });
  await field({ key: 'sub_sector', label: 'Sub-sector', valueType: 'text' });
  await field({ key: 'region', label: 'Region', valueType: 'text' });
  return { slug, universeId: universe.id, planetId: planet.id };
}

interface Filled {
  description: { source: string } | null;
  facts: { value: { type: string; number?: number; text?: { source: string } } }[];
  citations: { target: string; sourceUrl: string; sourceTitle: string; license: string }[];
}

async function filled(request: APIRequestContext, id: string): Promise<Filled> {
  return (
    (await getJson(request, `/api/v1/objects/${id}?include=facts,citations`)) as { data: Filled }
  ).data;
}

async function primary(page: import('@playwright/test').Page) {
  return (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
}

test('filling Gudrun from the wiki: facts and a description, cited, undone in one step (M7-T3)', async ({
  page,
}) => {
  const s = await setUp(page.request);
  await page.goto(`/u/${s.slug}/main?select=${s.planetId}`);
  await waitForFirstFrame(page);
  await waitForIdle(page, 300);
  await page.keyboard.press('e');
  const panel = page.getByRole('complementary', { name: 'Details' });
  await panel.getByRole('button', { name: 'Fill from wiki…' }).click();

  // The search starts with the entry's name; choosing a page shows what it would fill.
  const dialog = page.getByRole('dialog', { name: 'Fill Gudrun from a wiki' });
  await dialog
    .getByRole('list', { name: 'Wiki pages' })
    .getByRole('button', { name: /^Gudrun/ })
    .click();
  const rows = dialog.getByRole('table', { name: 'What to fill' });
  await expect(rows).toContainText('5 billion');
  await expect(rows).toContainText('Helican Sub-sector');
  await expect(dialog).toContainText('text under CC-BY-SA');

  // The segmentum fills no field yet: given to Region as an alias, it does.
  await dialog.getByText(/more values in the info box/).click();
  await dialog
    .getByRole('combobox', { name: 'Use segmentum for' })
    .selectOption({ label: 'Region' });
  await expect(rows).toContainText('Segmentum Obscurus');
  await expect
    .poll(async () => {
      const list = (await getJson(
        page.request,
        `/api/v1/universes/${s.universeId}/field-definitions`,
      )) as { data: { key: string; wikiAliases: string[] }[] };
      return list.data.find((item) => item.key === 'region')?.wikiAliases;
    })
    .toEqual(['segmentum']);

  for (const label of ['Description', 'Population', 'Sub-sector', 'Region']) {
    await expect(rows.getByRole('checkbox', { name: `Fill ${label}` })).toBeChecked();
  }
  await dialog.getByRole('button', { name: 'Fill 4' }).click();
  await expect(dialog).toBeHidden();

  // One batch: the description, three facts, and a citation for each.
  await expect.poll(async () => (await filled(page.request, s.planetId)).citations.length).toBe(4);
  const result = await filled(page.request, s.planetId);
  expect(result.description?.source).toMatch(/^\*\*Gudrun\*\* is the former capital world/);
  expect(result.facts.map((fact) => fact.value.number ?? fact.value.text?.source).sort()).toEqual(
    [5, 'Helican Sub-sector', 'Segmentum Obscurus'].sort(),
  );
  expect(result.citations.map((citation) => citation.target).sort()).toEqual([
    'description',
    'field:population',
    'field:region',
    'field:sub_sector',
  ]);
  expect(result.citations[0]).toMatchObject({
    sourceUrl: 'https://warhammer40k.fandom.com/wiki/Gudrun',
    sourceTitle: 'Gudrun',
    license: 'CC-BY-SA',
  });
  const history = (await getJson(page.request, `/api/v1/universes/${s.universeId}/history`)) as {
    data: { description: string }[];
  };
  expect(history.data.map((batch) => batch.description)).toContain(
    'Filled Gudrun from warhammer40k.fandom.com',
  );

  // Reading: the sources are named under what they filled.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(panel).toContainText('Text from Gudrun (CC-BY-SA)');
  await expect(panel.getByRole('region', { name: 'Sources' })).toContainText('Gudrun');

  // One undo takes the whole fill back (the alias was its own change, before it).
  await page.keyboard.press('e');
  await page.locator('canvas').focus();
  await page.keyboard.press(`${await primary(page)}+z`);
  await expect
    .poll(async () => {
      const after = await filled(page.request, s.planetId);
      return [after.description, after.facts.length, after.citations.length];
    })
    .toEqual([null, 0, 0]);
});
