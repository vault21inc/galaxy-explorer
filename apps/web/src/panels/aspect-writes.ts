import type { EntityKind } from '@ge/domain';
import type { QueryClient } from '@tanstack/react-query';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useToasts } from '@/state/toasts.ts';

/**
 * What the panel's aspect editors (relations, links) share: each write is one change in the
 * history, named for what it did, then a refresh of the panels of the kinds it touched. A
 * failure is a toast; each resolves whether it worked.
 */

/** The header that names a write's change in the history ("Add “Eisenhorn” to …"). */
export function describedAs(description: string) {
  return { 'X-GE-Batch-Description': encodeURIComponent(description) };
}

/** Runs one write; `what` finishes "Couldn't …" if it fails. */
export async function writeAspect(
  queryClient: QueryClient,
  kinds: readonly EntityKind[],
  what: string,
  write: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await write();
    await refreshAfterWrite(
      queryClient,
      [...new Set(kinds)].map((kind) => [kind]),
    );
    return true;
  } catch (failure) {
    const error = failure instanceof Error ? failure : new Error(String(failure));
    useToasts.getState().show(`Couldn't ${what}: ${errorMessage(error)}`, 'error');
    return false;
  }
}

/** A DELETE answers no body: its error, if any, becomes a thrown one. */
export function throwIfRefused(error: unknown): void {
  if (error) throw new Error((error as { detail?: string }).detail ?? 'the server refused');
}
