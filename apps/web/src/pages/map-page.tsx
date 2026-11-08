import { useParams } from 'react-router';
import { useViewPayload } from '@/api/hooks.ts';
import { errorMessage, RouteStates } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { useUniverseRoute } from '@/app/use-universe-route.ts';

/**
 * `/u/:universeSlug/:mapSlug`: the galaxy view of one map. It loads the galaxy view payload
 * (architecture.md §6); M2-T2 and M2-T3 draw it in the canvas.
 */
export function MapPage() {
  const { universeSlug = '', mapSlug = '' } = useParams();
  const route = useUniverseRoute(universeSlug, mapSlug);
  const view = useViewPayload('galaxy', route.status === 'ready' ? route.map?.id : undefined);

  if (route.status !== 'ready') return <RouteStates route={route} />;
  if (view.error) {
    return (
      <StatusPanel tone="error" title="Couldn't load this map" onRetry={() => void view.refetch()}>
        {errorMessage(view.error)}
      </StatusPanel>
    );
  }
  if (!view.data) return <StatusPanel tone="loading" title="Loading the galaxy…" />;
  if (view.data.objects.length === 0) {
    return (
      <StatusPanel tone="empty" title="This map is empty">
        Objects are added in edit mode, which arrives in M3.
      </StatusPanel>
    );
  }
  return null;
}
