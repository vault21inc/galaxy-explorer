import { entityKinds, type EntityKind } from '@ge/domain';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useEntityList } from '@/api/hooks.ts';
import { cn } from '@/lib/utils.ts';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';

/** How many matches the picker lists. */
const MATCHES = 8;

export type PickerScope = { universeId: string } | { mapId: string };

/**
 * A search-or-create combobox for one entity kind (M6-T6, ux.md §10): typing searches the kind
 * in `scope` by name (the list endpoint's `q`), and "Create “…”" is offered when no match has
 * exactly that name. ↑ and ↓ move through the options, Enter picks, Esc closes. Used for an
 * event's people (characters in the universe) and a character's events (events in the map).
 */
export function EntityPicker({
  kind,
  scope,
  exclude,
  label,
  onPick,
  onCreate,
}: {
  kind: EntityKind;
  scope: PickerScope | undefined;
  /** Already related: not offered again. */
  exclude: ReadonlySet<string>;
  label: string;
  onPick: (entity: { id: string; namePlain: string }) => void;
  onCreate: (name: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const needle = query.trim();
  // The scope's shape follows the kind, which is only known at run time here.
  const list = useEntityList(kind, (needle === '' ? undefined : scope) as never, {
    q: needle,
    limit: MATCHES + exclude.size,
  });
  const matches = (list.data?.data ?? [])
    .filter((entity) => !exclude.has(entity.id))
    .slice(0, MATCHES);
  const exact = matches.some((entity) => entity.namePlain.toLowerCase() === needle.toLowerCase());
  const options = [
    ...matches.map((entity) => ({ key: entity.id, text: entity.namePlain, entity })),
    ...(needle !== '' && !exact
      ? [{ key: 'create', text: `Create “${needle}”`, entity: null }]
      : []),
  ];
  const shown = open && needle !== '' && options.length > 0;
  // The list is in the panel's flow (a floating one would be clipped by the panel's scrolling),
  // so it's scrolled into view when it opens below the panel's fold.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (shown) listRef.current?.scrollIntoView({ block: 'nearest' });
  }, [shown]);
  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (option.entity) onPick(option.entity);
    else onCreate(needle);
    setQuery('');
    setActive(0);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + options.length) % Math.max(options.length, 1));
    } else if (event.key === 'Enter' && shown) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape' && shown) {
      // Closes the list without closing the panel.
      event.stopPropagation();
      setOpen(false);
    }
  };
  const listId = `${id}-options`;
  return (
    <div>
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown ? `${id}-${active.toString()}` : undefined}
        placeholder={`Add ${entityKinds[kind].label.one.toLowerCase()}…`}
        className={INPUT_CLASS}
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
        }}
        onKeyDown={onKeyDown}
      />
      {shown && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={`${label}: matches`}
          className="mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          {options.map((option, index) => (
            <li
              key={option.key}
              id={`${id}-${index.toString()}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                'cursor-pointer rounded px-2 py-1',
                index === active && 'bg-accent text-accent-foreground',
                !option.entity && 'text-primary',
              )}
              // Before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
              onMouseEnter={() => {
                setActive(index);
              }}
            >
              {option.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
