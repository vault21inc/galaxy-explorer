import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils.ts';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';

/** One choice in the list: an existing entry, or "Create “…”" (`create`). */
export interface PickerOption {
  key: string;
  text: string;
  /** Muted after the text, such as the entry's kind. */
  detail?: string;
  create?: boolean;
}

/**
 * The search-as-you-type combobox the entity pickers share (ux.md §10): the caller turns the
 * typed words into options; ↑ and ↓ move through them, Enter picks, Esc closes the list (not
 * the panel). Picking clears the input.
 */
export function PickerCombobox({
  label,
  placeholder,
  query,
  onQuery,
  options,
  onChoose,
}: {
  label: string;
  placeholder: string;
  query: string;
  onQuery: (query: string) => void;
  options: readonly PickerOption[];
  onChoose: (option: PickerOption) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const shown = open && query.trim() !== '' && options.length > 0;
  // The list is in the panel's flow (a floating one would be clipped by the panel's scrolling),
  // so it's scrolled into view when it opens below the panel's fold.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (shown) listRef.current?.scrollIntoView({ block: 'nearest' });
  }, [shown]);
  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChoose(option);
    onQuery('');
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
      choose(Math.min(active, options.length - 1));
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
        placeholder={placeholder}
        className={INPUT_CLASS}
        value={query}
        onChange={(event) => {
          onQuery(event.currentTarget.value);
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
                option.create && 'text-primary',
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
              {option.detail && (
                <span className="text-xs text-muted-foreground"> · {option.detail}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
