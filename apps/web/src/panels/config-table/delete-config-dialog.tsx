import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';

/**
 * "Delete group type “Sector”?" (M4-T1). The server refuses while something still uses the
 * setting (a group type with groups), and says why in a toast; a delete it allows can be undone
 * from the History panel like any other change.
 */
export function DeleteConfigDialog({
  open,
  what,
  title,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  /** "group type" */
  what: string;
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {what} “{title}”?
          </DialogTitle>
          <DialogDescription>
            A setting still in use can’t be deleted: a group type with groups, for example.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
