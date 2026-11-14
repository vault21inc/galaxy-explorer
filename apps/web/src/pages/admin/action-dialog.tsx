import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';
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
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { LinkOnce } from './link-once.tsx';

/**
 * An admin action, confirmed in a dialog (M8-T13, ux.md §13). Disabling, deleting, a role
 * change, a reset link, a transfer and deleting a universe ask for a current code from the
 * authenticator app; deletes also ask for the name, typed exactly. An action that makes a link
 * shows it here once, with Copy.
 */
export interface AdminAction {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** What must be typed exactly to confirm, such as the username or universe address. */
  confirmText?: string;
  /** A value the action needs, such as the new owner or a quota. */
  input?: { label: string; numeric?: boolean; initial?: string };
  askCode: boolean;
  /** Does it. A returned string is a link to show once; a thrown error is shown here. */
  run: (values: { input: string; totp: string | undefined }) => Promise<unknown>;
}

export function ActionDialog({
  action,
  onClose,
}: {
  action: AdminAction | null;
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
          <ActionForm action={action} onClose={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function ActionForm({ action, onClose }: { action: AdminAction; onClose: () => void }) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [input, setInput] = useState(action.input?.initial ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const ready =
    (action.confirmText === undefined || typed === action.confirmText) &&
    (action.input === undefined || input.trim() !== '') &&
    (!action.askCode || /^\d{6}$/.test(code)) &&
    !busy;

  if (link !== null) {
    return (
      <div className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{action.title}</DialogTitle>
        </DialogHeader>
        <LinkOnce url={link} label="The link:" />
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const result = await action.run({
        input: input.trim(),
        totp: action.askCode ? code : undefined,
      });
      if (typeof result === 'string') {
        setLink(result);
        setBusy(false);
      } else {
        onClose();
      }
    } catch (caught) {
      setError(caught instanceof Error ? errorMessage(caught) : String(caught));
      // A code works once: the next try needs the next one.
      setCode('');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{action.title}</DialogTitle>
        <DialogDescription>{action.description}</DialogDescription>
      </DialogHeader>
      {action.input && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-input`}>{action.input.label}</Label>
          <Input
            id={`${id}-input`}
            value={input}
            autoComplete="off"
            {...(action.input.numeric ? { inputMode: 'decimal' as const } : {})}
            onChange={(event) => {
              setInput(event.target.value);
            }}
          />
        </div>
      )}
      {action.confirmText !== undefined && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-confirm`}>Type “{action.confirmText}” to confirm</Label>
          <Input
            id={`${id}-confirm`}
            value={typed}
            autoComplete="off"
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
        </div>
      )}
      {action.askCode && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-code`}>Code from your authenticator app</Label>
          <Input
            id={`${id}-code`}
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, ''));
            }}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={action.destructive ? 'destructive' : 'default'}
          disabled={!ready}
        >
          {busy ? 'Working…' : action.confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
