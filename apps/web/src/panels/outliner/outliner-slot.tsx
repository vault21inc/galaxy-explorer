import type { ViewGroup, ViewGroupType, ViewObject, ViewRoute } from '@ge/domain';
import { List } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { useEditor } from '@/state/editor.ts';
import { useSidePanel } from '@/state/side-panel.ts';
import { Outliner } from './outliner.tsx';

/**
 * Where the outliner goes (ux.md §1): always on the left in edit mode, unless History or Map
 * settings is open there; in view mode, behind the List button.
 */
export function OutlinerSlot({
  objects,
  groups,
  groupTypes,
  routes,
}: {
  objects: readonly ViewObject[];
  groups: readonly ViewGroup[];
  groupTypes: readonly ViewGroupType[];
  routes: readonly ViewRoute[];
}) {
  const editing = useEditor((state) => state.editing);
  const left = useSidePanel((state) => state.left);
  const listOpen = useSidePanel((state) => state.listOpen);
  const setListOpen = useSidePanel((state) => state.setListOpen);

  if (editing) {
    return left === null ? (
      <Outliner objects={objects} groups={groups} groupTypes={groupTypes} routes={routes} />
    ) : null;
  }
  if (listOpen) {
    return (
      <Outliner
        objects={objects}
        groups={groups}
        groupTypes={groupTypes}
        routes={routes}
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
