import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAccountsEnabled } from '@/api/auth.ts';
import { useUniverseBySlug } from '@/api/containers.ts';
import { useDeleteUniverse } from '@/api/sharing.ts';
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
import { useToasts } from '@/state/toasts.ts';
import { useTour, type Practice } from './tour-store.ts';

/**
 * The editor tour's end (M8-T10, D-30): delete the practice universe, the default, or keep it to
 * practise more. Deleting is the usual deletion, with its confirmation where there are accounts
 * (a code, or the password without codes, D-47), so the tour adds no way around it.
 */
export function TourFinish() {
  const finishing = useTour((state) => state.finishing);
  const practice = useTour((state) => state.practice);
  if (!finishing || !practice) return null;
  return <FinishDialog practice={practice} />;
}

function FinishDialog({ practice }: { practice: Practice }) {
  const navigate = useNavigate();
  const accounts = useAccountsEnabled();
  const universe = useUniverseBySlug(practice.slug).data;
  const remove = useDeleteUniverse({ id: practice.universeId, version: universe?.version ?? 0 });
  const confirmation = useConfirmationInput();
  const deleteButton = useRef<HTMLButtonElement>(null);
  const keep = () => {
    useTour.getState().finished();
  };
  const canDelete =
    universe !== undefined && universe !== null && (!accounts || confirmation.ready);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) keep();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          // Deleting is the default: focus starts on it, or on the confirmation it needs.
          if (accounts) return;
          event.preventDefault();
          deleteButton.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>That’s the editor tour</DialogTitle>
          <DialogDescription>
            Delete the practice universe now, or keep it to try more. A kept one is in Your
            universes, and its settings page deletes it later.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canDelete) return;
            remove.mutate(
              { ...(confirmation.confirmation ? { confirmation: confirmation.confirmation } : {}) },
              {
                onSuccess: () => {
                  useTour.getState().finished();
                  useToasts.getState().show('The practice universe is deleted.');
                  void navigate('/');
                },
              },
            );
          }}
        >
          {accounts && <ConfirmationField id="practice-confirmation" input={confirmation} />}
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(remove.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={keep}>
              Keep it
            </Button>
            <Button
              ref={deleteButton}
              type="submit"
              variant="destructive"
              disabled={!canDelete || remove.isPending}
            >
              Delete the practice universe
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
