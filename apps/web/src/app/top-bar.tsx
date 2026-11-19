import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu.tsx';
import { EventsPopover } from '@/panels/events-list/events-popover.tsx';
import { LayersPopover } from '@/panels/layers/layers-popover.tsx';
import { ShortcutHelp } from '@/panels/shortcut-help/shortcut-help.tsx';
import { HelpMenu } from '@/help/help-menu.tsx';
import { useLayoutTier } from '@/lib/layout-tier.ts';
import { CommandPalette } from '@/palette/command-palette.tsx';
import { PaletteButton } from '@/palette/palette-button.tsx';
import { AccountMenu } from './account-menu.tsx';
import { BAR_TEXT } from './bar-classes.ts';
import { Breadcrumbs } from './breadcrumbs.tsx';
import { CloneMapDialog } from './clone-map-dialog.tsx';
import { EditAvailability, EditToggle } from './edit-toggle.tsx';
import { QualityPopover } from './quality-popover.tsx';
import { SlimBar } from './slim-bar.tsx';
import { SpoilerToggle } from './spoiler-toggle.tsx';
import { Switcher } from './switcher.tsx';
import { useNoIndex } from './use-no-index.ts';
import { useUniverseBar } from './use-universe-bar.ts';
import { useUniverseRoute } from './use-universe-route.ts';

/**
 * The top bar (ux.md §1): the app's name, the universe and map switchers, the breadcrumbs and
 * the edit toggle, the events list (M6-T7) and the layers (on a map), the spoiler toggle, the Help
 * menu (shortcuts, M4-T9; tours, M8-T10) and the settings,
 * search with the command palette (M7-T6), and the account menu (M8-T1).
 *
 * On a phone (the slim tier, lib/layout-tier.ts) it's the slim bar instead (app/slim-bar.tsx):
 * different markup, not the same hidden, so no control or tour mark is on the page twice. What
 * isn't drawn (the palette, the shortcut help, whether editing is offered) is mounted at every
 * width.
 */
export function TopBar() {
  const { universeSlug, mapSlug } = useParams();
  const slim = useLayoutTier() === 'slim';
  return (
    // One row that never wraps: the left part (switchers, breadcrumbs) truncates to make room,
    // and the right-hand buttons keep their size (phone-usability.md, "Tiers"). It clears the
    // notch and rounded corners once the page reaches under them (`viewport-fit=cover`).
    <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-3 pl-[max(1rem,env(safe-area-inset-left))] slim:pr-[max(0.5rem,env(safe-area-inset-right))] slim:pl-[max(0.5rem,env(safe-area-inset-left))]">
      {universeSlug !== undefined && <UniverseNoIndex universeSlug={universeSlug} />}
      {mapSlug !== undefined && <EditAvailability />}
      {slim ? <SlimBar universeSlug={universeSlug} /> : <WideBar universeSlug={universeSlug} />}
      <ShortcutHelp />
      <CommandPalette />
    </header>
  );
}

/** The bar on the compact and full tiers: as drawn in ux.md §1. */
function WideBar({ universeSlug }: { universeSlug: string | undefined }) {
  const { mapSlug } = useParams();
  return (
    <>
      <Link
        to="/"
        className="pointer-events-auto mr-2 shrink-0 text-sm font-semibold whitespace-nowrap label-caps text-foreground"
      >
        <span aria-hidden className="mr-1.5 text-primary compact:mr-0">
          ◈
        </span>
        <span className={BAR_TEXT}>Galaxy Explorer</span>
      </Link>
      {universeSlug !== undefined && <UniverseControls universeSlug={universeSlug} />}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {universeSlug !== undefined && <PaletteButton />}
        {mapSlug !== undefined && <EditToggle />}
        {mapSlug !== undefined && <EventsPopover />}
        {mapSlug !== undefined && <LayersPopover />}
        <SpoilerToggle />
        <HelpMenu />
        <QualityPopover />
        <AccountMenu />
      </div>
    </>
  );
}

/** Asks search engines not to index a universe that isn't public (M8-T12), at every width. */
function UniverseNoIndex({ universeSlug }: { universeSlug: string }) {
  const route = useUniverseRoute(universeSlug);
  useNoIndex(route.status === 'ready' && route.universe.visibility !== 'public');
  return null;
}

function UniverseControls({ universeSlug }: { universeSlug: string }) {
  const bar = useUniverseBar(universeSlug);
  const [cloning, setCloning] = useState(false);
  if (!bar) return null;
  const { universe, map } = bar;
  return (
    <>
      <Switcher
        label="Universe"
        tourName="universe-switcher"
        value={universe.slug}
        current={bar.universeName}
        options={bar.universeOptions}
        onSelect={bar.selectUniverse}
        footer={
          <>
            <DropdownMenuItem asChild>
              <Link to={`/u/${universe.slug}/settings`}>Universe settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/universes">All universes</Link>
            </DropdownMenuItem>
          </>
        }
      />
      {bar.maps.length > 0 && (
        <Switcher
          label="Map"
          value={map?.slug ?? ''}
          current={bar.mapName}
          options={bar.mapOptions}
          onSelect={bar.selectMap}
          footer={
            bar.canClone ? (
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
          universeId={universe.id}
          universeSlug={universeSlug}
          map={map}
        />
      )}
      {map && <Breadcrumbs universeSlug={universeSlug} mapSlug={map.slug} mapId={map.id} />}
    </>
  );
}
