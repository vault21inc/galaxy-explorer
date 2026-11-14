import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Universe } from '@/api/containers.ts';
import { useLeaveUniverse } from '@/api/sharing.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { useToasts } from '@/state/toasts.ts';

/**
 * "Leave this universe" (M8-T12, ux.md §13), for an editor or viewer it's shared with: after
 * asking, they stop being a member, and only the owner can share it with them again.
 */
export function LeaveUniverse({ universe }: { universe: Universe }) {
  const navigate = useNavigate();
  const leave = useLeaveUniverse(universe.id);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = universe.namePlain;
  // A private universe vanishes for someone who leaves it; a public one stays readable.
  const after =
    universe.visibility === 'public'
      ? 'You can still read it, as everyone can.'
      : 'You won’t be able to open it unless its owner shares it with you again.';

  const confirm = async () => {
    setError(null);
    try {
      await leave.mutateAsync();
      setOpen(false);
      useToasts.getState().show(`You left ${name}`, 'info');
      void navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? errorMessage(caught) : String(caught));
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => {
          setOpen(true);
        }}
      >
        Leave this universe
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave {name}?</DialogTitle>
            <DialogDescription>
              {universe.owner ?? 'Its owner'} shared it with you. {after}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={leave.isPending} onClick={() => void confirm()}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
