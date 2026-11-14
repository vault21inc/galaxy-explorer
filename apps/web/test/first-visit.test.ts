import { describe, expect, it } from 'vitest';
import { FIRST_LABEL_MODE, labelModeOr } from '../src/state/labels.ts';
import { FIRST_SHOW_ALL } from '../src/state/spoilers.ts';

/** First-visit defaults (D-38): the usual ones unless a deployment's build sets others. */
describe('first-visit defaults', () => {
  it('are hover labels and hidden spoilers when the build sets nothing (P3)', () => {
    expect(FIRST_LABEL_MODE).toBe('hover');
    expect(FIRST_SHOW_ALL).toBe(false);
  });

  it('take a label mode from a build setting only if it is one', () => {
    expect(labelModeOr('all', 'hover')).toBe('all');
    expect(labelModeOr('groups', 'hover')).toBe('groups');
    expect(labelModeOr('everything', 'hover')).toBe('hover');
    expect(labelModeOr(undefined, 'hover')).toBe('hover');
  });
});
