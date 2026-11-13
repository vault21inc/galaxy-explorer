import { unwrap, type paths } from '@ge/api-client';
import type { EntityKind } from '@ge/domain';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/api/client.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useToasts } from '@/state/toasts.ts';

/** A fact as the API takes it: the PUT body, as the generated client has it. */
export type FactBody = NonNullable<
  paths['/api/v1/entities/{entityId}/facts/{fieldDefinitionId}']['put']['requestBody']
>['content']['application/json'];

/**
 * Sets one fact of an entity, or removes it (`null`), as one change named in the history
 * ("Edit Population of “Gudrun”"), then refreshes the entity's panel and the views. A failure
 * is a toast; resolves whether it worked.
 */
export async function saveFact(
  queryClient: QueryClient,
  target: { entityId: string; kind: EntityKind; fieldDefinitionId: string },
  fact: FactBody | null,
  description: string,
): Promise<boolean> {
  const params = {
    path: { entityId: target.entityId, fieldDefinitionId: target.fieldDefinitionId },
  };
  const headers = { 'X-GE-Batch-Description': encodeURIComponent(description) };
  try {
    if (fact) {
      await unwrap(
        api.PUT('/api/v1/entities/{entityId}/facts/{fieldDefinitionId}', {
          params,
          body: fact,
          headers,
        }),
      );
    } else {
      const { error } = await api.DELETE('/api/v1/entities/{entityId}/facts/{fieldDefinitionId}', {
        params,
        headers,
      });
      if (error) throw new Error((error as { detail?: string }).detail ?? 'the server refused');
    }
    await refreshAfterWrite(queryClient, [[target.kind], ['view']]);
    return true;
  } catch (failure) {
    const reason = errorMessage(failure instanceof Error ? failure : new Error(String(failure)));
    useToasts.getState().show(`Couldn't save the fact: ${reason}`, 'error');
    return false;
  }
}
