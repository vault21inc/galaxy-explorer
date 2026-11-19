import { ChevronDown, Menu, Search } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button.tsx';
import { usePalette } from '@/state/palette.ts';
import { useSheet } from '@/state/sheet.ts';
import { SlimSheets } from './slim-sheets.tsx';
import { useCrumbs } from './use-crumbs.ts';
import { useUniverseBar, type UniverseBar } from './use-universe-bar.ts';

/**
 * The top bar on the slim tier: a phone, upright or on its side (docs/plan/later/
 * phone-usability.md, "The slim bar"). One row of four 44 px controls: the mark, which goes
 * home; the location chip, naming where the reader is and opening the way around; Search; and
 * More, for everything else. Its sheets open from the bottom (from the right when short).
 */
export function SlimBar({ universeSlug }: { universeSlug: string | undefined }) {
  const show = useSheet((state) => state.show);
  // Each control opens its sheet in place of one that's open, or closes it (components/ui/
  // sheet.tsx leaves taps on the bar to them).
  const close = useSheet((state) => state.close);
  return (
    <>
      <Link
        to="/"
        aria-label="Galaxy Explorer, home"
        className="pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-md border bg-card text-primary"
        onClick={close}
      >
        <span aria-hidden>◈</span>
      </Link>
      {universeSlug !== undefined ? (
        <LocationChip universeSlug={universeSlug} />
      ) : (
        <span className="flex-1" />
      )}
      {universeSlug !== undefined && (
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Search"
          data-tour="search"
          className="pointer-events-auto size-11 shrink-0 bg-card"
          onClick={() => {
            close();
            usePalette.getState().setOpen(true);
          }}
        >
          <Search aria-hidden />
        </Button>
      )}
      <Button
        variant="outline"
        size="icon-lg"
        aria-label="More"
        data-tour="more"
        className="pointer-events-auto size-11 shrink-0 bg-card"
        onClick={() => {
          show('more');
        }}
      >
        <Menu aria-hidden />
      </Button>
      <SlimSheets universeSlug={universeSlug} />
    </>
  );
}

/**
 * Where the reader is, in one control: the view's name (a system's or a planet's), the map's
 * in the galaxy view, or the universe's when no map is open. It opens the location sheet.
 */
function LocationChip({ universeSlug }: { universeSlug: string }) {
  const bar = useUniverseBar(universeSlug);
  const show = useSheet((state) => state.show);
  if (!bar) return <span className="flex-1" />;
  return (
    <Button
      variant="outline"
      data-tour="location"
      className="pointer-events-auto h-11 min-w-0 flex-1 justify-between bg-card px-3"
      onClick={() => {
        show('location');
      }}
    >
      <span className="sr-only">Where you are: </span>
      <span className="truncate">{bar.map ? <ViewName bar={bar} /> : bar.universeName}</span>
      <ChevronDown aria-hidden className="text-muted-foreground" />
    </Button>
  );
}

function ViewName({ bar }: { bar: UniverseBar }) {
  // Only rendered with a map (LocationChip); the hook needs its slug and id.
  const crumbs = useCrumbs(bar.universe.slug, bar.map?.slug ?? '', bar.map?.id ?? '');
  const current = crumbs.at(-1);
  return <>{!current || current.level === 'galaxy' ? bar.mapName : current.text}</>;
}
