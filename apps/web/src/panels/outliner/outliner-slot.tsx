import { type ViewGroup, type ViewGroupType, type ViewObject, type ViewRoute } from '@ge/domain';
import { List } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEntityList } from '@/api/hooks.ts';
import { Button } from '@/components/ui/button.tsx';
import { useEditor } from '@/state/editor.ts';
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
 * settings is open there; in view mode, behind the List button.
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
