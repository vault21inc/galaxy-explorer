import { Link } from 'react-router';
import { ApiError } from '@ge/api-client';
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
      return (
        <StatusPanel tone="empty" title={`No ${route.what} called “${route.slug}”`}>
          It may have been renamed or deleted.{' '}
          <Link to="/" className="text-primary underline">
            See all universes
          </Link>
          .
        </StatusPanel>
      );
  }
}

/** A readable message for a failed request: the API's problem detail when there is one. */
export function errorMessage(error: Error): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  return 'The server could not be reached. Check that the API is running.';
}
