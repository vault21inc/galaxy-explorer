import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useViewPayload } from '@/api/hooks.ts';
import { errorMessage, RouteStates } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { useUniverseRoute } from '@/app/use-universe-route.ts';
import { SelectionAnnouncer } from '@/app/selection-announcer.tsx';
import { useNavigation } from '@/state/navigation.ts';
import { useSelectionUrlSync } from '@/state/selection-url.ts';

/**
 * `/u/:universeSlug/:mapSlug`: the galaxy view of one map. It loads the galaxy view payload
 * (architecture.md §6) and tells the canvas to show it; the panels here cover loading, errors
 * and empty maps.
 */
export function MapPage() {
  const { universeSlug = '', mapSlug = '' } = useParams();
  const route = useUniverseRoute(universeSlug, mapSlug);
  const mapId = route.status === 'ready' ? route.map?.id : undefined;
  const view = useViewPayload('galaxy', mapId);
  const show = useNavigation((state) => state.show);
  useSelectionUrlSync();

  useEffect(() => {
    if (mapId === undefined) return;
    show({ level: 'galaxy', subjectId: mapId });
    return () => {
      show(null);
    };
  }, [mapId, show]);

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
  return <SelectionAnnouncer objects={view.data.objects} />;
}
