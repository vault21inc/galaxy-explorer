import {
  toPlainText,
  type ViewGroup,
  type ViewGroupType,
  type ViewObject,
  type ViewRoute,
} from '@ge/domain';
import { List } from 'lucide-react';
import { useMemo } from 'react';
import { useEntityList } from '@/api/hooks.ts';
import { Button } from '@/components/ui/button.tsx';
import { useEditor } from '@/state/editor.ts';
import { useSidePanel } from '@/state/side-panel.ts';
import { Outliner } from './outliner.tsx';
import type { Person } from './outliner-tree.ts';

/** Enough for any universe's cast; the API pages beyond this. */
const PEOPLE_LIMIT = 1_000;

/** The universe's characters, named as the outliner names view items. */
export function usePeople(universeId: string): readonly Person[] {
  const list = useEntityList('character', { universeId }, { limit: PEOPLE_LIMIT }).data?.data;
  return useMemo(
    () =>
      (list ?? []).map((character) => ({
        id: character.id,
        namePlain: character.namePlain,
        nameRedacted: toPlainText(character.name, { redactSpoilers: true }),
        isSpoiler: character.isSpoiler,
        nameSpoiler: character.name.spoiler,
        status: character.status,
      })),
    [list],
  );
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
}: {
  universeId: string;
  objects: readonly ViewObject[];
  groups: readonly ViewGroup[];
  groupTypes: readonly ViewGroupType[];
  routes: readonly ViewRoute[];
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
