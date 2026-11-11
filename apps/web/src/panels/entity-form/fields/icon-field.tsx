import { ICON_SET_LABELS, ICON_SETS, parseIconKey, type IconSet } from '@ge/domain';
import { useDeferredValue, useId, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import { iconDataUrl, useIconDrawings, useIconSearch } from '@/icons/use-icons.ts';
import { cn } from '@/lib/utils.ts';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { changesFor, valueAt } from '../field-path.ts';
import { FieldRow, INPUT_CLASS } from './field-row.tsx';

/** How many icons the picker shows at once: search narrows them. */
const RESULTS = 60;
/** The preview and grid icon sizes, CSS pixels. */
const PREVIEW_PX = 18;
const GRID_PX = 28;
/**
 * An `<img>` can't inherit the page's text color, so the icons are drawn in the dark theme's
 * foreground (the app has no light theme).
 */
const ICON_COLOR = '#e8eaed';

/**
 * The `icon` widget (M6-T4): an icon from the bundled sets, Lucide and game-icons.net (D-32),
 * shown beside its name. The button opens a picker: type to search both sets (every word must
 * match the icon's name), narrow to one set, and click an icon to save it.
 */
export function IconField({ field, record, title, save, compact }: FieldProps<PathFieldDef>) {
  const id = useId();
  const saved = valueAt(record, field.path);
  const key = typeof saved === 'string' ? saved : null;
  const [open, setOpen] = useState(false);
  const preview = useIconDrawings(key ? [key] : []).data?.get(key ?? '');
  const label = key ? parseIconKey(key).name : 'None';

  return (
    <FieldRow label={field.label} htmlFor={id} hint={field.hint} compact={compact}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            className={cn(INPUT_CLASS, 'flex items-center gap-1.5 text-left')}
            aria-label={`${field.label}: ${label}. Choose another`}
          >
            {preview ? (
              <img
                src={iconDataUrl(preview, ICON_COLOR, PREVIEW_PX)}
                alt=""
                className="size-4.5 shrink-0"
              />
            ) : (
              <span className="size-4.5 shrink-0" />
            )}
            <span className="truncate">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 p-2">
          {open && (
            <IconPicker
              label={field.label}
              chosen={key}
              onChoose={(next) => {
                setOpen(false);
                if (next !== key) {
                  void save(
                    changesFor(record, field.path, next),
                    editDescription(title, field.label),
                  );
                }
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    </FieldRow>
  );
}

function IconPicker({
  label,
  chosen,
  onChoose,
}: {
  label: string;
  chosen: string | null;
  onChoose: (key: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [set, setSet] = useState<IconSet | null>(null);
  // Typing stays quick: the search follows a moment behind.
  const deferred = useDeferredValue(query);
  const results = useIconSearch(deferred, set, RESULTS).data ?? [];
  const drawings = useIconDrawings(results.map((icon) => icon.key)).data;

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={`Choose ${label.toLowerCase()}`}>
      <input
        autoFocus
        type="search"
        value={query}
        placeholder="Search icons: skull, sword, ship…"
        aria-label="Search icons"
        className={INPUT_CLASS}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
        }}
      />
      <div className="flex gap-1 text-xs" role="radiogroup" aria-label="Icon set">
        {[null, ...ICON_SETS].map((option) => (
          <button
            key={option ?? 'all'}
            type="button"
            role="radio"
            aria-checked={set === option}
            className={cn(
              'rounded px-2 py-0.5 text-muted-foreground hover:text-foreground',
              set === option && 'bg-accent text-foreground',
            )}
            onClick={() => {
              setSet(option);
            }}
          >
            {option ? ICON_SET_LABELS[option] : 'Both sets'}
          </button>
        ))}
      </div>
      <div
        className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto"
        role="listbox"
        aria-label="Icons"
      >
        {results.map((icon) => {
          const drawing = drawings?.get(icon.key);
          return (
            <button
              key={icon.key}
              type="button"
              role="option"
              aria-selected={icon.key === chosen}
              aria-label={`${icon.name} (${ICON_SET_LABELS[icon.set]})`}
              title={`${icon.name} · ${ICON_SET_LABELS[icon.set]}`}
              className={cn(
                'flex aspect-square items-center justify-center rounded hover:bg-accent',
                icon.key === chosen && 'ring-1 ring-primary',
              )}
              onClick={() => {
                onChoose(icon.key);
              }}
            >
              {drawing && (
                <img src={iconDataUrl(drawing, ICON_COLOR, GRID_PX)} alt="" className="size-6" />
              )}
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="col-span-8 py-4 text-center text-xs text-muted-foreground">
            No icons match.
          </p>
        )}
      </div>
    </div>
  );
}
