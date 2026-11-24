import { Link } from 'react-router';
import { StatusPanel } from '@/app/status-panel.tsx';
import { useNoIndex } from '@/app/use-no-index.ts';
import { usePageTitle } from '@/app/use-page-title.ts';

/**
 * Any URL no route matches. The site answers it with the app and a 200, as it does every
 * address, so the page asks search engines not to keep it (D-62); otherwise Google counts it
 * as a "soft 404", a page that says "not found" but isn't one.
 */
export function NotFoundPage() {
  usePageTitle(['Page not found']);
  useNoIndex(true);
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
