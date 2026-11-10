import type { ViewObject } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { sendBatch } from '@/api/batch.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { useToasts } from '@/state/toasts.ts';
import { createRouteRequest, routeName } from './route.ts';

/**
 * Creates a route through objects in order (M4-T7), from the Route tool or "Create route" on a
 * selection: one batch and one undo step. The new route is selected and its name field takes
 * focus, ready to rename. Resolves with its id, or null if nothing was created.
 */
export function useCreateRoute(mapId: string, objects: readonly ViewObject[]) {
  const queryClient = useQueryClient();
  return async (objectIds: readonly string[]): Promise<string | null> => {
    const nameOf = (id: string | undefined) =>
      objects.find((object) => object.id === id)?.namePlain ?? 'Route';
    const request = createRouteRequest(
      mapId,
      objectIds,
      routeName(nameOf(objectIds[0]), nameOf(objectIds.at(-1))),
    );
    if (!request) return null;
    try {
      const result = await sendBatch(request);
      const id = result.results[0]?.id ?? null;
      await refreshAfterWrite(queryClient, [['view'], ['route']]);
      if (id) {
        useSelection.getState().select([id]);
        useEditor.getState().setFocusNameOf(id);
      }
      return id;
    } catch (error) {
      const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
      useToasts.getState().show(`Couldn't create the route: ${reason}`, 'error');
      return null;
    }
  };
}
