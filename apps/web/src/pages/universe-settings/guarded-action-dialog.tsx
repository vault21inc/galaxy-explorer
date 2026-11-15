import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import type { Confirmation } from '@/api/confirmation.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { ConfirmationField, useConfirmationInput } from '@/components/confirmation-field.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';

/**
 * The confirmation for what can't be undone: transferring or deleting a universe (M8-T12, ux.md
 * §13). It asks for the universe's name, typed exactly, and, with accounts, a confirmation: a
 * current code from the authenticator app, or the password for an account with codes off
 * (D-47), which the API checks. A transfer also asks for the account to hand it to.
 */
export interface GuardedAction {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** The universe's plain name, which must be typed to confirm. */
  universeName: string;
  /** Ask for the account to act on (a transfer). */
  askUsername?: boolean;
  /** Ask for a confirmation (a code or the password): only where there are accounts. */
  askConfirmation: boolean;
  /** Does it; a thrown error is shown in the dialog. */
  run: (input: { username: string; confirmation: Confirmation | undefined }) => Promise<void>;
}

export function GuardedActionDialog({
  action,
  onClose,
}: {
  action: GuardedAction | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {action && (
        <DialogContent>
          <GuardedForm action={action} onClose={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function GuardedForm({ action, onClose }: { action: GuardedAction; onClose: () => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const confirm = useConfirmationInput();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready =
    name === action.universeName &&
    (!action.askUsername || username.trim() !== '') &&
    (!action.askConfirmation || confirm.ready) &&
    !busy;

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await action.run({
        username: username.trim(),
        confirmation: action.askConfirmation ? confirm.confirmation : undefined,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? errorMessage(caught) : String(caught));
      // A code works once: the next try needs the next one.
      confirm.setValue('');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{action.title}</DialogTitle>
        <DialogDescription>{action.description}</DialogDescription>
      </DialogHeader>
      {action.askUsername && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-username`}>Username of the new owner</Label>
          <Input
            id={`${id}-username`}
            value={username}
            autoComplete="off"
            maxLength={32}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>Type the universe’s name to confirm</Label>
        <Input
          id={`${id}-name`}
          value={name}
          autoComplete="off"
          aria-describedby={`${id}-name-hint`}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <p id={`${id}-name-hint`} className="text-xs text-muted-foreground">
          {action.universeName}
        </p>
      </div>
      {action.askConfirmation && <ConfirmationField id={`${id}-code`} input={confirm} />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={!ready}>
          {busy ? 'Working…' : action.confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
