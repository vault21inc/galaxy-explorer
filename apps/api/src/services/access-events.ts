import { schema, type Executor } from '@ge/db';
import type { AccessEventAction } from '@ge/domain';
import type { Requester } from './access.ts';

/**
 * The account and access log (M8-T12, data-model §3.8): one row per change to who may reach a
 * universe, written in the same transaction as the change. The admin screens show it (M8-T13).
 */

export interface AccessEvent {
  action: AccessEventAction;
  /** The account it concerns, if any: the member added or removed, the new owner. */
  userId?: string | null;
  universeId?: string | null;
  /** What changed, with names as well as ids, so the row still reads after a deletion. */
  detail?: Record<string, unknown>;
}

/** Who an event is recorded as: the account, or `local` on your own machine. */
function actorOf(requester: Requester): { actorId: string | null; actorLabel: string } {
  if (requester.kind === 'account') {
    return { actorId: requester.account.id, actorLabel: requester.account.username };
  }
  // Anonymous visitors change nothing; the routes refuse them long before this.
  if (requester.kind === 'anonymous') throw new Error('An anonymous visitor changed access.');
  return { actorId: null, actorLabel: 'local' };
}

export async function recordAccessEvent(
  ex: Executor,
  requester: Requester,
  event: AccessEvent,
): Promise<void> {
  await ex.insert(schema.accessEvents).values({
    ...actorOf(requester),
    action: event.action,
    userId: event.userId ?? null,
    universeId: event.universeId ?? null,
    detail: event.detail ?? {},
  });
}

/** An event done on the server's command line (`pnpm admin:invite`, `admin:reset-link`). */
export async function recordCliEvent(ex: Executor, event: AccessEvent): Promise<void> {
  await ex.insert(schema.accessEvents).values({
    actorId: null,
    actorLabel: 'cli',
    action: event.action,
    userId: event.userId ?? null,
    universeId: event.universeId ?? null,
    detail: event.detail ?? {},
  });
}
