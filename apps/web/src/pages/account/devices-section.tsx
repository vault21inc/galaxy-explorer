import { useId } from 'react';
import { useEndSessions, useSessions } from '@/api/account.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { formatWhen } from '../admin/format-when.ts';

/** A browser's own name for itself, shortened to what tells devices apart. */
function deviceName(userAgent: string | null): string {
  if (!userAgent) return 'A device';
  const has = (part: string) => userAgent.includes(part);
  // Order matters: Edge says Chrome too, and Chrome says Safari.
  const browser = has('Edg/')
    ? 'Edge'
    : has('Firefox/')
      ? 'Firefox'
      : has('Chrome/')
        ? 'Chrome'
        : has('Safari/')
          ? 'Safari'
          : 'A browser';
  const systems: [string, string][] = [
    ['iPhone', 'iOS'],
    ['iPad', 'iOS'],
    ['Mac OS X', 'macOS'],
    ['Android', 'Android'],
    ['Windows', 'Windows'],
    ['Linux', 'Linux'],
  ];
  const system = systems.find(([part]) => has(part))?.[1];
  return system ? `${browser} on ${system}` : browser;
}

/** Signed-in devices (ux.md §13): each with its browser and last use, and signing them out. */
export function DevicesSection() {
  const id = useId();
  const sessions = useSessions();
  const end = useEndSessions();
  const others = (sessions.data ?? []).filter((session) => !session.current);
  const failure = sessions.error ?? end.error;
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-xs text-muted-foreground label-caps">
        Signed-in devices
      </h2>
      {failure && (
        <p role="alert" className="text-destructive">
          {errorMessage(failure)}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {(sessions.data ?? []).map((session) => (
          <li key={session.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p>
                {deviceName(session.userAgent)}
                {session.current && <span className="text-muted-foreground"> (this one)</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                Last used {formatWhen(session.lastSeenAt)}
              </p>
            </div>
            {!session.current && (
              <Button
                size="sm"
                variant="outline"
                aria-label={`Sign out ${deviceName(session.userAgent)}, last used ${formatWhen(session.lastSeenAt)}`}
                disabled={end.isPending}
                onClick={() => {
                  end.mutate(session.id);
                }}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      {others.length > 1 && (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          disabled={end.isPending}
          onClick={() => {
            end.mutate(undefined);
          }}
        >
          Sign out all other devices
        </Button>
      )}
    </section>
  );
}
