import { isHidden, objectTypes, spoilerKeys, type ViewObject } from '@ge/domain';
import { EyeOff, X } from 'lucide-react';
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
import { labelText } from '@/render/labels/label-text.ts';
import { useSelection } from '@/state/selection.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { outlinerKey } from './outliner-keys.ts';

/** One row: an object as the outliner shows it. */
interface Row {
  id: string;
  /** What's shown: the name, or a redaction bar for a hidden spoiler (as the 3D labels do). */
  text: string;
  hidden: boolean;
  type: string;
  draft: boolean;
  spoiler: boolean;
}

/**
 * The outliner (M3-T9, ux.md §1, §10): the current view's objects as an ARIA tree, the keyboard
 * path to everything the canvas does. Flat until groups arrive in M4; the "Unplaced" section
 * (places and events without a location) fills in M6.
 *
 * - **Selection** is the canvas's, both ways: clicking or Space here selects there, and a
 *   canvas selection is highlighted and scrolled into view here.
 * - **Spoilers:** hidden ones show the same redaction bar as their 3D label, and the filter
 *   matches only what's shown, so it can't reveal a hidden name (ux.md §6).
 */
export function Outliner({
  objects,
  onClose,
}: {
  objects: readonly ViewObject[];
  /** View mode's List button opened it; edit mode shows it always. */
  onClose?: () => void;
}) {
  const filterId = useId();
  const policy = useSpoilerPolicy();
  const selectedIds = useSelection((state) => state.selectedIds);
  const [filter, setFilter] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const tree = useRef<HTMLDivElement>(null);

  const rows: Row[] = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return objects
      .map((object) => ({
        id: object.id,
        text: labelText(object, policy),
        hidden: isHidden(object.isSpoiler, spoilerKeys.record(object.id), policy),
        type: objectTypes[object.baseType].label,
        draft: object.status === 'draft',
        spoiler: object.isSpoiler || object.nameSpoiler,
      }))
      .filter((row) => !needle || (!row.hidden && row.text.toLowerCase().includes(needle)))
      .sort((a, b) => a.text.localeCompare(b.text));
  }, [objects, policy, filter]);
  const ids = rows.map((row) => row.id);
  const selected = new Set(selectedIds);
  // The row that takes Tab: the focused one if still shown, else the first selected, else the
  // first (the roving tabindex of the ARIA tree pattern).
  const tabRow =
    (focused !== null && ids.includes(focused) ? focused : undefined) ??
    ids.find((id) => selected.has(id)) ??
    ids[0] ??
    null;

  // A selection made in the canvas scrolls into view here.
  const last = selectedIds.at(-1);
  useEffect(() => {
    if (last) rowRefs.current.get(last)?.scrollIntoView({ block: 'nearest' });
  }, [last]);

  const focusRow = (id: string | null) => {
    setFocused(id);
    if (id) rowRefs.current.get(id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = outlinerKey(ids, tabRow, {
      key: event.key,
      shift: event.shiftKey,
      primary: isPrimaryModifier(event, detectPlatform()),
    });
    if (!move) return;
    event.preventDefault();
    focusRow(move.focus);
    if (move.select) {
      const { ids: chosen, ...options } = move.select;
      useSelection.getState().select(chosen, options);
    }
  };

  const onClick = (event: MouseEvent, id: string) => {
    setFocused(id);
    const primary = isPrimaryModifier(event, detectPlatform());
    useSelection
      .getState()
      .select([id], primary ? { toggle: true } : event.shiftKey ? { add: true } : {});
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
            ref={tree}
            role="tree"
            aria-label="Objects in this view"
            aria-multiselectable="true"
            className="flex flex-col"
            onKeyDown={onKeyDown}
          >
            {rows.map((row) => (
              <div
                key={row.id}
                ref={(element) => {
                  if (element) rowRefs.current.set(row.id, element);
                  else rowRefs.current.delete(row.id);
                }}
                role="treeitem"
                aria-level={1}
                aria-selected={selected.has(row.id)}
                // A hidden spoiler is named without its name; other rows are named by what they
                // show (their name, badges and type), which axe checks match.
                aria-label={row.hidden ? `Hidden potential spoiler, ${row.type}` : undefined}
                tabIndex={row.id === tabRow ? 0 : -1}
                className={cn(
                  'flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-sm outline-none select-none',
                  'hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring',
                  selected.has(row.id) && 'bg-primary/20 hover:bg-primary/25',
                )}
                onClick={(event) => {
                  onClick(event, row.id);
                }}
                onFocus={() => {
                  setFocused(row.id);
                }}
              >
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
                <span className="text-[10px] text-muted-foreground label-caps">{row.type}</span>
              </div>
            ))}
          </div>
        )}
        {/* Places and events without a location (data-model §11) are listed here from M6. */}
      </div>
    </aside>
  );
}
