import { describe, expect, it } from 'vitest';
import { HexColor } from '../src/colors.ts';
import { Slug, Uuid } from '../src/ids.ts';
import { isAllowedImageSource, isAllowedLinkUrl, RICH_TEXT_POLICY } from '../src/richtext/index.ts';
import { isHidden } from '../src/spoilers/index.ts';

describe('isAllowedLinkUrl', () => {
  it.each([
    ['https://example.com/a?b#c', true],
    ['HTTP://EXAMPLE.COM', true],
    ['mailto:someone@example.com', true],
    ['/u/warhammer/m41', true],
    ['#section', true],
    ['javascript:alert(1)', false],
    ['JavaScript:alert(1)', false],
    [' java\tscript:alert(1)', false],
    ['\u0001javascript:alert(1)', false],
    ['data:text/html,<script>alert(1)</script>', false],
    ['vbscript:msgbox(1)', false],
    ['//evil.example', false],
    ['/\\evil.example', false],
    ['relative/path', false],
  ])('%j → %s', (url, allowed) => {
    expect(isAllowedLinkUrl(url)).toBe(allowed);
  });
});

describe('isAllowedImageSource', () => {
  it.each([
    ['/media/ab/cd.webp', true],
    ['https://example.com/x.png', false],
    ['/api/media/x.png', false],
    ['/media/../api/secret', false],
    ['/media/..%2f', true], // still under /media/: the server resolves media paths safely (M3)
    ['/media\\..\\x', false],
    ['data:image/svg+xml,<svg/>', false],
  ])('%j → %s', (src, allowed) => {
    expect(isAllowedImageSource(src)).toBe(allowed);
  });

  it('matches the policy prefix', () => {
    expect(RICH_TEXT_POLICY.imageSourcePrefix).toBe('/media/');
  });
});

describe('isHidden', () => {
  it('hides only flagged items that are neither shown globally nor revealed', () => {
    const policy = { showAll: false, revealed: new Set(['k']) };
    expect(isHidden(false, 'x', policy)).toBe(false);
    expect(isHidden(true, 'x', policy)).toBe(true);
    expect(isHidden(true, 'k', policy)).toBe(false);
    expect(isHidden(true, 'x', { showAll: true, revealed: new Set() })).toBe(false);
  });
});

describe('identifier and color schemas', () => {
  it.each(['gudrun', 'warhammer-40k', 'm41'])('accepts the slug %j', (value) => {
    expect(Slug.safeParse(value).success).toBe(true);
  });
  it.each(['', 'Gudrun', 'a--b', '-a', 'a-', 'a b', 'é'])('rejects the slug %j', (value) => {
    expect(Slug.safeParse(value).success).toBe(false);
  });
  it('accepts lower-case six-digit hex colors only', () => {
    expect(HexColor.safeParse('#4fd1ff').success).toBe(true);
    for (const bad of ['#4FD1FF', '#fff', '4fd1ff', '#4fd1ffaa']) {
      expect(HexColor.safeParse(bad).success).toBe(false);
    }
  });
  it('accepts UUIDs, including v7', () => {
    expect(Uuid.safeParse('019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b').success).toBe(true);
    expect(Uuid.safeParse('not-a-uuid').success).toBe(false);
  });
});
