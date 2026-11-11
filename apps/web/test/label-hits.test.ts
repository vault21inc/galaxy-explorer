import { describe, expect, it } from 'vitest';
import { labelHitAt, publishLabelHits } from '@/render/picking/label-hits.ts';
import { LABEL_GAP_PX, LABEL_HIT_PADDING_PX } from '@/render/tuning.ts';

/** Object labels as pick targets. */

describe('labelHitAt', () => {
  it('hits an object label within its box, reaching back across the gap to its body', () => {
    publishLabelHits([
      { id: 'a', text: 'Aster', kind: 'object', left: 100, top: 50, width: 40, height: 16 },
      { id: 'g', text: 'SECTOR', kind: 'group', left: 300, top: 50, width: 60, height: 16 },
    ]);
    expect(labelHitAt(120, 58)).toBe('a');
    expect(labelHitAt(100 - LABEL_GAP_PX - LABEL_HIT_PADDING_PX, 58)).toBe('a');
    expect(labelHitAt(140 + LABEL_HIT_PADDING_PX, 58)).toBe('a');
    expect(labelHitAt(140 + LABEL_HIT_PADDING_PX + 1, 58)).toBeNull();
    expect(labelHitAt(120, 50 + 16 + LABEL_HIT_PADDING_PX + 1)).toBeNull();
    // Group labels take their own clicks.
    expect(labelHitAt(320, 58)).toBeNull();
    publishLabelHits([]);
    expect(labelHitAt(120, 58)).toBeNull();
  });
});
