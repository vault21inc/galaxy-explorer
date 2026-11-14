import { describe, expect, it } from 'vitest';
import { keptSearch } from '../src/lib/kept-params.ts';
import { draftsSentence } from '../src/pages/universe-settings/visibility-choice.tsx';

describe('keptSearch (M8-T12)', () => {
  it('keeps perf and a share link’s key, and nothing else', () => {
    expect(keptSearch('?perf=1&k=abc&select=x')).toBe('?perf=1&k=abc');
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
