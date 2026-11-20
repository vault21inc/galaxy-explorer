import { useAccountsEnabled } from '@/api/auth.ts';
import type { Universe } from '@/api/containers.ts';
import { useMemberSuggestions } from '@/api/sharing.ts';
import { LeaveUniverse } from './leave-universe.tsx';
import { PeopleList } from './people-list.tsx';
import { ShareLink } from './share-link.tsx';
import { TransferAndDelete } from './transfer-and-delete.tsx';
import { VisibilityChoice } from './visibility-choice.tsx';

/**
 * The settings page's "Sharing" (M8-T12, D-34, ux.md §13): who can see the universe, its share
 * link, the people it's shared with, and transferring or deleting it.
 *
 * - Its **owner** changes all of it.
 * - An **editor** sees it read-only, with "Leave this universe".
 * - On your own machine (no accounts) everything is yours already, so only deleting is offered.
 */
export function SharingSection({ universe }: { universe: Universe }) {
  const accounts = useAccountsEnabled();
  const owner = universe.access === 'own';
  // Names to offer in People and Transfer (D-59): the owner's known people, or, for an admin,
  // every active account.
  const suggestions = useMemberSuggestions(universe.id, accounts && owner).data ?? [];
  return (
    <section aria-labelledby="settings-sharing" className="flex flex-col gap-4">
      <h2 id="settings-sharing" className="text-xs text-muted-foreground label-caps">
        Sharing
      </h2>
      {accounts ? (
        <>
          <VisibilityChoice universe={universe} owner={owner} />
          {universe.visibility === 'link' && <ShareLink universe={universe} />}
          <PeopleList universe={universe} owner={owner} suggestions={suggestions} />
        </>
      ) : (
        <p className="max-w-xl text-muted-foreground">
          This site has no accounts, so there’s nobody to share with: everything here is yours.
        </p>
      )}
      {owner ? (
        <TransferAndDelete universe={universe} accounts={accounts} suggestions={suggestions} />
      ) : (
        universe.role !== null && <LeaveUniverse universe={universe} />
      )}
    </section>
  );
}
