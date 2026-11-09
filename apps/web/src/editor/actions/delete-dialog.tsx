import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { deleteDescription } from './delete.ts';
import { describeImpact } from './impact.ts';
import type { PendingDelete } from './use-delete-objects.ts';

/**
 * The delete confirmation (ux.md §5): "Delete Gudrun System?" and what goes with it, counted
 * by a dry run. Delete stays disabled until the count is in, so nothing is deleted unseen.
 */
export function DeleteDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingDelete | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const impact = pending?.summary ? describeImpact(pending.summary) : null;
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      {pending && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteDescription(pending.objects)}?</DialogTitle>
            <DialogDescription>
              {pending.summary === null
                ? 'Counting what goes with it…'
                : (impact ?? 'Nothing else is affected.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending.summary === null || pending.deleting}
              onClick={onConfirm}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
