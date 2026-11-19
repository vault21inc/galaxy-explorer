import type { MouseEvent } from 'react';
import { Link } from 'react-router';
import { viewNavigation } from '@/state/view-navigator.ts';
import { useCrumbs } from './use-crumbs.ts';

interface BreadcrumbsProps {
  universeSlug: string;
  mapSlug: string;
  mapId: string;
}

/**
 * Where the reader is (ux.md §1, §9): one crumb per open view, from the galaxy down, named as
 * labels are (app/use-crumbs.ts). Every crumb but the last is a link up to that view. The slim
 * bar lists the same crumbs in its location sheet instead (app/location-sheet.tsx).
 */
export function Breadcrumbs({ universeSlug, mapSlug, mapId }: BreadcrumbsProps) {
  const crumbs = useCrumbs(universeSlug, mapSlug, mapId);
  return (
    <nav
      aria-label="Breadcrumbs"
      data-tour="breadcrumbs"
      // Shrinks before anything else in the bar: the crumbs above the current view first.
      className="ml-2 min-w-0 shrink-[4] text-sm whitespace-nowrap text-muted-foreground"
    >
      <ol className="flex min-w-0 items-center gap-1.5">
        {crumbs.map((crumb, index) => {
          // A separator drawn by CSS, so it isn't part of the crumbs' text.
          const separator = index > 0 ? "before:mr-1.5 before:content-['›']" : '';
          // The parent crumb goes up the way Esc does, back through history when it can.
          const up = (event: MouseEvent) => {
            if (!crumb.parent) return;
            event.preventDefault();
            viewNavigation.exit();
          };
          return (
            <li
              key={crumb.key}
              title={crumb.text}
              // The current view keeps up to 24 characters and never shrinks; the ones above
              // it give way, down to a few letters and an ellipsis.
              className={`${separator} truncate ${crumb.current ? 'max-w-[24ch] shrink-0' : 'min-w-[4ch] shrink'}`}
            >
              {crumb.current ? (
                <span aria-current="page" className="text-foreground">
                  {crumb.text}
                </span>
              ) : (
                <Link
                  to={crumb.href}
                  onClick={up}
                  className="pointer-events-auto hover:text-foreground hover:underline"
                >
                  {crumb.text}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
