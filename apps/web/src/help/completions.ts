import { useEditor } from '@/state/editor.ts';
import { useHistory } from '@/state/history.ts';
import { useLabels } from '@/state/labels.ts';
import { useNavigation } from '@/state/navigation.ts';
import { useSelection } from '@/state/selection.ts';
import { useSheet } from '@/state/sheet.ts';
import { useSidePanel } from '@/state/side-panel.ts';
import { currentLevel } from './needs.ts';
import { useTourSignals } from './tour-signals.ts';
import type { TourCompletion } from './tour-types.ts';

/**
 * How the tour layer knows a step is done (M8-T10): each completion watches a store and calls
 * `done` when the reader has done the thing. `already` says it's done before the step starts
 * (edit mode is on already), so the step is passed over. Stores, not polling: nothing runs
 * while nothing changes.
 */
export interface CompletionWatch {
  already?: () => boolean;
  watch: (done: () => void) => () => void;
}

const levelIs = (level: ReturnType<typeof currentLevel>): CompletionWatch => ({
  already: () => currentLevel() === level,
  watch: (done) =>
    useNavigation.subscribe(() => {
      if (currentLevel() === level) done();
    }),
});

export const COMPLETIONS: Record<TourCompletion, CompletionWatch> = {
  next: { watch: () => () => undefined },
  'camera-moved': {
    watch: (done) =>
      useTourSignals.subscribe((state, before) => {
        if (state.cameraMoves !== before.cameraMoves) done();
      }),
  },
  selected: {
    watch: (done) =>
      useSelection.subscribe((state, before) => {
        if (state.selectedIds.length > 0 && state.selectedIds !== before.selectedIds) done();
      }),
  },
  'labels-changed': {
    watch: (done) =>
      useLabels.subscribe((state, before) => {
        if (state.mode !== before.mode) done();
      }),
  },
  // The List button, or on a phone the List sheet (state/sheet.ts).
  'list-opened': {
    already: () => useSidePanel.getState().listOpen || useSheet.getState().open === 'list',
    watch: (done) => {
      const stopPanel = useSidePanel.subscribe((state) => {
        if (state.listOpen) done();
      });
      const stopSheet = useSheet.subscribe((state) => {
        if (state.open === 'list') done();
      });
      return () => {
        stopPanel();
        stopSheet();
      };
    },
  },
  'entered-system': levelIs('system'),
  'entered-orbit': levelIs('orbit'),
  'back-to-galaxy': levelIs('galaxy'),
  'editing-on': {
    already: () => useEditor.getState().editing,
    watch: (done) =>
      useEditor.subscribe((state) => {
        if (state.editing) done();
      }),
  },
  // Any change saved: a new object, a move, a group. Undoing one counts too.
  'change-made': {
    watch: (done) =>
      useHistory.subscribe((state, before) => {
        if (state.changes > before.changes) done();
      }),
  },
};
