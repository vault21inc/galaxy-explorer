import { describe, expect, it } from 'vitest';
import { keptSearch } from '../src/lib/kept-params.ts';
import { draftsSentence } from '../src/pages/universe-settings/visibility-choice.tsx';

describe('keptSearch (M8-T12)', () => {
  it('keeps perf, a share link’s key and capture mode, and nothing else', () => {
    expect(keptSearch('?perf=1&k=abc&select=x')).toBe('?perf=1&k=abc');
    // Capture mode stays on into another view (D-55); the shot's move belongs to its view.
    expect(keptSearch('?capture=9x16&cam=1,2,3,0,0,0&to=4,5,6,0,0,0&secs=8')).toBe('?capture=9x16');
    expect(keptSearch('?select=x')).toBe('');
    expect(keptSearch('')).toBe('');
  });

  it('adds what the caller asks for', () => {
    expect(keptSearch('?k=abc', { select: 'id-1' })).toBe('?k=abc&select=id-1');
  });

  it('keeps only perf for another universe', () => {
    expect(keptSearch('?perf=1&k=abc', {}, ['perf'])).toBe('?perf=1');
  });
});

describe('draftsSentence (M8-T12)', () => {
  it('says what stays hidden when a universe is made public', () => {
    expect(draftsSentence({ maps: 0, entries: 0 })).toBe(
      'It has no drafts: everything in it will be readable.',
    );
    expect(draftsSentence({ maps: 1, entries: 1 })).toBe(
      '2 drafts stay hidden from readers: 1 map and 1 entry.',
    );
    expect(draftsSentence({ maps: 0, entries: 1 })).toBe(
      '1 draft stays hidden from readers: 1 entry.',
    );
  });
});
