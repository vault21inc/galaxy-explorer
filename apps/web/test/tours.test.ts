import { afterEach, describe, expect, it } from 'vitest';
import { COMPLETIONS } from '../src/help/completions.ts';
import { NEEDS } from '../src/help/needs.ts';
import { useTour } from '../src/help/tour-store.ts';
import {
  OBJECT_PICKS,
  TARGET_KINDS,
  TOUR_COMPLETIONS,
  TOUR_CONTROLS,
  TOUR_NEEDS,
} from '../src/help/tour-types.ts';
import { TOURS } from '../src/help/tours.ts';
import { useEditor } from '../src/state/editor.ts';

/** The guided tours' registry (M8-T10): every step uses what the tour layer knows. */

const allSteps = Object.values(TOURS).flatMap((tour) =>
  tour.steps.map((step) => ({ tour: tour.id, step })),
);

/** Every component's source, as text: where the `data-tour` marks are. Vite reads them. */
const SOURCES = import.meta.glob<string>('../src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('the tour registry', () => {
  it('has unique step ids in each tour, in the app’s own words', () => {
    for (const tour of Object.values(TOURS)) {
      const ids = tour.steps.map((step) => step.id);
      expect(new Set(ids).size, tour.id).toBe(ids.length);
    }
    for (const { tour, step } of allSteps) {
      expect(`${step.title} ${step.text}`, `${tour}/${step.id}`).not.toMatch(/\bscenes?\b/i);
    }
  });

  it('names only targets, completions and needs the tour layer knows', () => {
    for (const { tour, step } of allSteps) {
      const where = `${tour}/${step.id}`;
      expect(TARGET_KINDS, where).toContain(step.target.kind);
      if (step.target.kind === 'control') expect(TOUR_CONTROLS, where).toContain(step.target.name);
      if (step.target.kind === 'object') expect(OBJECT_PICKS, where).toContain(step.target.pick);
      expect(TOUR_COMPLETIONS, where).toContain(step.completes);
      for (const need of step.needs ?? []) expect(TOUR_NEEDS, where).toContain(need);
    }
    // And the layer knows each of them.
    expect(Object.keys(COMPLETIONS).sort()).toEqual([...TOUR_COMPLETIONS].sort());
    expect(Object.keys(NEEDS).sort()).toEqual([...TOUR_NEEDS].sort());
  });

  it('says each reader step in a phone’s words when it names a key or the mouse (L3-T3)', () => {
    const pointerWords = /\b(click|right-drag|scroll|press|hold space|double-click|⌘|ctrl)\b/i;
    for (const step of TOURS.reader.steps) {
      if (pointerWords.test(step.text)) expect(step.touchText, step.id).toBeTruthy();
      if (step.touchText) expect(step.touchText, step.id).not.toMatch(pointerWords);
    }
  });

  it('points only at controls marked in the markup', () => {
    const source = Object.values(SOURCES).join('\n');
    const toolbar = SOURCES['../src/editor/edit-toolbar.tsx'] ?? '';
    for (const name of TOUR_CONTROLS) {
      if (name.startsWith('tool-')) {
        // The toolbar marks each tool from its label: `tool-${label.toLowerCase()}`.
        const label = name.slice('tool-'.length);
        expect(toolbar, name).toContain('data-tour={`tool-${label.toLowerCase()}`}');
        expect(toolbar.toLowerCase(), name).toContain(`label: '${label}'`);
      } else {
        expect(
          source.includes(`data-tour="${name}"`) || source.includes(`tourName="${name}"`),
          name,
        ).toBe(true);
      }
    }
  });
});

describe('a tour’s steps', () => {
  afterEach(() => {
    useTour.setState({ active: null, practice: null, finishing: false, pending: null });
    useEditor.setState({ editing: false, available: false });
  });

  const walk = () => {
    const seen: string[] = [];
    for (let guard = 0; guard < 50; guard++) {
      const active = useTour.getState().active;
      if (!active) break;
      seen.push(TOURS[active.tour].steps[active.index]?.id ?? '?');
      useTour.getState().next();
    }
    return seen;
  };

  it('skip the ones whose needs aren’t met, and end past the last', () => {
    // May edit, but edit mode stays off, nothing is drawn and no view is entered.
    useEditor.setState({ editing: false, available: true });
    useTour.getState().start('editor', { universeId: 'u', slug: 'practice-1' });
    expect(walk()).toEqual(['edit-mode', 'settings', 'delete']);
    // The editor tour then asks about its practice universe.
    expect(useTour.getState().finishing).toBe(true);
  });

  it('pass over one whose action is done already', () => {
    useEditor.setState({ editing: true, available: true });
    useTour.getState().start('editor');
    expect(TOURS.editor.steps[useTour.getState().active?.index ?? -1]?.id).toBe('toolbar');
  });

  it('go back to the last one that shows', () => {
    useEditor.setState({ editing: false, available: true });
    useTour.getState().start('editor');
    useTour.getState().next();
    expect(TOURS.editor.steps[useTour.getState().active?.index ?? -1]?.id).toBe('settings');
    useTour.getState().back();
    expect(TOURS.editor.steps[useTour.getState().active?.index ?? -1]?.id).toBe('edit-mode');
  });
});
