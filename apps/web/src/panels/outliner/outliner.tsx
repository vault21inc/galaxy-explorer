import type { ViewGroup, ViewGroupType, ViewObject, ViewRoute } from '@ge/domain';
import { ChevronDown, ChevronRight, EyeOff, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { Button } from '@/components/ui/button.tsx';
import { isPrimaryModifier } from '@/input/bindings.ts';
import { detectPlatform } from '@/input/platform.ts';
import { cn } from '@/lib/utils.ts';
import { useSelection } from '@/state/selection.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { outlinerKey, type OutlinerTree } from './outliner-keys.ts';
import {
  ancestorsOf,
  openByDefault,
  outlinerRows,
  visibleRows,
  type OutlinerRow,
  type Person,
} from './outliner-tree.ts';

/**
 * The outliner (M3-T9, M4-T4, ux.md §1, §10): the current view as an ARIA tree, the keyboard
 * path to everything the canvas does. Layer › group type › group › nested groups and members,
 * then the objects in no group (outliner-tree.ts). The "Unplaced" section (places and events
 * without a location) fills in M6.
 *
 * - **Selection** is the canvas's, both ways: clicking or Space here selects there, and a
 *   canvas selection is opened to, highlighted and scrolled into view here. Groups select too.
 * - **Opening:** layers and group types start open, groups closed; the chevron, Right and Left,
 *   or Space on a layer or type row open and close them.
 * - **Filter:** a flat list of the groups and objects whose shown name matches.
 * - **Spoilers:** hidden ones show the same redaction bar as their 3D label, and the filter
 *   matches only what's shown, so it can't reveal a hidden name (ux.md §6).
 */
export function Outliner({
  objects,
  groups = [],
  groupTypes = [],
  routes = [],
  people = [],
  subject = null,
  emptyNote = null,
  onClose,
}: {
  objects: readonly ViewObject[];
  groups?: readonly ViewGroup[];
  groupTypes?: readonly ViewGroupType[];
  routes?: readonly ViewRoute[];
  /** The universe's characters (M6-T6). */
  people?: readonly Person[];
  /** A system or orbit view's subject, listed first so that it can be selected (M6). */
  subject?: ViewObject | null;
  /** What an empty view says, under the subject's row (view-panels.tsx). */
  emptyNote?: { title: string; hint: string } | null;
  /** View mode's List button opened it; edit mode shows it always. */
  onClose?: () => void;
}) {
  const filterId = useId();
  const policy = useSpoilerPolicy();
  const selectedIds = useSelection((state) => state.selectedIds);
  const [filter, setFilter] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  // Rows whose open state differs from their default (outliner-tree.ts).
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const all = useMemo(
    () => outlinerRows(objects, groups, groupTypes, policy, routes, people, subject),
    [objects, groups, groupTypes, policy, routes, people, subject],
  );
  const isOpen = (row: OutlinerRow) => openByDefault(row) !== toggled.has(row.key);
  const needle = filter.trim().toLowerCase();
  const rows: OutlinerRow[] = needle
    ? // Each match once, flat: an object in groups of two layers has a row in each.
      [
        ...new Map(
          all
            .filter(
              (row) => row.id !== null && !row.hidden && row.text.toLowerCase().includes(needle),
            )
            .map((row) => [row.id, { ...row, level: 1, parentKey: null, childCount: 0 }]),
        ).values(),
      ]
    : visibleRows(all, isOpen);
  const keys = rows.map((row) => row.key);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const selected = new Set(selectedIds);
  // The row that takes Tab: the focused one if still shown, else the first selected, else the
  // first (the roving tabindex of the ARIA tree pattern).
  const tabRow =
    (focused !== null && byKey.has(focused) ? focused : undefined) ??
    rows.find((row) => row.id !== null && selected.has(row.id))?.key ??
    keys[0] ??
    null;

  const setOpen = (key: string, open: boolean) => {
    const row = all.find((item) => item.key === key);
    if (!row) return;
    setToggled((current) => {
      const next = new Set(current);
      if (open === openByDefault(row)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // A selection made in the canvas opens the tree to its first row: done while rendering, when
  // the selection has changed (React's pattern for state that follows other state), so the
  // rows are open in the same render. The user may close them again afterwards.
  const last = selectedIds.at(-1);
  const [revealedFor, setRevealedFor] = useState<string | undefined>(undefined);
  if (last !== revealedFor) {
    setRevealedFor(last);
    const first = last === undefined ? undefined : all.find((row) => row.id === last);
    const closed = first
      ? ancestorsOf(all, first.key).flatMap((key) => {
          const row = all.find((item) => item.key === key);
          return row && !isOpen(row) ? [row] : [];
        })
      : [];
    if (closed.length > 0) {
      const next = new Set(toggled);
      for (const row of closed) {
        if (openByDefault(row)) next.delete(row.key);
        else next.add(row.key);
      }
      setToggled(next);
    }
  }
  // Then it scrolls into view, once the opened rows are in the page.
  const revealKey = last === undefined ? undefined : all.find((row) => row.id === last)?.key;
  useEffect(() => {
    if (revealKey === undefined) return;
    rowRefs.current.get(revealKey)?.scrollIntoView({ block: 'nearest' });
  }, [revealKey]);

  const focusRow = (key: string | null) => {
    setFocused(key);
    if (key) rowRefs.current.get(key)?.focus();
  };

  const tree: OutlinerTree = {
    parentOf: (key) => byKey.get(key)?.parentKey ?? null,
    openOf: (key) => {
      const row = byKey.get(key);
      return row && row.childCount > 0 && !needle ? isOpen(row) : null;
    },
    selectable: (key) => (byKey.get(key)?.id ?? null) !== null,
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = outlinerKey(
      keys,
      tabRow,
      {
        key: event.key,
        shift: event.shiftKey,
        primary: isPrimaryModifier(event, detectPlatform()),
      },
      tree,
    );
    if (!move) return;
    event.preventDefault();
    if (move.expand) setOpen(move.expand.row, move.expand.open);
    focusRow(move.focus);
    if (move.select) {
      const { ids: chosen, ...options } = move.select;
      // Rows to the entities they stand for.
      const ids = chosen.flatMap((key) => {
        const id = byKey.get(key)?.id;
        return id ? [id] : [];
      });
      useSelection.getState().select(ids, options);
    }
  };

  const onClick = (event: MouseEvent, row: OutlinerRow) => {
    setFocused(row.key);
    if (row.id === null) {
      setOpen(row.key, !isOpen(row));
      return;
    }
    const primary = isPrimaryModifier(event, detectPlatform());
    useSelection
      .getState()
      .select([row.id], primary ? { toggle: true } : event.shiftKey ? { add: true } : {});
  };

  return (
    <aside
      aria-label="Outliner"
      className="absolute top-16 left-4 flex max-h-[calc(100%-9rem)] w-64 flex-col rounded-lg border bg-card"
    >
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <label htmlFor={filterId} className="sr-only">
          Filter objects
        </label>
        <input
          id={filterId}
          type="search"
          placeholder="Filter"
          value={filter}
          className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:border-ring focus-visible:outline-none"
          onChange={(event) => {
            setFilter(event.currentTarget.value);
          }}
        />
        {onClose && (
          <Button variant="ghost" size="icon-sm" aria-label="Close the list" onClick={onClose}>
            <X aria-hidden />
          </Button>
        )}
      </div>
      <div className="overflow-y-auto p-1">
        {rows.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            {objects.length === 0 ? 'Nothing in this view yet.' : 'Nothing matches the filter.'}
          </p>
        ) : (
          <div
            role="tree"
            aria-label="Objects in this view"
            aria-multiselectable="true"
            className="flex flex-col"
            onKeyDown={onKeyDown}
          >
            {rows.map((row) => {
              const open = tree.openOf(row.key);
              const isSelected = row.id !== null && selected.has(row.id);
              return (
                <div
                  key={row.key}
                  ref={(element) => {
                    if (element) rowRefs.current.set(row.key, element);
                    else rowRefs.current.delete(row.key);
                  }}
                  role="treeitem"
                  aria-level={row.level}
                  aria-expanded={open ?? undefined}
                  aria-selected={isSelected}
                  // A hidden spoiler is named without its name; other rows are named by what
                  // they show (their name, badges and type), which axe checks match.
                  aria-label={
                    row.hidden
                      ? `Hidden potential spoiler, ${row.kind === 'object' || row.kind === 'subject' ? row.badge : row.kind}`
                      : undefined
                  }
                  tabIndex={row.key === tabRow ? 0 : -1}
                  className={cn(
                    'flex cursor-default items-center gap-1.5 rounded-md py-1 pr-2 text-sm outline-none select-none',
                    'hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected && 'bg-primary/20 hover:bg-primary/25',
                    row.kind === 'layer' && 'text-xs text-muted-foreground label-caps',
                    row.kind === 'type' && 'text-xs text-muted-foreground',
                    row.kind === 'subject' && 'font-medium',
                  )}
                  // Each level indents by 0.75rem; the chevron column keeps names aligned.
                  style={{ paddingLeft: `${(0.25 + (row.level - 1) * 0.75).toString()}rem` }}
                  onClick={(event) => {
                    onClick(event, row);
                  }}
                  onFocus={() => {
                    setFocused(row.key);
                  }}
                >
                  <span
                    aria-hidden
                    className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground"
                    onClick={(event) => {
                      // The chevron opens and closes a group without selecting it.
                      if (open === null || row.id === null) return;
                      event.stopPropagation();
                      setOpen(row.key, !open);
                    }}
                  >
                    {open === true && <ChevronDown className="size-3.5" />}
                    {open === false && <ChevronRight className="size-3.5" />}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      row.hidden && 'rounded-[2px] bg-foreground/80 text-transparent',
                    )}
                    aria-hidden={row.hidden}
                  >
                    {row.text}
                  </span>
                  {row.draft && (
                    <span className="rounded bg-secondary px-1 text-[10px] text-foreground">
                      Draft
                    </span>
                  )}
                  {row.spoiler && !row.hidden && (
                    <EyeOff
                      role="img"
                      aria-label="Potential spoiler"
                      className="size-3 text-muted-foreground"
                    />
                  )}
                  {row.badge && row.kind !== 'layer' && (
                    <span className="text-[10px] text-muted-foreground label-caps">
                      {row.badge}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {emptyNote && !needle && (
          <div className="p-2 text-sm">
            <p className="font-medium">{emptyNote.title}</p>
            <p className="text-muted-foreground">{emptyNote.hint}</p>
          </div>
        )}
        {/* Places and events without a location (data-model §11) are listed here from M6. */}
      </div>
    </aside>
  );
}
