import { useQueryClient } from '@tanstack/react-query';
import { affectedQueries, batchDetail, createdEntities, revertBatch } from '@/api/history.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { useHistory } from '@/state/history.ts';
import { useSelection } from '@/state/selection.ts';
import { useToasts } from '@/state/toasts.ts';

/**
 * Reverting a batch (data-model §9), for undo, redo and the History panel. It reads what the
 * batch changed first, so afterwards it can refresh exactly those kinds and views, and drop
 * objects the revert deleted (the ones the batch had created) from the selection. Resolves
 * with the new batch's id; throws the API's 409 if something changed since, in which case
 * nothing was reverted.
 */
export function useRevert() {
  const queryClient = useQueryClient();
  return async (batchId: string): Promise<string> => {
    const detail = await batchDetail(batchId);
    const reverted = await revertBatch(batchId);
    const gone = new Set(createdEntities(detail));
    const selection = useSelection.getState();
    if (selection.selectedIds.some((id) => gone.has(id))) {
      selection.select(selection.selectedIds.filter((id) => !gone.has(id)));
    }
    await refreshAfterWrite(queryClient, affectedQueries(detail));
    return reverted.batchId;
  };
}

// Undo and redo run one at a time, in the order pressed: three quick ⌘Z are three undos.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Undo and redo (⌘/Ctrl + Z, ⌘/Ctrl + Shift + Z, ux.md §4): undo reverts the newest batch of
 * this session and keeps the revert for redo; redo reverts that revert. A conflict leaves the
 * stacks as they were and says what changed in a toast.
 */
export function useUndoRedo() {
  const revert = useRevert();
  const canUndo = useHistory((state) => state.undo.length > 0);
  const canRedo = useHistory((state) => state.redo.length > 0);

  const step = (direction: 'undo' | 'redo') => {
    queue = queue.then(async () => {
      const { undo, redo, set } = useHistory.getState();
      const from = direction === 'undo' ? undo : redo;
      const top = from.at(-1);
      if (top === undefined) return;
      try {
        const id = await revert(top);
        const rest = from.slice(0, -1);
        const now = useHistory.getState();
        set(
          direction === 'undo'
            ? { undo: rest, redo: [...now.redo, id] }
            : { undo: [...now.undo, id], redo: rest },
        );
      } catch (error) {
        const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
        useToasts.getState().show(`Couldn't ${direction}: ${reason}`, 'error');
      }
    });
  };

  return {
    canUndo,
    canRedo,
    undo: () => {
      step('undo');
    },
    redo: () => {
      step('redo');
    },
  };
}
