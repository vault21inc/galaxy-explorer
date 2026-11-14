import { PASSWORD_MIN_LENGTH, Username } from '@ge/domain';
import { Check, Circle } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';
import { useStartLink, type AccountLink, type AccountLinkSetup } from '@/api/auth.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';

interface PasswordStepProps {
  token: string;
  link: AccountLink;
  onStarted: (setup: AccountLinkSetup) => void;
}

/**
 * Step 1 of a link: a username (an invite only) and a password, with the rules shown as they're
 * met (ux.md §13). The API checks them again, and whether the username is free.
 */
export function PasswordStep({ token, link, onStarted }: PasswordStepProps) {
  const id = useId();
  const start = useStartLink(token);
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
  const canSubmit = rules.every((rule) => rule.met) && !start.isPending;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    start.mutate(invite ? { username, password } : { password }, { onSuccess: onStarted });
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
      {start.error && (
        <p role="alert" className="text-destructive">
          {errorMessage(start.error)}
        </p>
      )}
      <Button type="submit" disabled={!canSubmit}>
        {start.isPending ? 'Checking…' : 'Next: two-factor codes'}
      </Button>
    </form>
  );
}
