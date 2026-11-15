import { useAccessEvents, type AccessEvent } from '@/api/admin.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { formatWhen } from './format-when.ts';

/** What each logged action says, in the log's words (ux.md §13). */
const ACTION_NAMES: Record<AccessEvent['action'], string> = {
  'member.add': 'shared a universe',
  'member.role': 'changed a member’s role',
  'member.remove': 'removed a member',
  'member.leave': 'left a universe',
  'universe.visibility': 'changed who can see a universe',
  'universe.link': 'made a new share link',
  'universe.transfer': 'transferred a universe',
  'universe.delete': 'deleted a universe',
  'universe.takedown': 'took a universe down',
  'invite.create': 'made an invite',
  'user.reset': 'made a reset link',
  'user.disable': 'disabled an account',
  'user.enable': 'enabled an account',
  'user.role': 'changed an account’s role',
  'user.quota': 'changed a media quota',
  'user.delete': 'deleted an account',
  'user.password': 'changed their password',
  'user.two-factor.on': 'turned two-factor codes on',
  'user.two-factor.off': 'turned two-factor codes off',
  'token.create': 'made an API token',
  'token.revoke': 'revoked an API token',
};

/** To whom or what: the account and the universe, by their names now, or as logged. */
function subjectOf(event: AccessEvent): string {
  const text = (key: string) => (typeof event.detail[key] === 'string' ? event.detail[key] : null);
  const user = event.user ?? text('username') ?? text('to');
  const universe = event.universe ?? text('slug') ?? text('universe');
  // An API token's events (M8-T2) name the token too.
  const token = event.action.startsWith('token.') ? text('name') : null;
  return (
    [token && `“${token}”`, user, universe && `/u/${universe}`].filter(Boolean).join(' · ') || '—'
  );
}

/** The Log screen (M8-T13): account and access changes, newest first, 50 at a time. */
export function LogTab() {
  const events = useAccessEvents();
  const rows = events.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <section aria-label="Log" className="flex flex-col gap-3">
      {events.error && (
        <p role="alert" className="text-destructive">
          {errorMessage(events.error)}
        </p>
      )}
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Account and access changes, newest first</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">
              When
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Who
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              What
            </th>
            <th scope="col" className="py-1 font-medium">
              To whom or what
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((event) => (
            <tr key={event.id} className="border-t">
              <td className="py-1.5 pr-3 whitespace-nowrap">{formatWhen(event.createdAt)}</td>
              <td className="py-1.5 pr-3">{event.actor}</td>
              <td className="py-1.5 pr-3">{ACTION_NAMES[event.action]}</td>
              <td className="py-1.5">{subjectOf(event)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && !events.isPending && (
        <p className="text-muted-foreground">Nothing yet.</p>
      )}
      {events.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={events.isFetchingNextPage}
          onClick={() => void events.fetchNextPage()}
        >
          {events.isFetchingNextPage ? 'Loading…' : 'Older'}
        </Button>
      )}
    </section>
  );
}
