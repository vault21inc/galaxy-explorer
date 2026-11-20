import type { EntityKind, ViewGroup, ViewObject, ViewLocated, ViewRoute } from '@ge/domain';
import { useLayoutEffect, useRef, useState } from 'react';
import { useEventList } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { UP_TO_BAR_HEIGHT } from '@/app/panel-classes.ts';
import { SHEET_MOVE_MS } from '@/components/ui/sheet-drag.ts';
import { matches, useLayoutTier, useShort } from '@/lib/layout-tier.ts';
import { cn } from '@/lib/utils.ts';
import { labelText } from '@/render/labels/label-text.ts';
import { SpoilerProvider } from '@/richtext/spoiler-context.tsx';
import { shownStop, useDetailsSheet, type DetailsStop } from '@/state/details-sheet.ts';
import { useNavigation } from '@/state/navigation.ts';
import { useSelection } from '@/state/selection.ts';
import { useSheet } from '@/state/sheet.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { DetailsCard, SelectionCard } from './details-card.tsx';
import { DetailsStrip } from './details-strip.tsx';
import { EntityPanel } from './entity-panel.tsx';
import { usePeople } from './outliner/outliner-slot.tsx';
import { useDetailsDrag } from './use-details-drag.ts';

/**
 * Moves the sheet from the height it had to the height it has now, hung from the bottom. A
 * stop's height is the browser's to work out (the card is as tall as its text), which CSS
 * can't ease between, so the two heights are measured and animated (the Web Animations API).
 */
function settle(element: HTMLElement, fromPx: number): void {
  const toPx = element.offsetHeight;
  if (Math.abs(toPx - fromPx) < 1 || matches('(prefers-reduced-motion: reduce)')) return;
  element.animate(
    [
      { height: `${String(fromPx)}px`, maxHeight: 'none' },
      { height: `${String(toPx)}px`, maxHeight: 'none' },
    ],
    { duration: SHEET_MOVE_MS, easing: 'ease-out' },
  );
}

/**
 * The details of what's selected (ux.md §1), or for several selected items, a list of them.
 * Loaded on first selection, as its own chunk. A selected group (a new one, M4-T2) shows the
 * group's details and members, and a selected route (M4-T7) its waypoints.
 *
 * In wider windows, and on a phone held on its side, it's a panel on the right, about 380 px
 * wide, that collapses to its name. On a phone held upright it's a sheet along the bottom
 * that rests at three stops (state/details-sheet.ts, D-58): a card first, so a tap on the map
 * leaves the map in view, then half the screen, then all of it under the top bar.
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
  const sheetOpen = useSheet((state) => state.open !== null);
  // A sheet along the bottom on a phone held upright; a panel on the right otherwise.
  const slim = useLayoutTier() === 'slim';
  const short = useShort();
  const sheet = slim && !short;
  const stop = shownStop(
    useDetailsSheet((state) => state.stop),
    !sheet,
  );
  const [dragging, setDragging] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const cardHeightPx = useRef<number | null>(null);
  // The height to move from, set just before the stop changes.
  const fromHeightPx = useRef<number | null>(null);

  const changeStop = (next: DetailsStop) => {
    fromHeightPx.current = panel.current?.offsetHeight ?? null;
    useDetailsSheet.getState().setStop(next);
  };
  const drag = useDetailsDrag({
    sheet,
    stop,
    panel,
    cardHeightPx,
    onTap: () => {
      if (stop === 'card') changeStop('half');
    },
    onDragStart: () => {
      setDragging(true);
    },
    onDragMove: (heightPx) => {
      // Straight to the element: this runs on every move of the finger.
      panel.current?.style.setProperty('max-height', 'none');
      panel.current?.style.setProperty('height', `${String(heightPx)}px`);
    },
    onDragEnd: (rest, heightPx) => {
      // The finger's height gives way to the stop's own, reached by `settle`.
      panel.current?.style.removeProperty('height');
      panel.current?.style.removeProperty('max-height');
      setDragging(false);
      if (rest === 'close') {
        clear();
        return;
      }
      fromHeightPx.current = heightPx;
      useDetailsSheet.getState().setStop(rest);
    },
  });
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    if (sheet && stop === 'card' && !dragging) cardHeightPx.current = element.offsetHeight;
    const fromPx = fromHeightPx.current;
    fromHeightPx.current = null;
    if (fromPx !== null && sheet && !dragging) settle(element, fromPx);
  }, [stop, sheet, dragging]);
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
  /** A view's row for an id, whatever kind it is: what the card and the list name it by. */
  const rowOf = (id: string) =>
    objects.find((item) => item.id === id) ??
    groups.find((item) => item.id === id) ??
    routes.find((item) => item.id === id) ??
    pins.find((item) => item.id === id) ??
    people.find((item) => item.id === id) ??
    events?.find((item) => item.id === id);
  const onlyRow = single ? rowOf(onlyId) : undefined;
  // While the sheet is dragged up from the card, the details show under the strip already.
  const showsCard = stop === 'card' && !dragging;
  return (
    <SpoilerProvider>
      <aside
        ref={panel}
        aria-label="Details"
        data-tour="info-panel"
        data-slot={sheet ? 'details-sheet' : undefined}
        data-stop={stop}
        className={cn(
          // A phone upright: a sheet along the bottom, clear of the home bar. Wider windows,
          // and a phone on its side (short): a panel on the right.
          'absolute inset-x-0 bottom-0 flex flex-col rounded-t-lg border bg-card pb-[env(safe-area-inset-bottom)]',
          sheet && 'overflow-hidden',
          sheet && stop === 'half' && 'max-h-[50dvh]',
          sheet && stop === 'full' && UP_TO_BAR_HEIGHT,
          'md:inset-x-auto md:top-16 md:right-4 md:bottom-auto md:max-h-[calc(100%-5rem)] md:w-[380px] md:rounded-lg md:pb-0',
          'short:inset-x-auto short:top-16 short:right-[max(0.5rem,env(safe-area-inset-right))] short:bottom-auto short:max-h-[calc(100%-5rem)] short:w-[min(380px,60vw)] short:rounded-lg short:pb-0',
          // On a phone it steps aside while a sheet is open, and comes back when that closes:
          // hidden, not unmounted, so it keeps its place.
          sheetOpen && 'slim:hidden',
        )}
      >
        <DetailsStrip stop={stop} sheet={sheet} drag={drag} onStop={changeStop} onClose={clear}>
          {showsCard &&
            (single ? (
              <DetailsCard
                kind={kindOf(onlyId)}
                id={onlyId}
                universeId={universeId}
                fallbackName={onlyRow ? labelText(onlyRow, policy) : null}
                withSummary={sheet}
              />
            ) : (
              <SelectionCard count={selectedIds.length} />
            ))}
        </DetailsStrip>
        {!showsCard && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {single ? (
              <EntityPanel kind={kindOf(onlyId)} id={onlyId} universeId={universeId} />
            ) : (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold">{selectedIds.length} selected</h2>
                <ul className="flex flex-col gap-1 text-sm">
                  {selectedIds.map((id) => {
                    const row = rowOf(id);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className="text-left hover:text-primary"
                          onClick={() => {
                            select([id]);
                          }}
                        >
                          {row ? labelText(row, policy) : 'Unknown object'}
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
