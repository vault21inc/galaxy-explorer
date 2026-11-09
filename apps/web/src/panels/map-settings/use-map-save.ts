import { ApiError, unwrap, type components } from '@ge/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '@/api/client.ts';
import type { GalaxyMap } from '@/api/containers.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useGalaxyPreview } from '@/state/galaxy-preview.ts';
import { useToasts } from '@/state/toasts.ts';

/** What the Map settings panel changes on a map. */
export type MapSettingsChange = Pick<
  components['schemas']['MapUpdate'],
  'galaxySettings' | 'underlay' | 'underlayAssetId'
>;

/**
 * Saving map settings (M3-T8): each change is one PATCH, so one batch, which undo and the
 * History panel cover. Saves run in order with the version the last one returned, so a quick
 * run of slider releases doesn't conflict with itself. Once the map is saved and refetched, the
 * live preview ends: the canvas then draws from the saved settings, with nothing jumping back.
 */
export function useMapSave(map: GalaxyMap) {
  const queryClient = useQueryClient();
  const version = useRef(map.version);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    version.current = Math.max(version.current, map.version);
  }, [map.version]);

  const mapId = map.id;
  return (changes: MapSettingsChange, description: string) => {
    const run = queue.current.then(async () => {
      try {
        const saved = await unwrap(
          api.PATCH('/api/v1/maps/{mapId}', {
            params: { path: { mapId } },
            body: { ...changes, version: version.current },
            headers: { 'X-GE-Batch-Description': encodeURIComponent(description) },
          }),
        );
        version.current = Math.max(version.current, saved.version);
      } catch (error) {
        const reason =
          error instanceof ApiError && error.status === 409
            ? 'the map was changed elsewhere. It now shows the latest settings.'
            : error instanceof Error
              ? errorMessage(error)
              : 'unknown error';
        useToasts.getState().show(`Couldn't save the map settings: ${reason}`, 'error');
      } finally {
        await refreshAfterWrite(queryClient, [['map'], ['view']]);
        useGalaxyPreview.getState().clear();
      }
    });
    queue.current = run;
    return run;
  };
}
