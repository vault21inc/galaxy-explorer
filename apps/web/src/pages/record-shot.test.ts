import { describe, expect, it } from 'vitest';
import { CAPTURE_ASPECTS } from '@/lib/capture-params.ts';
import { clipName } from './record-shot.ts';

describe('a recorded clip’s name (D-56)', () => {
  const [nineBySixteen] = CAPTURE_ASPECTS;
  const at = new Date(2026, 10, 18, 9, 5);

  it('names the universe, the map, the frame and when', () => {
    expect(clipName(nineBySixteen, at, '/u/milky-way/present-day')).toBe(
      'milky-way-present-day-9x16-2026-11-18-0905.mp4',
    );
    expect(clipName(nineBySixteen, at, '/u/milky-way/present-day/view/01a1e7')).toBe(
      'milky-way-present-day-9x16-2026-11-18-0905.mp4',
    );
  });
});
