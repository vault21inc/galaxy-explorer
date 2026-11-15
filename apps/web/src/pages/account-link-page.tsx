import { ApiError } from '@ge/api-client';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAccountLink, type AccountLink, type TwoFactorSetup } from '@/api/auth.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { CodeStep } from './account-link/code-step.tsx';
import { PasswordStep } from './account-link/password-step.tsx';

/**
 * `/link/{token}` (M8-T1, ux.md §13): an invite or reset link an admin passed on. A username (an
 * invite) and a password, and whether to set up two-factor codes now (D-47); if so, a second
 * step sets them up, proved with one code. Only then is the account made, or its password and
 * codes replaced, and the browser signed in.
 */
export function AccountLinkPage() {
  const { token = '' } = useParams();
  const link = useAccountLink(token);

  if (link.error) {
    const gone = link.error instanceof ApiError && link.error.status === 404;
    return (
      <StatusPanel tone="error" title={gone ? 'This link doesn’t work' : 'Couldn’t open the link'}>
        {errorMessage(link.error)}
      </StatusPanel>
    );
  }
  if (!link.data) return <StatusPanel tone="loading" title="Opening the link…" />;
  if (link.data.state !== 'ready') {
    return (
      <StatusPanel
        tone="empty"
        title={link.data.state === 'used' ? 'This link was used' : 'This link has expired'}
      >
        Links work once, for a limited time. Ask an admin for a new one.{' '}
        <Link to="/login" className="text-primary underline">
          Sign in
        </Link>{' '}
        if you already have an account.
      </StatusPanel>
    );
  }
  return <LinkSteps token={token} link={link.data} />;
}

function LinkSteps({ token, link }: { token: string; link: AccountLink }) {
  const [twoFactor, setTwoFactor] = useState(false);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const title =
    link.purpose === 'invite'
      ? 'Make your account'
      : `A new password for ${link.username ?? 'your account'}`;
  return (
    <main className="absolute top-16 left-4 flex max-h-[calc(100%-5rem)] w-96 flex-col gap-3 overflow-y-auto rounded-lg border bg-card p-4 text-sm">
      <h1 className="text-base font-medium">{title}</h1>
      {twoFactor && <p className="text-xs text-muted-foreground">Step {setup ? '2' : '1'} of 2</p>}
      {setup ? (
        <CodeStep
          token={token}
          setup={setup}
          onRestart={() => {
            setSetup(null);
          }}
        />
      ) : (
        <PasswordStep
          token={token}
          link={link}
          twoFactor={twoFactor}
          onTwoFactorChange={setTwoFactor}
          onStarted={setSetup}
        />
      )}
    </main>
  );
}
