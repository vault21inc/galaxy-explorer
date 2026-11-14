import { Link, useLocation } from 'react-router';
import { ApiError } from '@ge/api-client';
import { useAccount, useAccountsEnabled } from '@/api/auth.ts';
import { StatusPanel } from './status-panel.tsx';
import type { UniverseRoute } from './use-universe-route.ts';

/**
 * What a route under `/u/…` shows until its universe and map are resolved, or when they can't
 * be. Pages render it for every status but 'ready'.
 */
export function RouteStates({ route }: { route: Exclude<UniverseRoute, { status: 'ready' }> }) {
  switch (route.status) {
    case 'loading':
      return <StatusPanel tone="loading" title="Loading…" />;
    case 'error':
      return (
        <StatusPanel tone="error" title="Couldn't load this universe" onRetry={route.retry}>
          {errorMessage(route.error)}
        </StatusPanel>
      );
    case 'missing':
      return <Missing what={route.what} slug={route.slug} />;
  }
}

/**
 * "Not found", which is also what a universe the reader can't see looks like (M8-T11): it never
 * says that something private is there. Signed out, it offers to sign in and come back.
 */
function Missing({ what, slug }: { what: 'universe' | 'map'; slug: string }) {
  const accounts = useAccountsEnabled();
  const account = useAccount();
  const location = useLocation();
  const signedOut = accounts && account.data === null;
  const next = encodeURIComponent(`${location.pathname}${location.search}`);
  return (
    <StatusPanel tone="empty" title={`No ${what} called “${slug}”`}>
      It may have been renamed or deleted.{' '}
      {signedOut && (
        <>
          <Link to={`/login?next=${next}`} className="text-primary underline">
            Sign in
          </Link>{' '}
          if it was shared with you, or{' '}
        </>
      )}
      <Link to="/" className="text-primary underline">
        {signedOut ? 'see all universes' : 'See all universes'}
      </Link>
      .
    </StatusPanel>
  );
}

/** A readable message for a failed request: the API's problem detail when there is one. */
export function errorMessage(error: Error): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  return 'The server could not be reached. Check that the API is running.';
}
