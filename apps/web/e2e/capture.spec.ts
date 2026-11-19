import { readFile } from 'node:fs/promises';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { expect, test, type Page } from './test.ts';
import { frameCount, waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * Capture mode (D-55, ux.md §14): the canvas alone, framed to an aspect ratio on black, for
 * screen-recording clips; a scripted camera move between two camera links; Esc leaves. And R
 * records the move to an MP4 at Instagram's exact size (D-56).
 */

const MAP = '/u/example-universe/main';
const START = { position: [1000, 30000, 20000], target: [500, 0, -200] };
const END = { position: [-4000, 9000, 6000], target: [-2000, 0, 1000] };
const asParam = (pose: typeof START) => [...pose.position, ...pose.target].join(',');

async function canvasBox(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('No canvas.');
  return box;
}

/**
 * Everything drawn over the frame that isn't the canvas or its labels: what a recording of the
 * frame would show besides the galaxy. Empty in capture mode.
 */
function intrudersOverFrame(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-testid="view-frame"]');
    if (!frame) return ['no frame'];
    const area = frame.getBoundingClientRect();
    const found: string[] = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (frame.contains(element) || element.contains(frame)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.opacity === '0') continue;
      const overlaps =
        rect.left < area.right &&
        rect.right > area.left &&
        rect.top < area.bottom &&
        rect.bottom > area.top;
      if (overlaps) found.push(`${element.tagName} ${element.textContent.slice(0, 40)}`);
    }
    return found;
  });
}

/** Opens a capture address and waits for its view's camera to be in place (at `cam`). */
async function openAt(page: Page, query: string) {
  await page.goto(`${MAP}?${query}`);
  await waitForFirstFrame(page);
  await expect.poll(() => poseDistance(page, START)).toBeLessThan(1);
}

async function poseDistance(page: Page, want: typeof START): Promise<number> {
  const pose = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
  if (!pose) return Number.POSITIVE_INFINITY;
  const have = [...pose.position, ...pose.target];
  return Math.max(
    ...[...want.position, ...want.target].map((n, i) => Math.abs(n - (have[i] ?? 0))),
  );
}

test('the palette’s command frames the canvas at 9:16 with nothing else in it; Esc leaves', async ({
  page,
}) => {
  await page.goto(MAP);
  await waitForFirstFrame(page);
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('button', { name: 'List' })).toBeVisible();

  const primary =
    (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
  await page.keyboard.press(`${primary}+k`);
  await page.getByRole('combobox', { name: 'Search or run a command' }).fill('capture 9');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/[?&]capture=9x16/);

  // The interface is gone: the top bar, the List button, the panels and toasts' corner.
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('button', { name: 'List' })).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Search or run a command' })).toBeHidden();

  // The canvas is 9:16, full height in this landscape window, centred, with black either side.
  await expect.poll(async () => (await canvasBox(page)).width).toBeLessThan(viewport.width / 2);
  const box = await canvasBox(page);
  expect(box.width / box.height).toBeCloseTo(9 / 16, 2);
  expect(Math.abs(box.height - viewport.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.x - (viewport.width - box.x - box.width))).toBeLessThanOrEqual(1);
  expect(await intrudersOverFrame(page)).toEqual([]);
  // The keys are listed beside the frame, in the bar.
  await expect(page.getByRole('complementary', { name: 'Capture mode' })).toContainText('9:16');

  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/capture=/);
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('button', { name: 'List' })).toBeVisible();
  await expect.poll(async () => (await canvasBox(page)).width).toBe(viewport.width);
});

test('?capture=4x5 frames a feed post, and P plays the move from cam to to', async ({ page }) => {
  await openAt(page, `capture=4x5&cam=${asParam(START)}&to=${asParam(END)}&secs=3`);
  await expect(page.getByRole('banner')).toBeHidden();
  const box = await canvasBox(page);
  expect(box.width / box.height).toBeCloseTo(4 / 5, 2);
  expect(await intrudersOverFrame(page)).toEqual([]);

  await page.keyboard.press('p');
  // Under way: off the start, not yet at the end.
  await expect.poll(() => poseDistance(page, START), { timeout: 5_000 }).toBeGreaterThan(100);
  expect(await poseDistance(page, END)).toBeGreaterThan(100);
  // A 1 s hold, then 3 s of moving: at the end exactly, and the canvas idle again.
  await expect.poll(() => poseDistance(page, END), { timeout: 10_000 }).toBeLessThan(1);
  await waitForIdle(page);
  const frames = await frameCount(page);
  await page.waitForTimeout(500);
  expect(await frameCount(page)).toBe(frames);
});

test('A and B write the move’s ends into the address; a drag stops a move', async ({ page }) => {
  await openAt(page, `capture=9x16&cam=${asParam(START)}`);
  await page.keyboard.press('b');
  await expect(page).toHaveURL(/[?&]to=1000,30000,20000,500,0,-200/);
  await page.keyboard.press('-');
  await waitForIdle(page, 300);
  await page.keyboard.press('a');
  await expect(page).not.toHaveURL(/[?&]cam=1000,30000,20000,500,0,-200/);
  await page.keyboard.press('.');
  await expect(page).toHaveURL(/[?&]secs=12/);

  await page.keyboard.press('p');
  await expect.poll(() => poseDistance(page, START), { timeout: 5_000 }).toBeLessThan(20_000);
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  // Stopped where the drag left it, short of the end.
  await waitForIdle(page);
  expect(await poseDistance(page, START)).toBeGreaterThan(1);
});

test('with reduced motion, P cuts to the end instead of moving', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, `capture=9x16&cam=${asParam(START)}&to=${asParam(END)}&secs=30`);
  await page.keyboard.press('p');
  // A 30 s move would take 30 s; the cut is a fade's length.
  await expect.poll(() => poseDistance(page, END), { timeout: 3_000 }).toBeLessThan(1);
});

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

test('R records the move to an MP4 of exactly 1080 × 1920', async ({ page }) => {
  test.slow();
  // 3 s of moving, and a still second either side, at 24 frames a second: 120 frames.
  await openAt(page, `capture=9x16&cam=${asParam(START)}&to=${asParam(END)}&secs=3&fps=24`);
  const status = page.getByRole('complementary', { name: 'Capture mode' }).getByRole('status');
  if (!(await canEncodeClips(page))) {
    await page.keyboard.press('r');
    await expect(status).toContainText('can’t encode H.264');
    return;
  }
  const download = page.waitForEvent('download');
  await page.keyboard.press('r');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^example-universe-main-9x16-\d{4}-\d\d-\d\d-\d{4}\.mp4$/,
  );

  // Read the file back as a video player would.
  const input = new Input({
    source: new BufferSource(await readFile(await file.path())),
    formats: ALL_FORMATS,
  });
  const track = await input.getPrimaryVideoTrack();
  expect(await track?.getCodec()).toBe('avc');
  expect(await track?.getDisplayWidth()).toBe(1080);
  expect(await track?.getDisplayHeight()).toBe(1920);
  expect((await track?.computePacketStats())?.packetCount).toBe(120);
  expect(await input.computeDuration()).toBeCloseTo(5, 1);

  // Afterwards: the camera where the move ended, the canvas back to drawing on demand.
  await expect(status).toContainText('Saved');
  expect(await poseDistance(page, END)).toBeLessThan(1);
  await waitForIdle(page);
  const frames = await frameCount(page);
  await page.waitForTimeout(500);
  expect(await frameCount(page)).toBe(frames);
});

test('Esc stops a recording, and nothing is saved', async ({ page }) => {
  await openAt(page, `capture=9x16&cam=${asParam(START)}&to=${asParam(END)}&secs=60&fps=60`);
  test.skip(!(await canEncodeClips(page)), 'This browser can’t encode H.264.');
  let saved = false;
  page.on('download', () => {
    saved = true;
  });
  const status = page.getByRole('complementary', { name: 'Capture mode' }).getByRole('status');
  await page.keyboard.press('r');
  await expect(status).toContainText('Recording');
  // Other keys wait while a clip records: still capture mode, still recording.
  await page.keyboard.press('p');
  await expect(status).toContainText('Recording');
  await page.keyboard.press('Escape');
  await expect(status).toContainText('Recording stopped.');
  await expect(page).toHaveURL(/[?&]capture=9x16/);
  expect(saved).toBe(false);
});
