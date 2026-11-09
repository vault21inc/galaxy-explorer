import type { ViewObject } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { sendBatch } from '@/api/batch.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useSelection } from '@/state/selection.ts';
import { useToasts } from '@/state/toasts.ts';
import { deleteRequest } from './delete.ts';
import { summarizeImpact, type ImpactSummary } from './impact.ts';

/** A delete waiting for confirmation (ux.md §5). */
export interface PendingDelete {
  objects: readonly ViewObject[];
  /** Null while the dry run is out. */
  summary: ImpactSummary | null;
  deleting: boolean;
}

/**
 * Deleting objects (M3-T5): `request` runs the delete as a dry run, whose impact the dialog
 * lists; `confirm` runs it for real, as one batch and one undo step; `cancel` drops it.
 */
export function useDeleteObjects() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const fail = (error: unknown) => {
    setPending(null);
    const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
    useToasts.getState().show(`Couldn't delete: ${reason}`, 'error');
  };

  const request = (objects: readonly ViewObject[]) => {
    if (objects.length === 0) return;
    setPending({ objects, summary: null, deleting: false });
    sendBatch(deleteRequest(objects, true)).then((result) => {
      const summary = summarizeImpact(result.impact ?? {}, objects.length);
      // Only if this is still the delete being asked about.
      setPending((current) => (current?.objects === objects ? { ...current, summary } : current));
    }, fail);
  };

  const confirm = () => {
    if (!pending) return;
    const { objects } = pending;
    setPending({ ...pending, deleting: true });
    sendBatch(deleteRequest(objects, false)).then(async () => {
      const deleted = new Set<string>(objects.map((object) => object.id));
      const selection = useSelection.getState();
      selection.select(selection.selectedIds.filter((id) => !deleted.has(id)));
      setPending(null);
      await refreshAfterWrite(queryClient, [['view'], ['celestial_object']]);
    }, fail);
  };

  const cancel = () => {
    setPending(null);
  };

  return { pending, request, confirm, cancel };
}
