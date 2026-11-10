import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { sendBatch } from '@/api/batch.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useSelection } from '@/state/selection.ts';
import { useToasts } from '@/state/toasts.ts';
import { deleteRequest, type Deletable } from './delete.ts';
import { summarizeImpact, type ImpactSummary } from './impact.ts';

/** A delete waiting for confirmation (ux.md §5). */
export interface PendingDelete {
  objects: readonly Deletable[];
  /** Null while the dry run is out. */
  summary: ImpactSummary | null;
  deleting: boolean;
}

/**
 * Deleting objects (M3-T5), and groups (M4-T2): `request` runs the delete as a dry run, whose impact the dialog
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

  const request = (objects: readonly Deletable[]) => {
    if (objects.length === 0) return;
    setPending({ objects, summary: null, deleting: false });
    sendBatch(deleteRequest(objects, true)).then((result) => {
      const objectCount = objects.filter((item) => (item.kind ?? 'celestial_object') !== 'group');
      const summary = summarizeImpact(result.impact ?? {}, objectCount.length);
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
      await refreshAfterWrite(queryClient, [['view'], ['celestial_object'], ['group']]);
    }, fail);
  };

  const cancel = () => {
    setPending(null);
  };

  return { pending, request, confirm, cancel };
}
