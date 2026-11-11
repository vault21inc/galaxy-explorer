import type { components } from '@ge/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/api/client.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useToasts } from '@/state/toasts.ts';

/** A location as the API takes it (LocationWrite). */
export type LocationWrite = components['schemas']['LocationWrite'];

/**
 * Puts a place or event somewhere, or nowhere (`null`, events only), as one change named for
 * it in the history ("Edit location of “Battle of Brennan”"), then refreshes the views and the
 * panel. Failures become a toast. Resolves whether it worked.
 */
export async function saveLocation(
  queryClient: QueryClient,
  entity: { id: string; namePlain: string },
  location: LocationWrite | null,
  description = `Edit location of “${entity.namePlain}”`,
): Promise<boolean> {
  const params = { path: { entityId: entity.id } };
  const headers = { 'X-GE-Batch-Description': encodeURIComponent(description) };
  try {
    const { error } = location
      ? await api.PUT('/api/v1/entities/{entityId}/location', { params, body: location, headers })
      : await api.DELETE('/api/v1/entities/{entityId}/location', { params, headers });
    if (error) throw new Error((error as { detail?: string }).detail ?? 'the server refused');
    await refreshAfterWrite(queryClient, [['view'], ['place'], ['event']]);
    return true;
  } catch (failure) {
    const reason = failure instanceof Error ? errorMessage(failure) : 'unknown error';
    useToasts.getState().show(`Couldn't save the location: ${reason}`, 'error');
    return false;
  }
}
