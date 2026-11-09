import {
  objectTypes,
  resolveAppearance,
  rt,
  type BaseType,
  type GalaxyView,
  type ViewObject,
} from '@ge/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/app/route-states.tsx';
import { sendWrite } from '@/api/fetch-data.ts';
import type { EntityRead } from '@/api/hooks.ts';
import { queryKeys } from '@/api/keys.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { entityCreateRequest } from '@/api/requests.ts';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { useToasts } from '@/state/toasts.ts';
import { defaultName } from './placeable-types.ts';

interface NewObject {
  baseType: BaseType;
  /** On the work plane, in the view's unit. */
  position: [number, number, number];
}

let pendingId = 0;

/**
 * Creates an object in the galaxy view (M3-T2): one POST, one change batch. The view shows it
 * at once (an optimistic entry in the cached payload) and takes it back if the request fails;
 * on success the new object is selected and its name field focused.
 */
export function useCreateObject(mapId: string) {
  const queryClient = useQueryClient();
  const readOptions = useReadOptions();
  const viewKey = queryKeys.view('galaxy', mapId, readOptions);

  return useMutation({
    mutationFn: ({ baseType, position }: NewObject) =>
      sendWrite<EntityRead<'celestial_object'>>(
        'POST',
        entityCreateRequest('celestial_object', { mapId }),
        {
          name: rt.plain(defaultName(baseType)),
          baseType,
          x: position[0],
          y: position[1],
          z: position[2],
          // Systems open a system view, planets an orbit view; other types open none.
          explorable: objectTypes[baseType].explorableAs !== null,
        },
        `Add ${objectTypes[baseType].label.toLowerCase()}`,
      ),
    onMutate: async (input) => {
      // Stop an in-flight refetch from overwriting the optimistic entry.
      await queryClient.cancelQueries({ queryKey: viewKey });
      const previous = queryClient.getQueryData<GalaxyView>(viewKey);
      queryClient.setQueryData<GalaxyView>(viewKey, (view) =>
        view ? { ...view, objects: [...view.objects, optimisticObject(input)] } : view,
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      queryClient.setQueryData(viewKey, context?.previous);
      useToasts.getState().show(`Couldn't add the object: ${errorMessage(error)}`, 'error');
    },
    onSuccess: (created) => {
      useSelection.getState().select([created.id]);
      useEditor.getState().setFocusNameOf(created.id);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['view'] }),
  });
}

/** How the new object looks until the server's payload replaces it. */
function optimisticObject({ baseType, position }: NewObject): ViewObject {
  const { appearance, size } = resolveAppearance({ baseType, view: 'galaxy' });
  const name = defaultName(baseType);
  return {
    id: `pending-${(pendingId++).toString()}`,
    baseType,
    subtypeId: null,
    namePlain: name,
    nameSpoiler: false,
    nameRedacted: name,
    isSpoiler: false,
    status: 'published',
    version: 1,
    explorable: objectTypes[baseType].explorableAs !== null,
    position,
    appearance,
    size,
  } as ViewObject;
}
