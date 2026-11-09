import { afterEach, describe, expect, it } from 'vitest';
import { moveDelta, snap } from '../src/editor/snap.ts';
import {
  drawnObject,
  drawnObjects,
  publishDrawn,
  savedObject,
  setMovePreview,
  type DrawnObject,
} from '../src/render/scene-index.ts';

const object = (id: string, center: [number, number, number]): DrawnObject => ({
  id,
  renderer: 'test',
  center,
  radius: 1,
  minRadiusPx: 4,
  maxRadiusPx: 20,
  state: 'normal',
  color: '#ffffff',
  pickPriority: 1,
  label: id,
  labelPriority: 0,
});

describe('moveDelta', () => {
  it("is the pointer's movement on the plane without snapping", () => {
    expect(moveDelta([5, 0, 5], [10, 0, 10], [13, 0, 8], null)).toEqual([3, 0, -2]);
  });

  it('snaps the grabbed object, not the delta, to the grid', () => {
    // Grabbed at x = 7: moving by 4.2 would land at 11.2, which snaps to 10.
    expect(moveDelta([7, 0, 0], [0, 0, 0], [4.2, 0, 0], 10)).toEqual([3, 0, 0]);
    expect(snap(-14, 10)).toBe(-10);
  });

  it('leaves the height alone on a plane drag', () => {
    expect(moveDelta([7, 3, 0], [0, 3, 0], [4, 3, 1], 10)[1]).toBe(0);
  });
});

describe('the move preview', () => {
  afterEach(() => {
    setMovePreview(null);
    publishDrawn('test', null);
  });

  it('shifts only the moving objects, and keeps their saved positions', () => {
    publishDrawn('test', [object('a', [1, 0, 1]), object('b', [5, 0, 5])]);
    setMovePreview({ ids: new Set(['a']), delta: [10, 2, -1] });
    expect(drawnObject('a')?.center).toEqual([11, 2, 0]);
    expect(drawnObject('b')?.center).toEqual([5, 0, 5]);
    expect(savedObject('a')?.center).toEqual([1, 0, 1]);
    expect(drawnObjects().map((item) => item.center)).toEqual([
      [11, 2, 0],
      [5, 0, 5],
    ]);
    setMovePreview(null);
    expect(drawnObject('a')?.center).toEqual([1, 0, 1]);
  });
});
