import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Universe } from '@/api/containers.ts';
import { useDeleteUniverse, useTransferUniverse } from '@/api/sharing.ts';
import { Button } from '@/components/ui/button.tsx';
import { useToasts } from '@/state/toasts.ts';
import { GuardedActionDialog, type GuardedAction } from './guarded-action-dialog.tsx';

/**
 * The owner's last two controls (M8-T12, ux.md §13): hand the universe to another account, or
 * delete it with everything in it. Neither can be undone, so each asks for the universe's name
 * and, with accounts, a current two-factor code.
 */
export function TransferAndDelete({
  universe,
  accounts,
}: {
  universe: Universe;
  /** Whether this site has accounts: without, there's nobody to transfer to and no code. */
  accounts: boolean;
}) {
  const navigate = useNavigate();
  const transfer = useTransferUniverse(universe.id);
  const remove = useDeleteUniverse(universe);
  const [action, setAction] = useState<GuardedAction | null>(null);
  const name = universe.namePlain;
  const toasts = useToasts.getState();

  const transferAction: GuardedAction = {
    title: `Transfer ${name}`,
    description:
      'The account you name becomes its owner, and you stay on as an editor. Only they can give it back.',
    confirmLabel: 'Transfer it',
    universeName: name,
    askUsername: true,
    askConfirmation: accounts,
    run: async ({ username, confirmation }) => {
      await transfer.mutateAsync({ username, confirmation });
      toasts.show(`${name} now belongs to ${username}. You’re an editor.`, 'info');
    },
  };
  const deleteAction: GuardedAction = {
    title: `Delete ${name}`,
    description:
      'Its maps, everything on them, its people, settings and images are deleted for good. This can’t be undone, not even from History.',
    confirmLabel: 'Delete it',
    universeName: name,
    askConfirmation: accounts,
    run: async ({ confirmation }) => {
      await remove.mutateAsync({ confirmation });
      toasts.show(`Deleted ${name}`, 'info');
      void navigate('/');
    },
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Transfer or delete</h3>
      <div className="flex flex-wrap gap-2">
        {accounts && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setAction(transferAction);
            }}
          >
            Transfer…
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => {
            setAction(deleteAction);
          }}
        >
          Delete universe…
        </Button>
      </div>
      <GuardedActionDialog
        action={action}
        onClose={() => {
          setAction(null);
        }}
      />
    </div>
  );
}
