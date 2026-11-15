import { describe, expect, it } from 'vitest';
import { isoFromPostgresText, upgradeCitationDates } from '../../src/exchange/legacy-dates.ts';

/** Citation dates in exports made before 2026-11-15, written as Postgres prints them. */

describe('isoFromPostgresText', () => {
  it('writes Postgres timestamps the ISO way, keeping the instant', () => {
    for (const [text, iso, utc] of [
      ['2026-11-14 00:07:56.818+00', '2026-11-14T00:07:56.818+00:00', '2026-11-14T00:07:56.818Z'],
      ['2026-11-14 00:07:56+00', '2026-11-14T00:07:56+00:00', '2026-11-14T00:07:56.000Z'],
      [
        '2026-11-14 05:37:56.818123+05:30',
        '2026-11-14T05:37:56.818123+05:30',
        '2026-11-14T00:07:56.818Z',
      ],
      ['2026-11-13 19:07:56.818-05', '2026-11-13T19:07:56.818-05:00', '2026-11-14T00:07:56.818Z'],
    ] as const) {
      expect(isoFromPostgresText(text)).toBe(iso);
      expect(new Date(iso).toISOString()).toBe(utc);
    }
  });

  it('leaves ISO dates and anything else as they are', () => {
    for (const value of ['2026-11-14T00:07:56.818Z', 'yesterday', '', 42, null, undefined]) {
      expect(isoFromPostgresText(value)).toBe(value);
    }
  });
});

describe('upgradeCitationDates', () => {
  it("rewrites the citations of every list's entries, and nothing else", () => {
    const file = {
      map: { slug: 'main', retrievedAt: '2026-11-14 00:07:56.818+00' },
      objects: [
        { ref: 'cadia', citations: [{ retrievedAt: '2026-11-14 00:07:56.818+00' }] },
        { ref: 'gudrun' },
      ],
      characters: [{ ref: 'eisenhorn', citations: [{ retrievedAt: '2026-11-14T00:00:00Z' }] }],
    };
    upgradeCitationDates(file);
    expect(file.objects[0]?.citations?.[0]?.retrievedAt).toBe('2026-11-14T00:07:56.818+00:00');
    expect(file.characters[0]?.citations[0]?.retrievedAt).toBe('2026-11-14T00:00:00Z');
    expect(file.map.retrievedAt).toBe('2026-11-14 00:07:56.818+00');
    expect(file.objects[1]).toEqual({ ref: 'gudrun' });
  });
});
