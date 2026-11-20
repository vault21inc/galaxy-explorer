import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT_QUERIES } from '@/lib/layout-tier.ts';
import { shownStop, tallerStop, useDetailsSheet } from '@/state/details-sheet.ts';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';

const stop = () => useDetailsSheet.getState().stop;
const select = (...ids: string[]) => {
  useSelection.getState().select(ids);
};

describe('where the details sheet rests (D-58)', () => {
  beforeEach(() => {
    // A phone: only the slim tier's query matches.
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({ matches: query === LAYOUT_QUERIES.slim }),
    });
    useEditor.setState({ editing: false });
    useSelection.getState().clear();
    useDetailsSheet.setState({ stop: 'card', pending: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens at the card for a selection made from nothing', () => {
    useDetailsSheet.getState().setStop('full');
    useSelection.getState().clear();
    select('terra');
    expect(stop()).toBe('card');
  });

  it('keeps its stop while the selection changes, and resets when it clears', () => {
    select('terra');
    useDetailsSheet.getState().setStop('half');
    select('ares');
    expect(stop()).toBe('half');
    useSelection.getState().clear();
    expect(stop()).toBe('card');
  });

  it('opens at least as far as a choice by name asked, even across a cleared selection', () => {
    select('terra');
    useDetailsSheet.getState().raise('half');
    expect(stop()).toBe('half');
    // A view change clears the selection, then selects what was chosen.
    useSelection.getState().clear();
    expect(stop()).toBe('card');
    select('ares');
    expect(stop()).toBe('half');
    // The wish is spent: the next tap from nothing gives the card.
    useSelection.getState().clear();
    select('terra');
    expect(stop()).toBe('card');
  });

  it('never lowers a taller stop when raised', () => {
    select('terra');
    useDetailsSheet.getState().setStop('full');
    useDetailsSheet.getState().raise('half');
    expect(stop()).toBe('full');
  });

  it('opens for the form in edit mode', () => {
    select('terra');
    useEditor.setState({ editing: true });
    expect(stop()).toBe('half');
    useSelection.getState().clear();
    select('ares');
    expect(stop()).toBe('half');
  });

  it('opens the panel, not a card, in a wide window', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({ matches: query === LAYOUT_QUERIES.full }),
    });
    select('terra');
    expect(stop()).toBe('half');
  });

  it('shows the side panel as open for both taller stops', () => {
    expect(shownStop('full', true)).toBe('half');
    expect(shownStop('full', false)).toBe('full');
    expect(shownStop('card', true)).toBe('card');
    expect(tallerStop('card', 'half')).toBe('half');
    expect(tallerStop('full', 'half')).toBe('full');
  });
});
