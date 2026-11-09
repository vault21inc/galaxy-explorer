import { ApiError } from '@ge/api-client';
import type { EntityKind } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useUpdateEntity } from '@/api/mutations.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useToasts } from '@/state/toasts.ts';
import type { PanelEntity } from '../types.ts';
import type { SaveFields } from './field-props.ts';

/** A save refused because someone else changed the entity first (409, architecture.md §5). */
export interface Conflict {
  changes: Record<string, unknown>;
  /** The entity as it is now on the server. */
  current: PanelEntity;
  reload: () => void;
  overwrite: () => void;
}

/**
 * Saving the form's fields (ux.md §5: "each field saves on blur"). Each save is one PATCH with
 * the version this form last saw, and one change batch.
 *
 * - **In order:** saves wait for the one before, so a quick rename and then a summary edit
 *   don't race, and each sends the version the previous save returned.
 * - **Conflicts:** a 409 opens the "Changed elsewhere" dialog. Reload throws away the edit
 *   and shows the server's version; Overwrite sends the same change again with the new
 *   version. The save waits for that choice.
 * - **Failures:** a toast, and the fields go back to what's saved (`revision`).
 */
export function useEntitySave(kind: EntityKind, entity: PanelEntity) {
  const { mutateAsync } = useUpdateEntity(kind);
  const queryClient = useQueryClient();
  const version = useRef(entity.version);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [revision, setRevision] = useState(0);
  const id = entity.id;

  // A newer version read from the server (after a drag, say) is the one to send next.
  useEffect(() => {
    version.current = Math.max(version.current, entity.version);
  }, [entity.version]);

  async function attempt(
    changes: Record<string, unknown>,
    description: string,
  ): Promise<PanelEntity | null> {
    try {
      // Resolves once the entity and the views have refetched (useUpdateEntity).
      const saved = (await mutateAsync({
        id,
        changes: { ...changes, version: version.current },
        description,
      })) as PanelEntity;
      version.current = Math.max(version.current, saved.version);
      return saved;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.problem.current) {
        return askAboutConflict(changes, description, error.problem.current as PanelEntity);
      }
      // Anything but a problem response is a bug or a network failure: keep it in the console.
      if (!(error instanceof ApiError)) console.error(error);
      const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
      useToasts.getState().show(`Couldn't save: ${reason}`, 'error');
      setRevision((value) => value + 1);
      return null;
    }
  }

  function askAboutConflict(
    changes: Record<string, unknown>,
    description: string,
    current: PanelEntity,
  ): Promise<PanelEntity | null> {
    return new Promise((resolve) => {
      setConflict({
        changes,
        current,
        reload: () => {
          setConflict(null);
          version.current = current.version;
          setRevision((value) => value + 1);
          // Fetch the current entity and views; the fields then show them.
          void refreshAfterWrite(queryClient, [[kind], ['view']]);
          resolve(null);
        },
        overwrite: () => {
          setConflict(null);
          version.current = current.version;
          resolve(attempt(changes, description));
        },
      });
    });
  }

  const save: SaveFields = (changes, description) => {
    const run = queue.current.then(() => attempt(changes, description));
    queue.current = run.catch(() => undefined);
    return run;
  };

  return { save, conflict, revision };
}
