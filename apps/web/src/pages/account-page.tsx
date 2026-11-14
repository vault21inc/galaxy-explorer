import { Link } from 'react-router';
import { useAccount, useAccountsEnabled } from '@/api/auth.ts';
import { StatusPanel } from '@/app/status-panel.tsx';
import { DevicesSection } from './account/devices-section.tsx';
import { PasswordSection } from './account/password-section.tsx';
import { StorageSection } from './account/storage-section.tsx';
import { TokensSection } from './account/tokens-section.tsx';

/**
 * `/account` (M8-T13, ux.md §13): the password, signed-in devices, API tokens (M8-T2) and
 * storage.
 */
export function AccountPage() {
  const accounts = useAccountsEnabled();
  const account = useAccount();
  if (!accounts) return <StatusPanel tone="empty" title="No accounts here" />;
  if (account.isPending) return <StatusPanel tone="loading" title="Loading…" />;
  if (!account.data) {
    return (
      <StatusPanel tone="empty" title="Not signed in">
        <Link to="/login?next=%2Faccount" className="text-primary underline">
          Sign in
        </Link>{' '}
        to see your account.
      </StatusPanel>
    );
  }
  return (
    <main className="absolute top-16 left-4 flex max-h-[calc(100%-5rem)] w-96 flex-col gap-6 overflow-y-auto rounded-lg border bg-card p-4 text-sm">
      <h1 className="text-base font-medium">{account.data.username}</h1>
      <PasswordSection />
      <DevicesSection />
      <TokensSection />
      <StorageSection />
    </main>
  );
}
