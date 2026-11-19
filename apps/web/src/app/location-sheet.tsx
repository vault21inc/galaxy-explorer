import { ArrowUp, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router';
import { SHEET_ROW } from '@/components/ui/sheet.tsx';
import { cn } from '@/lib/utils.ts';
import { useSheet } from '@/state/sheet.ts';
import { viewNavigation } from '@/state/view-navigator.ts';
import { CloneMapDialog } from './clone-map-dialog.tsx';
import type { SwitcherOption } from './switcher.tsx';
import { useCrumbs } from './use-crumbs.ts';
import type { UniverseBar } from './use-universe-bar.ts';

/**
 * The location sheet of the slim bar (docs/plan/later/phone-usability.md, "The slim bar"):
 * where the reader is, as a list that leads back up, then the map and universe switchers, as
 * the full bar's breadcrumbs and switchers have them.
 */
export function LocationSheet({ bar }: { bar: UniverseBar }) {
  const { universeSlug = '' } = useParams();
  const close = useSheet((state) => state.close);
  const [cloning, setCloning] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {bar.map && <Path universeSlug={universeSlug} mapSlug={bar.map.slug} mapId={bar.map.id} />}
      {bar.maps.length > 0 && (
        <Choice
          heading="Map"
          current={bar.mapName}
          value={bar.map?.slug ?? ''}
          options={bar.mapOptions}
          onSelect={(slug) => {
            close();
            bar.selectMap(slug);
          }}
        >
          {bar.canClone && (
            <button
              type="button"
              className={SHEET_ROW}
              onClick={() => {
                setCloning(true);
              }}
            >
              Clone map as…
            </button>
          )}
        </Choice>
      )}
      <Choice
        heading="Universe"
        tourName="universe-switcher"
        current={bar.universeName}
        value={bar.universe.slug}
        options={bar.universeOptions}
        onSelect={(slug) => {
          close();
          bar.selectUniverse(slug);
        }}
      >
        <Link to={`/u/${bar.universe.slug}/settings`} className={SHEET_ROW} onClick={close}>
          Universe settings
        </Link>
        <Link to="/universes" className={SHEET_ROW} onClick={close}>
          All universes
        </Link>
      </Choice>
      {bar.map && (
        <CloneMapDialog
          open={cloning}
          onClose={() => {
            setCloning(false);
          }}
          universeId={bar.universe.id}
          universeSlug={universeSlug}
          map={bar.map}
        />
      )}
    </div>
  );
}

/** "You are here": the open views from the galaxy down, each a way back up but the last. */
function Path({
  universeSlug,
  mapSlug,
  mapId,
}: {
  universeSlug: string;
  mapSlug: string;
  mapId: string;
}) {
  const crumbs = useCrumbs(universeSlug, mapSlug, mapId);
  const close = useSheet((state) => state.close);
  return (
    <nav aria-label="Breadcrumbs" data-tour="breadcrumbs">
      <h3 className="px-3 pb-1 text-xs text-muted-foreground label-caps">You are here</h3>
      <ol className="flex flex-col">
        {crumbs.map((crumb, index) => (
          <li key={crumb.key} style={{ paddingLeft: `${String(index * 12)}px` }}>
            {crumb.current ? (
              <span
                aria-current="page"
                className={cn(SHEET_ROW, 'font-medium hover:bg-transparent')}
              >
                <Check aria-hidden className="size-4 text-primary" />
                {crumb.text}
              </span>
            ) : (
              <Link
                to={crumb.href}
                className={SHEET_ROW}
                onClick={(event: MouseEvent) => {
                  close();
                  // The parent goes up the way Esc does, back through history when it can.
                  if (!crumb.parent) return;
                  event.preventDefault();
                  viewNavigation.exit();
                }}
              >
                <ArrowUp aria-hidden className="size-4 text-muted-foreground" />
                {crumb.text}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A switcher as a row that unfolds its choices in place, with links under them. */
function Choice({
  heading,
  current,
  value,
  options,
  onSelect,
  tourName,
  children,
}: {
  heading: string;
  current: string;
  value: string;
  options: readonly SwitcherOption[];
  onSelect: (value: string) => void;
  tourName?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label={heading}>
      <h3 className="px-3 pb-1 text-xs text-muted-foreground label-caps">{heading}</h3>
      <button
        type="button"
        className={SHEET_ROW}
        aria-expanded={open}
        data-tour={tourName}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className="sr-only">{heading}: </span>
        <span className="flex-1 truncate">{current}</span>
        {open ? (
          <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <ul aria-label={`${heading}s`} className="flex flex-col pl-3">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                className={SHEET_ROW}
                aria-current={option.value === value ? 'true' : undefined}
                onClick={() => {
                  onSelect(option.value);
                }}
              >
                <Check
                  aria-hidden
                  className={cn('size-4 text-primary', option.value !== value && 'invisible')}
                />
                <span className="truncate">{option.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}
