import { describe, expect, it } from 'vitest';
import { NO_INSETS } from '@/state/view-insets.ts';
import { fitScale, shiftFor } from './view-shift.ts';

// An iPhone in a browser: 390 × 664, a 56 px top bar, and the details at half the screen.
const size = { width: 390, height: 664 };
const half = { topPx: 56, rightPx: 0, bottomPx: 332 };

describe('the view shift', () => {
  it('is nothing with no panel, and with only the top bar or a card in the way', () => {
    expect(shiftFor(NO_INSETS)).toEqual({ xPx: 0, yPx: 0 });
    expect(shiftFor({ topPx: 56, rightPx: 0, bottomPx: 0 })).toEqual({ xPx: 0, yPx: 0 });
    // The panel reports no insets at the card; even if it did, a strip no taller than the bar
    // moves nothing.
    expect(shiftFor({ topPx: 56, rightPx: 0, bottomPx: 40 })).toEqual({ xPx: 0, yPx: 0 });
  });

  it('puts the center in the middle of the band above an opened sheet', () => {
    const { yPx } = shiftFor(half);
    expect(yPx).toBe(138);
    // The canvas's middle, moved up, is the band's middle: (56 + 332) / 2 from the top.
    expect(size.height / 2 - yPx).toBe((half.topPx + (size.height - half.bottomPx)) / 2);
  });

  it('moves left by half a panel on the right', () => {
    expect(shiftFor({ topPx: 0, rightPx: 388, bottomPx: 0 })).toEqual({ xPx: 194, yPx: 0 });
  });
});

describe('framing in the uncovered band', () => {
  it('changes nothing with no insets', () => {
    expect(fitScale(size, NO_INSETS)).toBe(1);
  });

  it('is the canvas’s smaller side over the band’s', () => {
    // The band is 390 wide and 664 - 56 - 332 = 276 high.
    expect(fitScale(size, half)).toBeCloseTo(390 / 276);
    // On its side: 844 × 390 with a 388 px panel leaves 456 × 390, as roomy as before.
    expect(fitScale({ width: 844, height: 390 }, { topPx: 0, rightPx: 388, bottomPx: 0 })).toBe(1);
  });

  it('is never under 1, and 1 when nothing is left uncovered', () => {
    expect(fitScale(size, { topPx: 0, rightPx: 0, bottomPx: 10 })).toBeGreaterThanOrEqual(1);
    expect(fitScale(size, { topPx: 400, rightPx: 0, bottomPx: 400 })).toBe(1);
  });
});
