import type { ConfigResource } from '@ge/domain';
import { useRef, useState } from 'react';
import { useConfigWrites } from '@/api/config-writes.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useToasts } from '@/state/toasts.ts';
import type { FormRecord, SaveFields } from '../entity-form/field-props.ts';

/**
 * Saving one settings row's cells (M4-T1): each change is one PATCH, so one batch, sent in
 * order. Settings have no version, so there's no conflict to handle; a failure (a name already
 * taken, say) shows a toast and the saved value again (`revision`).
 */
export function useConfigRowSave(resource: ConfigResource, universeId: string, id: string) {
  const { update } = useConfigWrites(resource, universeId);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [revision, setRevision] = useState(0);

  const save: SaveFields = (changes, description) => {
    const run = queue.current.then(async (): Promise<FormRecord | null> => {
      try {
        return await update(id, changes, description);
      } catch (error) {
        if (!(error instanceof Error)) console.error(error);
        const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
        useToasts.getState().show(`Couldn't save: ${reason}`, 'error');
        setRevision((value) => value + 1);
        return null;
      }
    });
    queue.current = run.catch(() => undefined);
    return run;
  };
  return { save, revision };
}
