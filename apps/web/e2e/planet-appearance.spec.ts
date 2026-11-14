import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Planet surfaces: the generator, the system view's textures and the editor (M6-T2). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });
const SURFACE_MAP = new URL('./fixtures/surface-map.png', import.meta.url).pathname;
const PRESETS = [
  'barren',
  'desert',
  'ice',
  'ocean',
  'jungle',
  'lava',
  'toxic',
  'gas_giant',
  'city',
  'forge',
] as const;

/** A system with a star and two planets: an ocean world and a gas giant. */
async function setUp(request: APIRequestContext) {
  const slug = `planets-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: unknown }).data;
  };
  const universe = (await post('/api/v1/universes', { slug, name: plain('Planets') })) as {
    id: string;
  };
  const map = (await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  })) as { id: string };
  const object = (data: object) => ({
    op: 'create',
    kind: 'celestial_object',
    mapId: map.id,
    data,
  });
  const built = (await post('/api/v1/batch', {
    description: 'Planets',
    operations: [
      object({ name: plain('Corvid'), baseType: 'system', explorable: true, x: 0, y: 0, z: 0 }),
      object({ name: plain('Sun'), baseType: 'star', parentId: '$op:0' }),
      object({
        name: plain('Thalassa'),
        baseType: 'planet',
        parentId: '$op:0',
        x: 2,
        appearance: { planet: { preset: 'ocean', seed: 7 } },
      }),
      object({
        name: plain('Jove'),
        baseType: 'planet',
        parentId: '$op:0',
        x: -3,
        z: 1,
        appearance: { planet: { preset: 'gas_giant' } },
      }),
    ],
  })) as { results: { id: string }[] };
  const [system, , ocean, giant] = built.results.map((result) => result.id);
  if (!system || !ocean || !giant) throw new Error('The batch created too little.');
  return { url: `/u/${slug}/main`, system, ocean, giant };
}

async function openSystem(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');
  await waitForIdle(page);
}

const surfaceKey = (page: Page, id: string) =>
  page.evaluate((target) => window.__GE_TEST__?.planetSurface(target)?.key ?? null, id);

async function planetOf(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/v1/objects/${id}`);
  return ((await response.json()) as { data: { appearance: { planet?: Record<string, unknown> } } })
    .data.appearance.planet;
}

test.describe('planet surfaces (M6-T2)', () => {
  test('bakes are deterministic and seamless, for every preset', async ({ page }) => {
    // Every preset is baked and read back: slow with CI's software rendering.
    test.slow();
    const s = await setUp(page.request);
    await openSystem(page, `${s.url}/view/${s.system}`);

    const probe = (appearance: object, options: object) =>
      page.evaluate(([a, o]) => window.__GE_TEST__?.bakePlanet(a as never, o as never) ?? null, [
        appearance,
        options,
      ] as const);
    // The same inputs give the same pixels; another seed, others.
    const first = await probe({ preset: 'ocean' }, { seed: 42 });
    const again = await probe({ preset: 'ocean' }, { seed: 42 });
    const other = await probe({ preset: 'ocean' }, { seed: 43 });
    expect(first?.hash).toBeTruthy();
    expect(again?.hash).toBe(first?.hash);
    expect(other?.hash).not.toBe(first?.hash);

    // Columns 0 and width − 1 are the same meridian (±180°): at most 2/255 apart. Each pole
    // row is one point, so it's one color.
    for (const preset of PRESETS) {
      for (const output of ['surface', 'layers'] as const) {
        const result = await probe(
          { preset, clouds: { enabled: true }, nightLights: { enabled: true } },
          { seed: 5, output },
        );
        expect(result?.seamMaxDiff, `${preset} ${output} seam`).toBeLessThanOrEqual(2);
        expect(result?.poleMaxDiff, `${preset} ${output} poles`).toBeLessThanOrEqual(2);
      }
    }

    // How long a full-size bake takes. Headless browsers render in software, so it's only
    // reported here; `pnpm perf` checks the 50 ms budget on the reference Mac's GPU.
    const timings: number[] = [];
    for (const preset of ['ocean', 'gas_giant', 'city'] as const) {
      const result = await probe({ preset }, { widthPx: 2_048, heightPx: 1_024 });
      timings.push(result?.durationMs ?? Number.NaN);
    }
    test.info().annotations.push({ type: 'bake 2048×1024 (ms)', description: timings.join(', ') });
    console.log(`Planet bake at 2048×1024: ${timings.map((ms) => ms.toFixed(1)).join(', ')} ms`);
    for (const ms of timings) expect(ms).toBeGreaterThan(0);
  });

  test('each planet draws its own surface; the editor previews a slider before saving', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await openSystem(page, `${s.url}/view/${s.system}?select=${s.ocean}`);
    const oceanKey = await surfaceKey(page, s.ocean);
    const giantKey = await surfaceKey(page, s.giant);
    expect(oceanKey).toContain('"preset":"ocean"');
    expect(oceanKey).toContain('"seed":7');
    expect(giantKey).toContain('"preset":"gas_giant"');
    const layers = await page.evaluate(
      ([a, b]) => [a, b].map((id) => window.__GE_TEST__?.planetSurface(id ?? '')?.layer),
      [s.ocean, s.giant],
    );
    expect(new Set(layers).size).toBe(2);

    await page.keyboard.press('e');
    const panel = page.getByRole('complementary', { name: 'Details' });
    const slider = panel.getByRole('slider', { name: 'Sea level' });
    await expect(slider).toBeVisible();

    // Dragging: the input event alone (nothing saved yet) re-bakes the globe. How fast (within
    // 200 ms, M6-T2) is measured by `pnpm perf` on the reference Mac (D-33): run here beside
    // other tests, it measured the machine's load (7 ms alone, over 250 ms in a full run).
    const elapsedMs = await slider.evaluate(
      async (input: HTMLInputElement, [id, before]) => {
        // React watches `input.value` to skip events that change nothing, so the new value
        // goes through the prototype's setter, as the browser's own thumb does.
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        const setValue = descriptor?.set?.bind(input);
        if (!setValue) return -1;
        const start = performance.now();
        // As the browser does while the thumb moves: a new value and an input event.
        setValue('0.3');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        while (performance.now() - start < 2_000) {
          if (window.__GE_TEST__?.planetSurface(id)?.key !== before) {
            return performance.now() - start;
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return Infinity;
      },
      [s.ocean, oceanKey] as const,
    );
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    expect(elapsedMs).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(await surfaceKey(page, s.ocean)).toContain('"seaLevel":0.3');
    // The preview isn't saved until the slider is let go.
    expect((await planetOf(page.request, s.ocean))?.seaLevel).toBeUndefined();

    // A key step saves (the native change event).
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await planetOf(page.request, s.ocean))?.seaLevel).toBeDefined();

    // The dice roll a new seed: saved, and the globe re-baked with it.
    await panel.getByRole('button', { name: 'Roll a new seed' }).click();
    await expect.poll(async () => (await planetOf(page.request, s.ocean))?.seed).not.toBe(7);
    const seed = (await planetOf(page.request, s.ocean))?.seed as number;
    await expect.poll(() => surfaceKey(page, s.ocean)).toContain(`"seed":${seed.toString()}`);

    // Another preset re-bakes it as that preset.
    await panel.getByLabel('Preset').selectOption({ label: 'Desert' });
    await expect.poll(() => surfaceKey(page, s.ocean)).toContain('"preset":"desert"');
    // The gas giant's layer was left alone throughout.
    expect(await surfaceKey(page, s.giant)).toBe(giantKey);
  });

  test('an uploaded map of the globe replaces the generated surface', async ({ page }) => {
    const s = await setUp(page.request);
    await openSystem(page, `${s.url}/view/${s.system}?select=${s.ocean}`);
    await page.keyboard.press('e');
    const panel = page.getByRole('complementary', { name: 'Details' });
    await panel.getByLabel('Surface', { exact: true }).selectOption({
      label: 'An uploaded map of the globe',
    });
    await panel.getByRole('button', { name: 'Choose' }).click();
    await page.getByRole('dialog').getByLabel('Upload images').setInputFiles(SURFACE_MAP);

    await expect
      .poll(() => surfaceKey(page, s.ocean), { timeout: 15_000 })
      .toMatch(/^upload:256:\/media\/.*\/texture\.webp$/);
    expect((await planetOf(page.request, s.ocean))?.texture).toBe('upload');
  });
});
