import { entityKinds } from '@ge/domain';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useSearch, type SearchResult } from '@/api/search.ts';
import { useUniverseRoute } from '@/app/use-universe-route.ts';
import { useCanEdit } from '@/editor/use-can-edit.ts';
import { containerName } from '@/lib/container-name.ts';
import { cn } from '@/lib/utils.ts';
import { useEditor } from '@/state/editor.ts';
import { showEntity } from '@/state/show-entity.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { hasViewNavigator, viewPath } from '@/state/view-navigator.ts';
import { commandMatches, paletteCommands, type PaletteCommand } from './palette-commands.ts';
import { KEPT_PARAMS, keptSearch } from '@/lib/kept-params.ts';
import { readableSearch } from '@/lib/camera-param.ts';
import { withCapture } from '@/lib/capture-params.ts';
import { useCapture } from '@/state/capture.ts';

/** How long typing pauses before the words are searched. */
const SEARCH_DELAY_MS = 150;

type Item =
  | { type: 'result'; id: string; result: SearchResult }
  | { type: 'command'; id: string; command: PaletteCommand };

/**
 * The palette's input and list: an ARIA combobox, so the arrow keys move through results and
 * commands as one list while focus stays in the input, and Enter runs the active one.
 */
export function PaletteBody({ onDone }: { onDone: () => void }) {
  const listId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const capture = useCapture((state) => state.aspect?.id ?? null);
  const { universeSlug, mapSlug } = useParams();
  const route = useUniverseRoute(universeSlug ?? '');
  const ready = universeSlug !== undefined && route.status === 'ready' ? route : null;
  const policy = useSpoilerPolicy();
  const editing = useEditor((state) => state.editing);
  const canEdit = useCanEdit();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearched(query);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  // Search as the reader sees: hidden spoilers stay hidden (ux.md §6); edit mode shows all.
  const search = useSearch(ready?.universe.id, searched, {
    spoilers: policy.showAll ? 'include' : 'exclude',
    includeDrafts: editing,
  });
  const commands = paletteCommands({
    universeSlug,
    mapSlug,
    maps: (ready?.maps ?? []).map((map) => ({ slug: map.slug, label: containerName(map, policy) })),
    canEdit,
    editing,
    showAll: policy.showAll,
    capture,
    // Capture mode is in the address (lib/capture-params.ts); turning it on doesn't add history.
    setCapture: (aspect) => {
      const search = readableSearch(withCapture(new URLSearchParams(location.search), aspect));
      void navigate({ search }, { replace: true, state: location.state as unknown });
    },
    // A share link's key stays in the address within its universe (M8-T12), as between views.
    navigate: (path) => {
      const within = universeSlug !== undefined && path.startsWith(`/u/${universeSlug}/`);
      void navigate(`${path}${keptSearch(location.search, {}, within ? KEPT_PARAMS : ['perf'])}`);
    },
  }).filter((command) => commandMatches(command.label, query));
  const results = query.trim() === '' ? [] : (search.data ?? []);
  const items: Item[] = [
    ...results.map((result) => ({ type: 'result' as const, id: result.id, result })),
    ...commands.map((command) => ({ type: 'command' as const, id: command.id, command })),
  ];
  const current = Math.min(active, Math.max(items.length - 1, 0));

  const run = (item: Item | undefined) => {
    if (!item) return;
    onDone();
    if (item.type === 'command') {
      item.command.run();
      return;
    }
    const { result } = item;
    if (hasViewNavigator()) {
      showEntity(result);
      return;
    }
    // Off a map page (the settings, the universe page): open the result's map at it.
    const map = ready?.maps.find((item2) => item2.id === result.mapId) ?? ready?.maps[0];
    if (!universeSlug || !map) return;
    const subject = result.kind === 'celestial_object' ? result.parentId : null;
    void navigate(
      `${viewPath(universeSlug, map.slug, subject)}${keptSearch(location.search, { select: result.id })}`,
    );
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && items.length > 0) {
      event.preventDefault();
      setActive((current + step + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(items[current]);
    }
  };

  const optionId = (index: number) => `${listId}-${String(index)}`;
  return (
    <div className="flex flex-col">
      <input
        role="combobox"
        aria-label="Search or run a command"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={items.length > 0 ? optionId(current) : undefined}
        autoFocus
        placeholder={ready ? 'Search this universe, or type a command…' : 'Type a command…'}
        className="h-12 border-b bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Results and commands"
        className="max-h-96 overflow-y-auto p-1"
      >
        {items.map((item, index) => (
          <li
            key={`${item.type}:${item.id}`}
            id={optionId(index)}
            role="option"
            aria-selected={index === current}
            className={cn(
              'flex cursor-pointer flex-col rounded-md px-3 py-1.5 text-sm',
              index === current && 'bg-accent text-accent-foreground',
            )}
            onMouseMove={() => {
              if (index !== current) setActive(index);
            }}
            onClick={() => {
              run(item);
            }}
          >
            {item.type === 'result' ? <ResultRow result={item.result} /> : item.command.label}
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            {search.isFetching ? 'Searching…' : 'Nothing matches.'}
          </li>
        )}
      </ul>
    </div>
  );
}

function ResultRow({ result }: { result: SearchResult }) {
  return (
    <>
      <span className="flex items-baseline gap-2">
        <span className="font-medium">{result.name}</span>
        <span className="text-xs text-muted-foreground">
          {entityKinds[result.kind].label.one}
          {result.path.length > 0 && ` · ${result.path.join(' › ')}`}
        </span>
      </span>
      {result.snippet !== '' && (
        <span className="truncate text-xs text-muted-foreground">{result.snippet}</span>
      )}
    </>
  );
}
