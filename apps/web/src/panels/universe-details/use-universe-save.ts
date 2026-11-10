import { ApiError, unwrap } from '@ge/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/api/client.ts';
import type { Universe } from '@/api/containers.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useToasts } from '@/state/toasts.ts';
import type { FormRecord, SaveFields } from '../entity-form/field-props.ts';

/**
 * Saving the universe details (M4-T1): each field is one PATCH, so one batch, sent in order
 * with the version the last save returned, like the map settings (use-map-save.ts). A conflict
 * or a failure shows a toast and the saved values again (`revision`); universes are edited
 * rarely and by the owner alone, so there's no "Changed elsewhere" dialog.
 */
export function useUniverseSave(universe: Universe) {
  const queryClient = useQueryClient();
  const version = useRef(universe.version);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    version.current = Math.max(version.current, universe.version);
  }, [universe.version]);

  const universeId = universe.id;
  const save: SaveFields = (changes, description) => {
    const run = queue.current.then(async (): Promise<FormRecord | null> => {
      try {
        const saved = await unwrap(
          api.PATCH('/api/v1/universes/{universeId}', {
            params: { path: { universeId } },
            body: { ...changes, version: version.current },
            headers: { 'X-GE-Batch-Description': encodeURIComponent(description) },
          }),
        );
        version.current = Math.max(version.current, saved.version);
        return saved;
      } catch (error) {
        const reason =
          error instanceof ApiError && error.status === 409
            ? 'the universe was changed elsewhere. It now shows the latest details.'
            : error instanceof Error
              ? errorMessage(error)
              : 'unknown error';
        useToasts.getState().show(`Couldn't save: ${reason}`, 'error');
        setRevision((value) => value + 1);
        return null;
      } finally {
        await refreshAfterWrite(queryClient, [['universe']]);
      }
    });
    queue.current = run.catch(() => undefined);
    return run;
  };
  return { save, revision };
}
