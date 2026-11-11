import {
  objectTypes,
  resolveAppearance,
  rt,
  type BaseType,
  type GalaxyObject,
  type ViewLevel,
  type ViewPayload,
} from '@ge/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/app/route-states.tsx';
import { sendWrite } from '@/api/fetch-data.ts';
import type { EntityRead } from '@/api/hooks.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { entityCreateRequest } from '@/api/requests.ts';
import { withObject } from '@/levels/registry.ts';
import type { EditView } from '@/levels/use-edit-view.ts';
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
 * Creates an object in the view being edited (M3-T2, M5-T4): one POST, one change batch, inside
 * the view's subject (a system) or at the top level of the galaxy, as the levels registry says.
 * The view shows it at once (an optimistic entry in the cached payload) and takes it back if
 * the request fails; on success the new object is selected and its name field focused.
 */
export function useCreateObject(view: EditView) {
  const queryClient = useQueryClient();
  const { mapId, level, viewKey } = view;
  const parentId = view.edit.parentOf(view.subjectId);

  return useMutation({
    mutationFn: ({ baseType, position }: NewObject) =>
      sendWrite<EntityRead<'celestial_object'>>(
        'POST',
        entityCreateRequest('celestial_object', { mapId }),
        {
          name: rt.plain(defaultName(baseType)),
          baseType,
          parentId,
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
      const previous = queryClient.getQueryData<ViewPayload<ViewLevel>>(viewKey);
      queryClient.setQueryData<ViewPayload<ViewLevel>>(viewKey, (payload) =>
        payload ? withObject(payload, optimisticObject(input, level)) : payload,
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
    onSettled: () => refreshAfterWrite(queryClient, [['view']]),
  });
}

/**
 * How the new object looks in a view until the server's payload replaces it (also the
 * placement ghost). It has a galaxy object's extra fields, which other views ignore.
 */
export function optimisticObject(
  { baseType, position }: NewObject,
  level: ViewLevel,
): GalaxyObject {
  const { appearance, size } = resolveAppearance({ baseType, view: level });
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
    orbitCenterId: null,
    appearance,
    size,
    // A new system holds nothing yet.
    planetCount: 0,
    spoilerPlanetCount: 0,
    stars: [],
    // A pending id isn't a UUID until the server answers; nothing sends it anywhere.
  } as unknown as GalaxyObject;
}
