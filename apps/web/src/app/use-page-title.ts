import { pageTitle } from '@ge/domain';
import { useEffect } from 'react';

/**
 * The browser tab's title for a page (M8-T9), as the link previews have it: the most
 * particular part first, then the site, "Gudrun · M41 · Eisenhorn · Galaxy Explorer". Empty
 * parts are left out, so a page can pass a name it hasn't loaded yet, or one hidden as a
 * spoiler. Leaving the page puts the site's own title back, for a page that sets none.
 *
 * One component per page sets it: child components' effects run before their parents', so a
 * parent's title would replace a child's.
 */
export function usePageTitle(parts: readonly (string | null | undefined)[] | null): void {
  // Null: another component on the page names it (a system view names its subject).
  const title = parts === null ? null : pageTitle(parts);
  useEffect(() => {
    if (title === null) return;
    document.title = title;
    return () => {
      document.title = pageTitle([]);
    };
  }, [title]);
}
