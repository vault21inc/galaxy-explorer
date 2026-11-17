import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useUniverses } from '@/api/containers.ts';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu.tsx';
import { containerName } from '@/lib/container-name.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { EventsPopover } from '@/panels/events-list/events-popover.tsx';
import { LayersPopover } from '@/panels/layers/layers-popover.tsx';
import { ShortcutHelp } from '@/panels/shortcut-help/shortcut-help.tsx';
import { HelpMenu } from '@/help/help-menu.tsx';
import { CommandPalette } from '@/palette/command-palette.tsx';
import { PaletteButton } from '@/palette/palette-button.tsx';
import { useCanEdit } from '@/editor/use-can-edit.ts';
import { AccountMenu } from './account-menu.tsx';
import { Breadcrumbs } from './breadcrumbs.tsx';
import { CloneMapDialog } from './clone-map-dialog.tsx';
import { QualityPopover } from './quality-popover.tsx';
import { EditToggle } from './edit-toggle.tsx';
import { SpoilerToggle } from './spoiler-toggle.tsx';
import { Switcher } from './switcher.tsx';
import { useUniverseRoute } from './use-universe-route.ts';
import { keptSearch } from '@/lib/kept-params.ts';
import { useNoIndex } from './use-no-index.ts';

/**
 * The top bar (ux.md §1): the app's name, the universe and map switchers, the breadcrumbs and
 * the edit toggle, the events list (M6-T7) and the layers (on a map), the spoiler toggle, the Help
 * menu (shortcuts, M4-T9; tours, M8-T10) and the settings,
 * search with the command palette (M7-T6), and the account menu (M8-T1).
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
        {universeSlug !== undefined && <PaletteButton />}
        {mapSlug !== undefined && <EditToggle />}
        {mapSlug !== undefined && <EventsPopover />}
        {mapSlug !== undefined && <LayersPopover />}
        <SpoilerToggle />
        <HelpMenu />
        <ShortcutHelp />
        <QualityPopover />
        <AccountMenu />
      </div>
      <CommandPalette />
    </header>
  );
}

function UniverseControls({ universeSlug }: { universeSlug: string }) {
  const { mapSlug } = useParams();
  const navigate = useNavigate();
  const keep = useKeptParams();
  const universes = useUniverses();
  const policy = useSpoilerPolicy();
  const canEdit = useCanEdit();
  const [cloning, setCloning] = useState(false);
  // Resolved without the map, so a mistyped map slug still shows the switchers to recover.
  const route = useUniverseRoute(universeSlug);
  useNoIndex(route.status === 'ready' && route.universe.visibility !== 'public');
  // Another universe gets `perf` only: a share link's key is this universe's.
  const keepAcross = keptSearch(useLocation().search, {}, ['perf']);
  if (route.status !== 'ready') return null;

  const map = route.maps.find((item) => item.slug === mapSlug);
  return (
    <>
      <Switcher
        label="Universe"
        tourName="universe-switcher"
        value={route.universe.slug}
        current={containerName(route.universe, policy)}
        options={(universes.data ?? []).map((item) => ({
          value: item.slug,
          label: containerName(item, policy),
        }))}
        onSelect={(slug) => void navigate(`/u/${slug}${keepAcross}`)}
        footer={
          <>
            <DropdownMenuItem asChild>
              <Link to={`/u/${route.universe.slug}/settings`}>Universe settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/universes">All universes</Link>
            </DropdownMenuItem>
          </>
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
          footer={
            canEdit && map ? (
              // A copy of this map for another era (M7-T5).
              <DropdownMenuItem
                onSelect={() => {
                  setCloning(true);
                }}
              >
                Clone map as…
              </DropdownMenuItem>
            ) : undefined
          }
        />
      )}
      {map && (
        <CloneMapDialog
          open={cloning}
          onClose={() => {
            setCloning(false);
          }}
          universeId={route.universe.id}
          universeSlug={universeSlug}
          map={map}
        />
      )}
      {map && <Breadcrumbs universeSlug={universeSlug} mapSlug={map.slug} mapId={map.id} />}
    </>
  );
}

/** Query parameters that follow the reader to another map: `perf` and a share link's `k`. */
function useKeptParams(): string {
  const [searchParams] = useSearchParams();
  return keptSearch(searchParams.toString());
}
