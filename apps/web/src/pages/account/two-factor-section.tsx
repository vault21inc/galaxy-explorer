import { useId, useState, type SyntheticEvent } from 'react';
import { useDisableTwoFactor, useEnableTwoFactor, useStartTwoFactor } from '@/api/account.ts';
import { useAccount, type TwoFactorSetup } from '@/api/auth.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { TotpScan } from '@/components/totp-scan.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';

/**
 * The account page's Two-factor codes (D-47, ux.md §13): optional per account. Off, signing in
 * takes the password alone, and the confirmations ask for it. Turning them on shows a new secret
 * to scan and takes one code from the app; turning them off takes the password and a code.
 */
export function TwoFactorSection() {
  const id = useId();
  const on = useAccount().data?.twoFactor ?? false;
  const start = useStartTwoFactor();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [turningOff, setTurningOff] = useState(false);

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-xs text-muted-foreground label-caps">
        Two-factor codes
      </h2>
      <p>
        {on
          ? 'On: signing in asks for a code from your authenticator app, as well as your password.'
          : 'Off: you sign in with your password alone. Recommended for admins.'}
      </p>
      {setup ? (
        <EnableForm
          setup={setup}
          onDone={() => {
            setSetup(null);
          }}
        />
      ) : turningOff ? (
        <DisableForm
          onDone={() => {
            setTurningOff(false);
          }}
        />
      ) : (
        <>
          {start.error && (
            <p role="alert" className="text-destructive">
              {errorMessage(start.error)}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={start.isPending}
            onClick={() => {
              if (on) setTurningOff(true);
              else start.mutate(undefined, { onSuccess: setSetup });
            }}
          >
            {on ? 'Turn off…' : start.isPending ? 'Starting…' : 'Turn on…'}
          </Button>
        </>
      )}
    </section>
  );
}

/** Scan the new secret, then type one code to turn codes on. */
function EnableForm({ setup, onDone }: { setup: TwoFactorSetup; onDone: () => void }) {
  const id = useId();
  const enable = useEnableTwoFactor();
  const [totp, setTotp] = useState('');
  const ready = /^\d{6}$/.test(totp) && !enable.isPending;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!ready) return;
    enable.mutate(
      { setup: setup.setup, totp },
      {
        onSuccess: onDone,
        onError: () => {
          setTotp('');
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label="Turn two-factor codes on">
      <TotpScan qrCode={setup.qrCode} secret={setup.secret} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-totp`}>A code from the app</Label>
        <Input
          id={`${id}-totp`}
          value={totp}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          onChange={(event) => {
            setTotp(event.target.value.replace(/\D/g, ''));
          }}
        />
      </div>
      {enable.error && (
        <p role="alert" className="text-destructive">
          {errorMessage(enable.error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!ready}>
          {enable.isPending ? 'Turning on…' : 'Turn on'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The password and a current code turn codes off. */
function DisableForm({ onDone }: { onDone: () => void }) {
  const id = useId();
  const disable = useDisableTwoFactor();
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const ready = password !== '' && /^\d{6}$/.test(totp) && !disable.isPending;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!ready) return;
    disable.mutate(
      { currentPassword: password, totp },
      {
        onSuccess: onDone,
        onError: () => {
          setTotp('');
        },
      },
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3"
      aria-label="Turn two-factor codes off"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-password`}>Your password</Label>
        <Input
          id={`${id}-password`}
          type="password"
          value={password}
          autoComplete="current-password"
          maxLength={256}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-totp`}>Code from your authenticator app</Label>
        <Input
          id={`${id}-totp`}
          value={totp}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          onChange={(event) => {
            setTotp(event.target.value.replace(/\D/g, ''));
          }}
        />
      </div>
      {disable.error && (
        <p role="alert" className="text-destructive">
          {errorMessage(disable.error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={!ready}>
          {disable.isPending ? 'Turning off…' : 'Turn off'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
