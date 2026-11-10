import type { BatchRequest, ViewGroup, ViewGroupType } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { sendBatch } from '@/api/batch.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useLayers } from '@/state/layers.ts';
import { useToasts } from '@/state/toasts.ts';
import {
  activeLayerOf,
  addToGroupRequest,
  groupRequest,
  removeFromGroupsRequest,
  type Conflict,
  type NewGroup,
} from './group.ts';

/**
 * Sends the grouping batches (group.ts), each one change and one undo step, then refreshes the
 * view (its groups and members) and any open group panel. A failure is a toast.
 */
export function useGroupActions(
  groups: readonly ViewGroup[],
  groupTypes: readonly ViewGroupType[],
) {
  const queryClient = useQueryClient();

  const send = async (request: BatchRequest | null): Promise<string | null> => {
    if (!request) return null;
    try {
      const result = await sendBatch(request);
      return result.results[0]?.id ?? null;
    } catch (error) {
      const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
      useToasts.getState().show(`Couldn't change the groups: ${reason}`, 'error');
      throw error;
    } finally {
      await refreshAfterWrite(queryClient, [['view'], ['group']]);
    }
  };

  return {
    /** Creates the group with these members; resolves with the new group's id. */
    group: async (group: NewGroup, objectIds: readonly string[], conflicts: Conflict[]) => {
      const id = await send(groupRequest(group, objectIds, conflicts));
      const layer = groupTypes.find((type) => type.id === group.groupTypeId)?.layer;
      if (layer) useLayers.getState().setActiveLayer(layer);
      return id;
    },
    addTo: (group: ViewGroup, objectIds: readonly string[]) =>
      send(addToGroupRequest(group, objectIds, groups)),
    /** Takes the objects out of their groups in the active layer. */
    removeFromLayer: (objectIds: readonly string[]) => {
      const layer = activeLayerOf(useLayers.getState().activeLayer, groupTypes);
      if (layer === null) return Promise.resolve(null);
      return send(removeFromGroupsRequest(objectIds, layer, groups, groupTypes));
    },
  };
}
