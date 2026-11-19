import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useUniverses } from '@/api/containers.ts';
import { useCanEdit } from '@/editor/use-can-edit.ts';
import { containerName } from '@/lib/container-name.ts';
import { keptSearch } from '@/lib/kept-params.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import type { SwitcherOption } from './switcher.tsx';
import { useUniverseRoute } from './use-universe-route.ts';

/**
 * What the top bar shows about where the reader is, for both of its forms: the switchers and
 * breadcrumbs of the compact and full bars (app/top-bar.tsx) and the slim bar's location sheet
 * (app/location-sheet.tsx). Null until the universe has loaded. No side effects, so both may
 * call it: the top bar asks search engines not to index a private universe once, itself.
 */
export function useUniverseBar(universeSlug: string) {
  const { mapSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const universes = useUniverses();
  const policy = useSpoilerPolicy();
  const canEdit = useCanEdit();
  // Resolved without the map, so a mistyped map slug still shows the switchers to recover.
  const route = useUniverseRoute(universeSlug);
  // Another universe gets `perf` only: a share link's key is this universe's.
  const keepAcross = keptSearch(useLocation().search, {}, ['perf']);
  // This universe's other maps keep `perf` and a share link's `k`.
  const keep = keptSearch(searchParams.toString());
  if (route.status !== 'ready') return null;

  const universe = route.universe;
  const map = route.maps.find((item) => item.slug === mapSlug);
  const universeOptions: SwitcherOption[] = (universes.data ?? []).map((item) => ({
    value: item.slug,
    label: containerName(item, policy),
  }));
  const mapOptions: SwitcherOption[] = route.maps.map((item) => ({
    value: item.slug,
    label: containerName(item, policy),
  }));
  return {
    universe,
    universeName: containerName(universe, policy),
    universeOptions,
    selectUniverse: (slug: string) => void navigate(`/u/${slug}${keepAcross}`),
    maps: route.maps,
    map,
    mapName: map ? containerName(map, policy) : 'Choose a map',
    mapOptions,
    selectMap: (slug: string) => void navigate(`/u/${universeSlug}/${slug}${keep}`),
    /** "Clone map as…" (M7-T5): for those who may edit, on a map. */
    canClone: canEdit && map !== undefined,
  };
}

export type UniverseBar = NonNullable<ReturnType<typeof useUniverseBar>>;
