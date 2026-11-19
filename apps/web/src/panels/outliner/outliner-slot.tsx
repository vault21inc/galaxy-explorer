import { type ViewGroup, type ViewGroupType, type ViewObject, type ViewRoute } from '@ge/domain';
import { List } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEntityList } from '@/api/hooks.ts';
import { Button } from '@/components/ui/button.tsx';
import { Sheet } from '@/components/ui/sheet.tsx';
import { useLayoutTier } from '@/lib/layout-tier.ts';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { useSheet } from '@/state/sheet.ts';
import { useSidePanel } from '@/state/side-panel.ts';
import { Outliner } from './outliner.tsx';
import type { Person } from './outliner-tree.ts';

/** Enough for any universe's cast; the API pages beyond this. */
const PEOPLE_LIMIT = 1_000;

/**
 * The universe's characters, named as the outliner names view items. The naming (people-names.ts)
 * is imported when there are characters to name: it parses rich text, whose parsers stay out of
 * the first visit's JavaScript.
 */
export function usePeople(universeId: string): readonly Person[] {
  const list = useEntityList('character', { universeId }, { limit: PEOPLE_LIMIT }).data?.data;
  const [people, setPeople] = useState<readonly Person[]>([]);
  useEffect(() => {
    if (!list) return;
    let live = true;
    void import('./people-names.ts').then(({ peopleOf }) => {
      if (live) setPeople(peopleOf(list));
    });
    return () => {
      live = false;
    };
  }, [list]);
  return people;
}

/**
 * Where the outliner goes (ux.md §1): always on the left in edit mode, unless History or Map
 * settings is open there; in view mode, behind the List button, or on a phone (the slim tier)
 * in the List sheet that the More sheet opens.
 */
export function OutlinerSlot({
  universeId,
  objects,
  groups,
  groupTypes,
  routes,
  subject = null,
  emptyNote = null,
}: {
  universeId: string;
  objects: readonly ViewObject[];
  groups: readonly ViewGroup[];
  groupTypes: readonly ViewGroupType[];
  routes: readonly ViewRoute[];
  /** A system or orbit view's subject, the outliner's first row. */
  subject?: ViewObject | null;
  /** What an empty view says, in the outliner. */
  emptyNote?: { title: string; hint: string } | null;
}) {
  const editing = useEditor((state) => state.editing);
  const left = useSidePanel((state) => state.left);
  const listOpen = useSidePanel((state) => state.listOpen);
  const setListOpen = useSidePanel((state) => state.setListOpen);
  const people = usePeople(universeId);
  const slim = useLayoutTier() === 'slim';
  const listSheet = useSheet((state) => state.open === 'list');
  useCloseOnChoice(slim && listSheet && !editing);

  if (editing) {
    return left === null ? (
      <Outliner
        objects={objects}
        groups={groups}
        groupTypes={groupTypes}
        routes={routes}
        people={people}
        subject={subject}
        emptyNote={emptyNote}
      />
    ) : null;
  }
  if (slim) {
    return (
      <Sheet
        open={listSheet}
        title="List"
        onClose={() => {
          useSheet.getState().close();
        }}
        onBack={() => {
          useSheet.getState().show('more');
        }}
      >
        <Outliner
          objects={objects}
          groups={groups}
          groupTypes={groupTypes}
          routes={routes}
          people={people}
          subject={subject}
          emptyNote={emptyNote}
          inSheet
        />
      </Sheet>
    );
  }
  if (listOpen) {
    return (
      <Outliner
        objects={objects}
        groups={groups}
        groupTypes={groupTypes}
        routes={routes}
        people={people}
        subject={subject}
        emptyNote={emptyNote}
        onClose={() => {
          setListOpen(false);
        }}
      />
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="absolute top-16 left-4"
      data-tour="list"
      title="Every object in this view, as a list (keyboard and screen readers)"
      onClick={() => {
        setListOpen(true);
      }}
    >
      <List aria-hidden />
      List
    </Button>
  );
}

/**
 * Closes the List sheet when the reader chooses something in it, so the info panel can show
 * what was chosen: on a phone the two don't fit on screen together.
 */
function useCloseOnChoice(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return useSelection.subscribe((state, before) => {
      if (state.selectedIds !== before.selectedIds && state.selectedIds.length > 0) {
        useSheet.getState().close();
      }
    });
  }, [active]);
}
