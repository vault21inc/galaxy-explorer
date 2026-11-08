import { Link } from 'react-router';
import { StatusPanel } from '@/app/status-panel.tsx';

/** Any URL no route matches. */
export function NotFoundPage() {
  return (
    <StatusPanel tone="empty" title="Page not found">
      There's nothing at this address.{' '}
      <Link to="/" className="text-primary underline">
        See all universes
      </Link>
      .
    </StatusPanel>
  );
}
