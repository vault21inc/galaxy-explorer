import { readFile } from 'node:fs/promises';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { expect, test, type Page } from './test.ts';
import { frameCount, waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * Capture mode by touch (D-57, docs/plan/later/phone-usability.md, L3-T5), in the phone
 * projects: entered from More, driven by its buttons, and a finished clip either downloaded or
 * offered to the share sheet. Controls are tapped: a click would count as a mouse.
 */

const MAP = '/u/example-universe/main';
const START = { position: [1000, 30000, 20000], target: [500, 0, -200] };
const asParam = (pose: typeof START) => [...pose.position, ...pose.target].join(',');

const controls = (page: Page) => page.getByTestId('capture-controls');
const button = (page: Page, name: string) => controls(page).getByRole('button', { name });

/** How far the camera is from a pose, in scene units. */
function poseDistance(page: Page, pose: typeof START): Promise<number> {
  return page.evaluate((expected) => {
    const now = window.__GE_TEST__?.cameraPose();
    if (!now) return Infinity;
    return Math.hypot(...now.position.map((value, axis) => value - (expected.position[axis] ?? 0)));
  }, pose);
}

async function openAt(page: Page, query: string) {
  await page.goto(`${MAP}?${query}`);
  await waitForFirstFrame(page);
  await waitForIdle(page, 500);
}

/** Whether this browser can encode H.264 at 1080 × 1920 (Linux builds of Chromium may not). */
function canEncodeClips(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('VideoEncoder' in window)) return false;
    const support = await VideoEncoder.isConfigSupported({
      codec: 'avc1.640028',
      width: 1080,
      height: 1920,
    });
    return support.supported === true;
  });
}

test('More enters capture mode, and its buttons set, play and leave the move', async ({ page }) => {
  await page.goto(MAP);
  await waitForFirstFrame(page);
  await page.getByRole('button', { name: 'More', exact: true }).tap();
  await page
    .getByRole('dialog', { name: 'More' })
    .getByRole('button', { name: 'Record a clip' })
    .tap();
  await page
    .getByRole('dialog', { name: 'Record a clip' })
    .getByRole('button', { name: /9:16/ })
    .tap();
  await expect(page).toHaveURL(/[?&]capture=9x16/);
  await expect(controls(page)).toBeVisible();
  await expect(page.getByRole('banner')).toBeHidden();

  // The start where the camera is, then the end after zooming out.
  await button(page, 'Start here').tap();
  await expect(page).toHaveURL(/[?&]cam=/);
  await page.keyboard.press('-');
  await waitForIdle(page, 300);
  await button(page, 'End here').tap();
  await expect(page).toHaveURL(/[?&]to=/);
  await button(page, 'Shorter').tap();
  await expect(page).toHaveURL(/[?&]secs=8/);

  // Playing hides the buttons; they come back when the move ends.
  await button(page, 'Play').tap();
  await expect(controls(page)).toBeHidden();
  await expect(controls(page)).toBeVisible({ timeout: 15_000 });

  // With the buttons showing, the canvas draws nothing.
  await waitForIdle(page);
  const frames = await frameCount(page);
  await page.waitForTimeout(500);
  expect(await frameCount(page)).toBe(frames);

  await button(page, 'Leave').tap();
  await expect(page).not.toHaveURL(/[?&]capture=/);
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
});

test('a tap on the frame stops a move', async ({ page }) => {
  await openAt(page, `capture=9x16&cam=${asParam(START)}&secs=30&spin=360`);
  await button(page, 'Play').tap();
  await expect(controls(page)).toBeHidden();
  await expect.poll(() => poseDistance(page, START), { timeout: 5_000 }).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Stop the move' }).tap();
  await expect(controls(page)).toBeVisible();
});

test('Record saves an MP4 of exactly 1080 × 1920 where the share sheet can’t take it', async ({
  page,
}) => {
  test.slow();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
  });
  await openAt(page, `capture=9x16&cam=${asParam(START)}&secs=3&fps=24&spin=90`);
  if (!(await canEncodeClips(page))) {
    await button(page, 'Record').tap();
    await expect(controls(page).getByRole('status')).toContainText('can’t encode H.264');
    return;
  }
  const download = page.waitForEvent('download');
  await button(page, 'Record').tap();
  await expect(button(page, 'Stop recording')).toBeVisible();
  const file = await download;
  const input = new Input({
    source: new BufferSource(await readFile(await file.path())),
    formats: ALL_FORMATS,
  });
  const track = await input.getPrimaryVideoTrack();
  expect(await track?.getDisplayWidth()).toBe(1080);
  expect(await track?.getDisplayHeight()).toBe(1920);
  expect((await track?.computePacketStats())?.packetCount).toBe(120);
  await expect(controls(page).getByRole('status')).toContainText('Saved');
});

test('on a phone, a finished clip goes to the share sheet, from a tap of its own', async ({
  page,
}) => {
  test.slow();
  await page.addInitScript(() => {
    const shared: { name: string; type: string; size: number }[] = [];
    Object.defineProperty(window, '__shared', { value: shared });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: { files?: File[] }) => {
        for (const file of data.files ?? []) {
          shared.push({ name: file.name, type: file.type, size: file.size });
        }
        return Promise.resolve();
      },
    });
  });
  await openAt(page, `capture=9x16&cam=${asParam(START)}&secs=3&fps=24&spin=90`);
  test.skip(!(await canEncodeClips(page)), 'This browser can’t encode H.264.');
  let downloaded = false;
  page.on('download', () => {
    downloaded = true;
  });
  await button(page, 'Record').tap();
  const save = button(page, 'Save or share the clip');
  // As long as the recording takes: minutes with software rendering (CI), so the test's own.
  await expect(save).toBeVisible({ timeout: 0 });
  await save.tap();
  await expect(save).toBeHidden();
  const shared = await page.evaluate(
    () =>
      (window as unknown as { __shared: { name: string; type: string; size: number }[] }).__shared,
  );
  expect(shared).toHaveLength(1);
  expect(shared[0]?.name).toMatch(/^example-universe-main-9x16-.*\.mp4$/);
  expect(shared[0]?.type).toBe('video/mp4');
  expect(shared[0]?.size).toBeGreaterThan(10_000);
  expect(downloaded).toBe(false);
});
