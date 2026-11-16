import { CalendarDays } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useConfigList, useEventList } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { useUniverseRoute } from '@/app/use-universe-route.ts';
import { Button } from '@/components/ui/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import { iconDataUrl, useIconDrawings } from '@/icons/use-icons.ts';
import { cn } from '@/lib/utils.ts';
import { REDACTION_COLOR } from '@/render/tuning.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { viewNavigation } from '@/state/view-navigator.ts';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';
import { goToLocated } from '../relations/shown-where.ts';
import { eventRows, type CategoryFilter, type EventRow } from './event-rows.ts';

/** The category icons' size in the list, in CSS pixels. */
const ICON_PX = 16;

/**
 * The Events panel (M6-T7, ux.md §1): the current map's events in date order, from the top
 * bar. Each row shows its date, its category's icon and where it is ("Gudrun › Gudrun I");
 * it can be narrowed by category and by text. Choosing one goes through the views to its pin
 * or marker and selects it (relations/shown-where.ts); one that's nowhere yet ("No location")
 * opens its panel in the galaxy view. Spoilers are blacked out as everywhere (event-rows.ts).
 */
export function EventsPopover() {
  const id = useId();
  const { universeSlug = '', mapSlug } = useParams();
  const route = useUniverseRoute(universeSlug, mapSlug);
  const mapId = route.status === 'ready' ? route.map?.id : undefined;
  const universeId = route.status === 'ready' ? route.universe.id : undefined;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const policy = useSpoilerPolicy();
  const readOptions = useReadOptions();
  // Loaded once the panel is first opened, then kept fresh by the writes that change it.
  const list = useEventList(open ? mapId : undefined, readOptions);
  const categories = useConfigList('event_categories', universeId).data;
  const rows = useMemo(
    () => eventRows(list.data?.events ?? [], categories ?? [], policy, { text, category }),
    [list.data, categories, policy, text, category],
  );
  const drawings = useIconDrawings(rows.flatMap((row) => (row.icon ? [row.icon] : []))).data;

  const choose = (row: EventRow) => {
    setOpen(false);
    if (row.located) void goToLocated(row.id, mapId ?? null);
    else viewNavigation.show(null, { select: row.id });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="pointer-events-auto gap-1.5"
          data-tour="events"
        >
          <CalendarDays aria-hidden />
          Events
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Events"
        className="flex max-h-[70vh] w-96 flex-col gap-2 text-sm"
      >
        <div className="flex gap-2">
          <input
            type="search"
            aria-label="Filter events"
            placeholder="Filter by name, date or place"
            className={cn(INPUT_CLASS, 'flex-1')}
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
          />
          <select
            id={`${id}-category`}
            aria-label="Category"
            className={cn(INPUT_CLASS, 'w-32')}
            value={category}
            onChange={(event) => {
              setCategory(event.currentTarget.value);
            }}
          >
            <option value="all">All categories</option>
            {(categories ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value="none">No category</option>
          </select>
        </div>
        {list.isPending ? (
          <p role="status" className="text-muted-foreground">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">
            {(list.data?.events.length ?? 0) === 0 ? 'No events on this map yet.' : 'No matches.'}
          </p>
        ) : (
          <ul aria-label="Events in date order" className="-mx-1 overflow-y-auto">
            {rows.map((row) => {
              const drawing = row.icon ? drawings?.get(row.icon) : undefined;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-start gap-2 rounded px-1 py-1.5 text-left hover:bg-accent',
                      row.draft && 'opacity-60',
                    )}
                    onClick={() => {
                      choose(row);
                    }}
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: row.icon ? row.color : REDACTION_COLOR }}
                    >
                      {drawing ? (
                        <img
                          src={iconDataUrl(drawing, '#ffffff', ICON_PX - 4)}
                          alt=""
                          className="size-3"
                        />
                      ) : (
                        !row.icon && <span className="text-[10px] text-white">?</span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-medium">{row.name}</span>
                        {row.date && (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {row.date}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{row.where}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
