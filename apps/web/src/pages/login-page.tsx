import { ApiError } from '@ge/api-client';
import { useId, useState, type SyntheticEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAccount, useAccountsEnabled, useSignIn } from '@/api/auth.ts';
import { useHealth } from '@/api/health.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { safeNext } from '@/lib/safe-next.ts';
import { PAGE_PANEL } from '@/app/panel-classes.ts';

/**
 * `/login` (M8-T1, ux.md §13): a username and a password, and, for an account with two-factor
 * codes on (D-47), a code from an authenticator app. The code field appears once the API says
 * the account needs one, which it says only for the right password. A failed try says only that
 * it didn't work, as the API does.
 */
export function LoginPage() {
  const health = useHealth();
  const accountsEnabled = useAccountsEnabled();
  const account = useAccount();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  if (health.data && !accountsEnabled) {
    return (
      <StatusPanel tone="empty" title="No accounts here">
        This server runs without accounts, so everyone who can open it may edit.{' '}
        <Link to="/" className="text-primary underline">
          See all universes
        </Link>
        .
      </StatusPanel>
    );
  }
  if (account.data) return <Navigate to={next} replace />;
  if (!health.data || account.isPending) return <StatusPanel tone="loading" title="Loading…" />;
  return <LoginForm next={next} />;
}

/** The API's answer to the right password without a code, for an account that needs one. */
function isCodeNeeded(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    (error.problem.errors ?? []).some((item) => item.path === '/totp')
  );
}

function LoginForm({ next }: { next: string }) {
  const id = useId();
  const navigate = useNavigate();
  const signIn = useSignIn();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const canSubmit = username.trim() !== '' && password !== '' && (!needsCode || totp.trim() !== '');

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!canSubmit || signIn.isPending) return;
    signIn.mutate(
      { username: username.trim(), password, ...(needsCode ? { totp: totp.trim() } : {}) },
      {
        onSuccess: () => {
          void navigate(next, { replace: true });
        },
        onError: (error) => {
          if (isCodeNeeded(error)) setNeedsCode(true);
          // A code is good for one try: the next attempt needs a fresh one.
          setTotp('');
        },
      },
    );
  };
  // The right password without a needed code isn't a mistake: the code field says what's next.
  const shownError = signIn.error && !isCodeNeeded(signIn.error) ? signIn.error : null;

  return (
    <main className={`${PAGE_PANEL} w-80 rounded-lg border bg-card p-4 text-sm`}>
      <form aria-labelledby={`${id}-heading`} onSubmit={onSubmit} className="flex flex-col gap-3">
        <h1 id={`${id}-heading`} className="text-base font-medium">
          Sign in
        </h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-username`}>Username</Label>
          <Input
            id={`${id}-username`}
            value={username}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-password`}>Password</Label>
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
        {needsCode && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-totp`}>Code from your authenticator app</Label>
            <Input
              id={`${id}-totp`}
              value={totp}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              // It appears in answer to the button: typing goes on there.
              autoFocus
              onChange={(event) => {
                setTotp(event.target.value);
              }}
            />
          </div>
        )}
        {shownError && (
          <p role="alert" className="text-destructive">
            {errorMessage(shownError)}
          </p>
        )}
        <Button type="submit" disabled={!canSubmit || signIn.isPending}>
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Forgot your password or lost your codes? Ask an admin for a reset link.
        </p>
      </form>
    </main>
  );
}
