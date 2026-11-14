import { PASSWORD_MIN_LENGTH } from '@ge/domain';
import { useId, useState, type SyntheticEvent } from 'react';
import { useChangePassword } from '@/api/account.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';

/** The account page's Password (ux.md §13): the current one, the new one twice, and a code. */
export function PasswordSection() {
  const id = useId();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [totp, setTotp] = useState('');
  const [done, setDone] = useState(false);
  const ready =
    current !== '' &&
    next.length >= PASSWORD_MIN_LENGTH &&
    next === again &&
    /^\d{6}$/.test(totp) &&
    !change.isPending;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!ready) return;
    setDone(false);
    change.mutate(
      { currentPassword: current, newPassword: next, totp },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setAgain('');
          setTotp('');
          setDone(true);
        },
        onError: () => {
          setTotp('');
        },
      },
    );
  };

  const field = (
    key: string,
    label: string,
    value: string,
    set: (v: string) => void,
    extra = {},
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input
        id={`${id}-${key}`}
        value={value}
        onChange={(event) => {
          set(event.target.value);
        }}
        {...extra}
      />
    </div>
  );

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-xs text-muted-foreground label-caps">
        Password
      </h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {field('current', 'Current password', current, setCurrent, {
          type: 'password',
          autoComplete: 'current-password',
        })}
        {field(
          'next',
          `New password (at least ${String(PASSWORD_MIN_LENGTH)} characters)`,
          next,
          setNext,
          { type: 'password', autoComplete: 'new-password' },
        )}
        {field('again', 'The new password again', again, setAgain, {
          type: 'password',
          autoComplete: 'new-password',
        })}
        {field('totp', 'Code from your authenticator app', totp, setTotp, {
          inputMode: 'numeric',
          autoComplete: 'one-time-code',
          maxLength: 6,
        })}
        {change.error && (
          <p role="alert" className="text-destructive">
            {errorMessage(change.error)}
          </p>
        )}
        {done && (
          <p role="status" className="text-muted-foreground">
            Changed. Your other devices were signed out.
          </p>
        )}
        <Button type="submit" className="self-start" disabled={!ready}>
          {change.isPending ? 'Changing…' : 'Change the password'}
        </Button>
      </form>
    </section>
  );
}
