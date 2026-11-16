import { describe, expect, it } from 'vitest';
import { pageTitle, wantsLinkPreview } from '../src/link-preview.ts';

/** Who gets a link preview's page instead of the app (M8-T9), and the page titles. */

const SLACK = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';
const IMESSAGE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
// A phone whose model has "bot" in it: a person, not a fetcher.
const CUBOT =
  'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const VIEW = '/u/eisenhorn/m41/view/01a1e16e-cdce-7bb8-89e6-6a426fbfd0ba';

describe('wantsLinkPreview', () => {
  it('sends chat apps’ and search engines’ fetchers to the preview page', () => {
    for (const agent of [SLACK, IMESSAGE, 'Discordbot/2.0', 'Googlebot/2.1', 'WhatsApp/2.23']) {
      expect(wantsLinkPreview(VIEW, agent), agent).toBe(true);
    }
  });

  it('leaves people’s browsers, even one with "bot" in its name, with the app', () => {
    expect(wantsLinkPreview(VIEW, CHROME)).toBe(false);
    expect(wantsLinkPreview(VIEW, CUBOT)).toBe(false);
    expect(wantsLinkPreview(VIEW, undefined)).toBe(false);
  });

  it('only for a universe, a map or a view', () => {
    for (const path of ['/u/eisenhorn', '/u/eisenhorn/', '/u/eisenhorn/m41', VIEW]) {
      expect(wantsLinkPreview(path, SLACK), path).toBe(true);
    }
    for (const path of ['/', '/login', '/u/', '/u/Eisenhorn', '/u/a/b/c', '/u/a/b/view/x&y=1']) {
      expect(wantsLinkPreview(path, SLACK), path).toBe(false);
    }
  });
});

describe('pageTitle', () => {
  it('goes from the particular to the site, leaving out empty parts', () => {
    expect(pageTitle(['Gudrun', 'M41', 'Eisenhorn'])).toBe(
      'Gudrun · M41 · Eisenhorn · Galaxy Explorer',
    );
    expect(pageTitle([null, ' ', 'Eisenhorn'])).toBe('Eisenhorn · Galaxy Explorer');
    expect(pageTitle([])).toBe('Galaxy Explorer');
  });
});
