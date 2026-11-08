import { Navigate, useParams } from 'react-router';
import { defaultMapOf } from '@/api/containers.ts';
import { RouteStates } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { useUniverseRoute } from '@/app/use-universe-route.ts';

/** `/u/:universeSlug`: opens the universe's default map, or its first (ux.md §9). */
export function UniversePage() {
  const { universeSlug = '' } = useParams();
  const route = useUniverseRoute(universeSlug);
  if (route.status !== 'ready') return <RouteStates route={route} />;

  const map = defaultMapOf(route.universe, route.maps);
  if (!map) {
    return (
      <StatusPanel tone="empty" title={`${route.universe.namePlain} has no maps yet`}>
        Maps are added in edit mode, which arrives in M3.
      </StatusPanel>
    );
  }
  // `replace`, so Back skips this redirect instead of bouncing straight back to the map.
  return <Navigate replace to={`/u/${universeSlug}/${map.slug}`} />;
}
