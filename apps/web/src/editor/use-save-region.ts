import { unwrap } from '@ge/api-client';
import type { RegionAppearance } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useRegionPreview } from '@/state/region-preview.ts';
import { useToasts } from '@/state/toasts.ts';

/**
 * Saving a region's shape from its handles (M4-T6): its radius, or a rift's points. The view
 * holds each object's appearance merged with its type's defaults, which must not be written back
 * as the object's own overrides; so the object is read first, and only the changed region fields
 * are added to its own appearance. One PATCH, so one batch and one undo step. The preview ends
 * once the saved view has arrived, so nothing jumps back meanwhile.
 */
export function useSaveRegion() {
  const queryClient = useQueryClient();
  return async (id: string, changes: RegionAppearance, description: string) => {
    try {
      const object = await unwrap(api.GET('/api/v1/objects/{id}', { params: { path: { id } } }));
      await unwrap(
        api.PATCH('/api/v1/objects/{id}', {
          params: { path: { id } },
          body: {
            version: object.version,
            appearance: {
              ...object.appearance,
              region: { ...object.appearance.region, ...changes },
            },
          },
          headers: { 'X-GE-Batch-Description': encodeURIComponent(description) },
        }),
      );
    } catch (error) {
      const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
      useToasts.getState().show(`Couldn't save the region: ${reason}`, 'error');
    } finally {
      await refreshAfterWrite(queryClient, [['view'], ['celestial_object']]);
      useRegionPreview.getState().clear();
    }
  };
}
