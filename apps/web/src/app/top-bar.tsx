import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useUniverses } from '@/api/containers.ts';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu.tsx';
import { containerName } from '@/lib/container-name.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { QualityPopover } from './quality-popover.tsx';
import { EditToggle } from './edit-toggle.tsx';
import { SpoilerToggle } from './spoiler-toggle.tsx';
import { Switcher } from './switcher.tsx';
import { useUniverseRoute } from './use-universe-route.ts';

/**
 * The top bar (ux.md §1): the app's name, the universe and map switchers, the breadcrumbs and
 * the edit toggle (on a map), the spoiler toggle and the settings. M7 adds search.
 */
export function TopBar() {
  const { universeSlug, mapSlug } = useParams();
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-4 py-3">
      <Link
        to="/"
        className="pointer-events-auto mr-2 text-sm font-semibold label-caps text-foreground"
      >
        <span aria-hidden className="mr-1.5 text-primary">
          ◈
        </span>
        Galaxy Explorer
      </Link>
      {universeSlug !== undefined && <UniverseControls universeSlug={universeSlug} />}
      <div className="ml-auto flex items-center gap-1">
        {mapSlug !== undefined && <EditToggle />}
        <SpoilerToggle />
        <QualityPopover />
      </div>
    </header>
  );
}

function UniverseControls({ universeSlug }: { universeSlug: string }) {
  const { mapSlug } = useParams();
  const navigate = useNavigate();
  const keep = useKeptParams();
  const universes = useUniverses();
  const policy = useSpoilerPolicy();
  // Resolved without the map, so a mistyped map slug still shows the switchers to recover.
  const route = useUniverseRoute(universeSlug);
  if (route.status !== 'ready') return null;

  const map = route.maps.find((item) => item.slug === mapSlug);
  return (
    <>
      <Switcher
        label="Universe"
        value={route.universe.slug}
        current={containerName(route.universe, policy)}
        options={(universes.data ?? []).map((item) => ({
          value: item.slug,
          label: containerName(item, policy),
        }))}
        onSelect={(slug) => void navigate(`/u/${slug}${keep}`)}
        footer={
          <DropdownMenuItem asChild>
            <Link to="/">All universes</Link>
          </DropdownMenuItem>
        }
      />
      {route.maps.length > 0 && (
        <Switcher
          label="Map"
          value={map?.slug ?? ''}
          current={map ? containerName(map, policy) : 'Choose a map'}
          options={route.maps.map((item) => ({
            value: item.slug,
            label: containerName(item, policy),
          }))}
          onSelect={(slug) => void navigate(`/u/${universeSlug}/${slug}${keep}`)}
        />
      )}
      {map && (
        <>
          {/* The current view's ancestors; the system and orbit views (M5) add their own. */}
          <nav aria-label="Breadcrumbs" className="ml-2 text-sm text-muted-foreground">
            <ol className="flex items-center gap-1.5">
              <li aria-current="page" className="text-foreground">
                Galaxy
              </li>
            </ol>
          </nav>
        </>
      )}
    </>
  );
}

/**
 * Query parameters that follow the reader to another universe or map: only `perf`, the
 * development HUD. The selection (`select`) belongs to the map it was made on.
 */
function useKeptParams(): string {
  const [searchParams] = useSearchParams();
  const perf = searchParams.get('perf');
  return perf === null ? '' : `?perf=${encodeURIComponent(perf)}`;
}
