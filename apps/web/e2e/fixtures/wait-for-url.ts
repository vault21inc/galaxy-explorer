/**
 * Waits until a URL answers, for at most three minutes: `node e2e/fixtures/wait-for-url.ts <url>`.
 * The accounts preview (playwright.config.js) waits for the first preview server, which starts
 * only once the build it also serves is done.
 */
const url = process.argv[2];
if (!url) throw new Error('Usage: node e2e/fixtures/wait-for-url.ts <url>');
const deadline = Date.now() + 180_000;
for (;;) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {
    // Not up yet.
  }
  if (Date.now() > deadline) throw new Error(`${url} didn't answer in three minutes.`);
  await new Promise((resolve) => setTimeout(resolve, 500));
}
