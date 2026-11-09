import { describe, expect, it } from 'vitest';
import { boxSelection, rectBetween } from '../src/editor/box.ts';
import { useEditor } from '../src/state/editor.ts';

describe('box selection', () => {
  it('normalizes a drag in any direction', () => {
    expect(rectBetween({ x: 50, y: 10 }, { x: 5, y: 40 })).toEqual({
      left: 5,
      top: 10,
      right: 50,
      bottom: 40,
    });
  });

  it('replaces the selection, or adds to it with Shift', () => {
    expect(boxSelection(['a', 'b'], ['c'], false)).toEqual(['c']);
    expect(boxSelection(['a', 'b'], ['b', 'c'], true)).toEqual(['a', 'b', 'c']);
  });
});

describe('the editor store', () => {
  it('enters edit mode only where it is offered, and leaves it with the page', () => {
    useEditor.setState({ editing: false, available: false });
    useEditor.getState().toggle();
    expect(useEditor.getState().editing).toBe(false);

    useEditor.getState().setAvailable(true);
    useEditor.getState().toggle();
    expect(useEditor.getState().editing).toBe(true);

    useEditor.getState().setAvailable(false);
    expect(useEditor.getState().editing).toBe(false);
  });
});
