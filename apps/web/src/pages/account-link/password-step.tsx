import { PASSWORD_MIN_LENGTH, Username } from '@ge/domain';
import { Check, Circle } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { useFinishLink, useStartLink, type AccountLink, type TwoFactorSetup } from '@/api/auth.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';

interface PasswordStepProps {
  token: string;
  link: AccountLink;
  /** Whether to set up two-factor codes now (D-47): off unless the person turns it on. */
  twoFactor: boolean;
  onTwoFactorChange: (on: boolean) => void;
  /** With codes: the new secret, for the code step. */
  onStarted: (setup: TwoFactorSetup) => void;
}

/**
 * Step 1 of a link: a username (an invite only) and a password, with the rules shown as they're
 * met (ux.md §13), and whether to set up two-factor codes now (D-47). The API checks them again,
 * and whether the username is free. Without codes, that's the only step: the account is made
 * (or its password replaced) at once.
 */
export function PasswordStep({
  token,
  link,
  twoFactor,
  onTwoFactorChange,
  onStarted,
}: PasswordStepProps) {
  const id = useId();
  const navigate = useNavigate();
  const start = useStartLink(token);
  const finish = useFinishLink(token);
  const invite = link.purpose === 'invite';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const usernameOk = !invite || Username.safeParse(username).success;
  const rules = [
    ...(invite
      ? [{ met: usernameOk, text: 'A username of 3 to 32 lower-case letters, digits, - or _' }]
      : []),
    {
      met: password.length >= PASSWORD_MIN_LENGTH,
      text: `A password of at least ${String(PASSWORD_MIN_LENGTH)} characters`,
    },
    { met: password !== '' && again === password, text: 'The same password twice' },
  ];
  const busy = start.isPending || finish.isPending;
  const canSubmit = rules.every((rule) => rule.met) && !busy;
  const error = start.error ?? finish.error;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    start.mutate(invite ? { username, password, twoFactor } : { password, twoFactor }, {
      onSuccess: (setup) => {
        if (setup.secret !== null && setup.qrCode !== null && setup.otpauthUri !== null) {
          onStarted({
            ...setup,
            secret: setup.secret,
            qrCode: setup.qrCode,
            otpauthUri: setup.otpauthUri,
          });
          return;
        }
        finish.mutate(
          { setup: setup.setup },
          {
            onSuccess: () => {
              void navigate('/', { replace: true });
            },
          },
        );
      },
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-describedby={`${id}-rules`}>
      {invite && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-username`}>Username</Label>
          <Input
            id={`${id}-username`}
            value={username}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={32}
            onChange={(event) => {
              setUsername(event.target.value.toLowerCase());
            }}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-password`}>Password</Label>
        <Input
          id={`${id}-password`}
          type="password"
          value={password}
          autoComplete="new-password"
          maxLength={256}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-again`}>The same password again</Label>
        <Input
          id={`${id}-again`}
          type="password"
          value={again}
          autoComplete="new-password"
          maxLength={256}
          onChange={(event) => {
            setAgain(event.target.value);
          }}
        />
      </div>
      <ul id={`${id}-rules`} className="flex flex-col gap-1 text-xs" aria-label="Rules">
        {rules.map((rule) => (
          <li
            key={rule.text}
            className={
              rule.met
                ? 'flex items-center gap-1.5 text-foreground'
                : 'flex items-center gap-1.5 text-muted-foreground'
            }
          >
            {rule.met ? (
              <Check aria-hidden className="size-3.5 text-primary" />
            ) : (
              <Circle aria-hidden className="size-3.5" />
            )}
            {rule.text}
            <span className="sr-only">{rule.met ? ' (done)' : ' (not yet)'}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2">
          <Switch checked={twoFactor} onCheckedChange={onTwoFactorChange} />
          Set up two-factor codes now
        </label>
        <p className="text-xs text-muted-foreground">
          A code from an authenticator app each time you sign in, as well as the password.
          Recommended for admins. You can turn them on or off later from your account page.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {errorMessage(error)}
        </p>
      )}
      <Button type="submit" disabled={!canSubmit}>
        {busy
          ? 'Checking…'
          : twoFactor
            ? 'Next: two-factor codes'
            : invite
              ? 'Make the account'
              : 'Save the password'}
      </Button>
    </form>
  );
}
