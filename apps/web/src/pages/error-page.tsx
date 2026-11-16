import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router';
import { StatusPanel } from '@/app/status-panel.tsx';

/**
 * What a page shows when it fails as it draws (M8-T9), instead of React Router's developer
 * page: a plain apology, a reload and a way home. The likeliest cause after a release is a
 * page's code that the new build replaced, which a reload fetches again. The error goes to the
 * console for whoever debugs it; the reader isn't shown a stack.
 */
export function ErrorPage() {
  const error = useRouteError();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusPanel
      tone="error"
      title="Something went wrong"
      onRetry={() => {
        window.location.reload();
      }}
    >
      This page stopped working. Reloading usually fixes it, or{' '}
      <Link to="/" reloadDocument className="text-primary underline">
        see all universes
      </Link>
      .
    </StatusPanel>
  );
}
