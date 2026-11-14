import { Link } from 'react-router';
import { useAccount, useAccountsEnabled } from '@/api/auth.ts';
import { useUniverses } from '@/api/containers.ts';
import { homeSections } from '@/lib/home-sections.ts';
import { useCanCreate } from '@/editor/use-can-edit.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { UniverseList } from './universe-list.tsx';
import { NewUniverseForm } from './new-universe-form.tsx';

/** `/`: the universes this reader can open, and a form to start a new one (ux.md §9, §13). */
export function HomePage() {
  const universes = useUniverses();
  const accounts = useAccountsEnabled();
  const account = useAccount();
  const canCreate = useCanCreate();

  if (universes.error) {
    return (
      <StatusPanel
        tone="error"
        title="Couldn't load the universes"
        onRetry={() => void universes.refetch()}
      >
        {errorMessage(universes.error)}
      </StatusPanel>
    );
  }
  if (!universes.data) return <StatusPanel tone="loading" title="Loading universes…" />;

  const username = account.data?.username ?? null;
  // Without accounts, or signed out, there's one list: everything this reader can open.
  const sections =
    accounts && username !== null
      ? homeSections(universes.data, username)
      : { yours: [], shared: [], rest: universes.data };

  return (
    <main className="absolute top-16 left-4 flex max-h-[calc(100%-5rem)] w-80 flex-col gap-4 overflow-y-auto rounded-lg border bg-card p-4 text-sm">
      {sections.yours.length > 0 && (
        <UniverseList title="Your universes" universes={sections.yours} username={username} />
      )}
      {sections.shared.length > 0 && (
        <UniverseList
          title="Shared with you"
          universes={sections.shared}
          username={username}
          roles
        />
      )}
      <UniverseList
        title={username !== null && accounts ? 'Public universes' : 'Universes'}
        universes={sections.rest}
        username={username}
        empty={
          canCreate
            ? 'No universes yet. Start one below.'
            : accounts && username === null
              ? 'No public universes yet.'
              : 'No universes yet.'
        }
      />
      {accounts && username === null && (
        <p className="text-xs text-muted-foreground">
          <Link to="/login" className="text-primary underline">
            Sign in
          </Link>{' '}
          to see universes shared with you, or to start one.
        </p>
      )}
      {/* Anyone may start a universe on a server without accounts; with them, a signed-in
          account, which owns it, private (M8-T11). */}
      {canCreate && <NewUniverseForm />}
    </main>
  );
}
