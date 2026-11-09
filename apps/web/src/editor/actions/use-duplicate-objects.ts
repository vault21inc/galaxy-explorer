import type { ViewObject } from '@ge/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendBatch } from '@/api/batch.ts';
import { fetchData } from '@/api/fetch-data.ts';
import { queryKeys } from '@/api/keys.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { entityRequest } from '@/api/requests.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useSelection } from '@/state/selection.ts';
import { useToasts } from '@/state/toasts.ts';
import { duplicateOperations, type DuplicableObject } from './duplicate.ts';

/**
 * Duplicating objects (⌘/Ctrl + D, ux.md §5): reads each object with its facts, then creates
 * the copies in one batch, 20 units to the right with " copy" after their names. The copies
 * become the selection, so they can be dragged into place at once.
 */
export function useDuplicateObjects(mapId: string) {
  const queryClient = useQueryClient();
  const readOptions = useReadOptions();
  return useMutation({
    mutationFn: async (objects: readonly ViewObject[]) => {
      const options = { ...readOptions, include: ['facts' as const] };
      const full = await Promise.all(
        objects.map((object) =>
          queryClient.query({
            queryKey: queryKeys.entity('celestial_object', object.id, options),
            queryFn: ({ signal }) =>
              fetchData<DuplicableObject>(
                entityRequest('celestial_object', object.id, options),
                signal,
              ),
          }),
        ),
      );
      const [only] = objects;
      return sendBatch({
        description:
          objects.length === 1 && only
            ? `Duplicate “${only.namePlain}”`
            : `Duplicate ${objects.length.toString()} objects`,
        operations: duplicateOperations(full, mapId),
      });
    },
    onSuccess: async (result) => {
      const copies = result.results.flatMap((item) =>
        item.op === 'create' && item.id ? [item.id] : [],
      );
      await refreshAfterWrite(queryClient, [['view'], ['celestial_object']]);
      useSelection.getState().select(copies);
    },
    onError: (error) => {
      useToasts.getState().show(`Couldn't duplicate: ${errorMessage(error)}`, 'error');
    },
  });
}
