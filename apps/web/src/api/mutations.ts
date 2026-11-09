import type { EntityKind } from '@ge/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendWrite } from './fetch-data.ts';
import type { EntityRead } from './hooks.ts';
import { entityUpdateRequest } from './requests.ts';

/**
 * Updating any entity, generic over the registry like the read hooks (architecture.md §3):
 * PATCH with the version that was read (a stale one fails with 409, architecture.md §5). On
 * success the entity's queries and every view refresh.
 */
export function useUpdateEntity<K extends EntityKind>(kind: K) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      description,
    }: {
      id: string;
      changes: Record<string, unknown> & { version: number };
      description?: string;
    }) => sendWrite<EntityRead<K>>('PATCH', entityUpdateRequest(kind, id), changes, description),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [kind] }),
        queryClient.invalidateQueries({ queryKey: ['view'] }),
      ]),
  });
}
