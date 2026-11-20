import { describe, expect, it } from 'vitest';
import { CLOSE_PULL_PX, FLICK_PX_PER_MS, snapStop } from './sheet-drag.ts';

// A card, half a phone's screen, and all of it under the bar.
const heights = [100, 420, 780];
const slow = 0;
const flickUp = FLICK_PX_PER_MS;
const flickDown = -FLICK_PX_PER_MS;

describe('where a dragged sheet rests', () => {
  it('is the nearest stop when the finger lifts slowly', () => {
    expect(snapStop(heights, 0, 110, slow)).toBe(0);
    expect(snapStop(heights, 0, 259, slow)).toBe(0);
    expect(snapStop(heights, 0, 261, slow)).toBe(1);
    expect(snapStop(heights, 1, 601, slow)).toBe(2);
    expect(snapStop(heights, 2, 500, slow)).toBe(1);
    expect(snapStop(heights, 1, 900, slow)).toBe(2);
  });

  it('is unchanged by a small slow drag', () => {
    expect(snapStop(heights, 0, 110, slow)).toBe(0);
    expect(snapStop(heights, 1, 410, slow)).toBe(1);
    expect(snapStop(heights, 2, 770, slow)).toBe(2);
  });

  it('is one stop on from where a flick began, in its direction', () => {
    expect(snapStop(heights, 0, 130, flickUp)).toBe(1);
    expect(snapStop(heights, 1, 450, flickUp)).toBe(2);
    expect(snapStop(heights, 2, 780, flickUp)).toBe(2);
    expect(snapStop(heights, 2, 760, flickDown)).toBe(1);
    expect(snapStop(heights, 1, 400, flickDown)).toBe(0);
  });

  it('closes on a flick down from the lowest stop, or a long pull below it', () => {
    expect(snapStop(heights, 0, 90, flickDown)).toBe('close');
    expect(snapStop(heights, 0, 100 - CLOSE_PULL_PX, slow)).toBe('close');
    expect(snapStop(heights, 0, 100 - CLOSE_PULL_PX + 1, slow)).toBe(0);
    // From higher up, a slow pull to the bottom closes too; a flick goes one stop.
    expect(snapStop(heights, 1, 10, slow)).toBe('close');
  });
});
