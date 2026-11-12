import type { EntityKind, ViewGroup, ViewObject, ViewLocated, ViewRoute } from '@ge/domain';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { useEventList } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { useNavigation } from '@/state/navigation.ts';
import { usePeople } from './outliner/outliner-slot.tsx';
import { labelText } from '@/render/labels/label-text.ts';
import { SpoilerProvider } from '@/richtext/spoiler-context.tsx';
import { useSelection } from '@/state/selection.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { EntityPanel } from './entity-panel.tsx';

/**
 * The right-hand panel (ux.md §1): the selection's details, or for several selected items, a
 * list of them. About 380 px wide and collapsible; on narrow screens a bottom sheet. Loaded on
 * first selection, as its own chunk. A selected group (a new one, M4-T2) shows the group's
 * details and members, and a selected route (M4-T7) its waypoints.
 */
export default function InfoPanel({
  universeId,
  objects,
  groups = [],
  routes = [],
  pins = [],
}: {
  universeId: string;
  objects: readonly ViewObject[];
  groups?: readonly ViewGroup[];
  routes?: readonly ViewRoute[];
  /** An orbit view's places and events (M6-T4). */
  pins?: readonly ViewLocated[];
}) {
  const selectedIds = useSelection((state) => state.selectedIds);
  const clear = useSelection((state) => state.clear);
  const select = useSelection((state) => state.select);
  const policy = useSpoilerPolicy();
  // Characters belong to the universe, not the view: the outliner's People (M6-T6). Events
  // may be in no view at all (nowhere yet): the map's events list says which ids are events.
  const people = usePeople(universeId);
  const mapId = useNavigation((state) => state.stack[0]?.subjectId);
  const events = useEventList(mapId, useReadOptions()).data?.events;
  const [collapsed, setCollapsed] = useState(false);
  if (selectedIds.length === 0) return null;

  const [onlyId] = selectedIds;
  const single = selectedIds.length === 1 && onlyId !== undefined;
  // The view lists each kind apart; an id in none of them is an object.
  const kindOf = (id: string): EntityKind =>
    groups.some((group) => group.id === id)
      ? 'group'
      : routes.some((route) => route.id === id)
        ? 'route'
        : people.some((person) => person.id === id)
          ? 'character'
          : (pins.find((pin) => pin.id === id)?.kind ??
            (events?.some((event) => event.id === id) ? 'event' : 'celestial_object'));
  return (
    <SpoilerProvider>
      <aside
        aria-label="Details"
        className={
          'absolute inset-x-0 bottom-0 flex max-h-[50vh] flex-col rounded-t-lg border bg-card ' +
          'md:inset-x-auto md:top-16 md:right-4 md:bottom-auto md:max-h-[calc(100%-5rem)] md:w-[380px] md:rounded-lg'
        }
      >
        <div className="flex items-center justify-end gap-1 border-b px-2 py-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? 'Expand details' : 'Collapse details'}
            aria-expanded={!collapsed}
            onClick={() => {
              setCollapsed(!collapsed);
            }}
          >
            {collapsed ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={clear}>
            <X aria-hidden />
          </Button>
        </div>
        {!collapsed && (
          <div className="overflow-y-auto p-4">
            {single ? (
              <EntityPanel kind={kindOf(onlyId)} id={onlyId} universeId={universeId} />
            ) : (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold">{selectedIds.length} selected</h2>
                <ul className="flex flex-col gap-1 text-sm">
                  {selectedIds.map((id) => {
                    const object =
                      objects.find((item) => item.id === id) ??
                      groups.find((item) => item.id === id) ??
                      routes.find((item) => item.id === id) ??
                      pins.find((item) => item.id === id) ??
                      people.find((item) => item.id === id) ??
                      events?.find((item) => item.id === id);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className="text-left hover:text-primary"
                          onClick={() => {
                            select([id]);
                          }}
                        >
                          {object ? labelText(object, policy) : 'Unknown object'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </aside>
    </SpoilerProvider>
  );
}
