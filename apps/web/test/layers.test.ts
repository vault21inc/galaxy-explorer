import { beforeEach, describe, expect, it } from 'vitest';
import { isTypeShown, useLayers } from '../src/state/layers.ts';

/** Layer visibility (M4-T5): what's hidden, and that only well-formed state comes back. */

const visibility = (layers: string[], types: string[]) => ({
  hiddenLayers: new Set(layers),
  hiddenTypes: new Set(types),
});

describe('isTypeShown', () => {
  const sub = { id: 'sub', layer: 'Administrative' };
  it('hides a type when its layer or the type itself is hidden', () => {
    expect(isTypeShown(sub, visibility([], []))).toBe(true);
    expect(isTypeShown(sub, visibility(['Administrative'], []))).toBe(false);
    expect(isTypeShown(sub, visibility([], ['sub']))).toBe(false);
    expect(isTypeShown(sub, visibility(['Political'], ['realm']))).toBe(true);
  });

  it('shows a group whose type the view doesn’t know', () => {
    expect(isTypeShown(undefined, visibility(['Administrative'], ['sub']))).toBe(true);
  });
});

describe('useLayers', () => {
  beforeEach(() => {
    useLayers.setState({ hiddenLayers: {}, hiddenTypes: [] });
  });

  it('hides layers per universe, and types by id', () => {
    const { setLayerHidden, setTypeHidden } = useLayers.getState();
    setLayerHidden('u1', 'Political', true);
    setLayerHidden('u1', 'Political', true);
    setTypeHidden('realm', true);
    expect(useLayers.getState().hiddenLayers).toEqual({ u1: ['Political'] });
    expect(useLayers.getState().hiddenTypes).toEqual(['realm']);
    setLayerHidden('u1', 'Political', false);
    setTypeHidden('realm', false);
    expect(useLayers.getState().hiddenLayers).toEqual({ u1: [] });
    expect(useLayers.getState().hiddenTypes).toEqual([]);
  });

  it('keeps only lists of strings from storage', () => {
    const merge = useLayers.persist.getOptions().merge;
    if (!merge) throw new Error('No merge.');
    const merged = merge(
      { hiddenLayers: { u1: ['Political', 3], u2: 'nope' }, hiddenTypes: [null, 'realm'] },
      useLayers.getState(),
    );
    expect(merged.hiddenLayers).toEqual({ u1: ['Political'], u2: [] });
    expect(merged.hiddenTypes).toEqual(['realm']);
  });
});
