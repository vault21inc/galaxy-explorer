import { useId, useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { useFinishLink, type AccountLinkSetup } from '@/api/auth.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';

interface CodeStepProps {
  token: string;
  setup: AccountLinkSetup;
  onRestart: () => void;
}

/** The secret in groups of four, as authenticator apps show it, so it's easier to type. */
function grouped(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * Step 2 of a link: scan the QR code with an authenticator app (or type the secret, shown as
 * text beside it, ux.md §10), then type one code to prove it works. Only then is the account
 * made, and this browser signed in.
 */
export function CodeStep({ token, setup, onRestart }: CodeStepProps) {
  const id = useId();
  const navigate = useNavigate();
  const finish = useFinishLink(token);
  const [totp, setTotp] = useState('');
  const canSubmit = /^\d{6}$/.test(totp.trim()) && !finish.isPending;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    finish.mutate(
      { setup: setup.setup, totp: totp.trim() },
      {
        onSuccess: () => {
          void navigate('/', { replace: true });
        },
        onError: () => {
          setTotp('');
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p>
        Scan this with an authenticator app, such as 1Password, Google Authenticator or the iPhone’s
        Passwords app. Each time you sign in, it gives you a new code.
      </p>
      <img
        src={setup.qrCode}
        alt="A QR code for your authenticator app. The same secret is written below it."
        className="size-48 self-center rounded-md bg-white p-1"
      />
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Or type in this secret:</span>
        <code
          data-testid="totp-secret"
          className="rounded-md bg-muted px-2 py-1 font-mono text-xs break-all select-all"
        >
          {grouped(setup.secret)}
        </code>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-totp`}>A code from the app</Label>
        <Input
          id={`${id}-totp`}
          value={totp}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          onChange={(event) => {
            setTotp(event.target.value);
          }}
        />
      </div>
      {finish.error && (
        <p role="alert" className="text-destructive">
          {errorMessage(finish.error)}
        </p>
      )}
      <Button type="submit" disabled={!canSubmit}>
        {finish.isPending ? 'Finishing…' : 'Finish'}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onRestart}>
        Back
      </Button>
    </form>
  );
}
