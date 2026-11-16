import type { MouseEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { labelText, type Nameable } from '@/render/labels/label-text.ts';
import { useNavigation } from '@/state/navigation.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { viewNavigation, viewPath } from '@/state/view-navigator.ts';
import { keptSearch } from '@/lib/kept-params.ts';

interface BreadcrumbsProps {
  universeSlug: string;
  mapSlug: string;
  mapId: string;
}

/**
 * Where the reader is (ux.md §1, §9): one crumb per open view, from the galaxy down. Names come
 * from the top view's payload, which lists the subject's ancestors, and follow the spoiler
 * policy like labels do: a hidden spoiler's name is redacted. Every crumb but the last is a link
 * up to that view.
 */
export function Breadcrumbs({ universeSlug, mapSlug, mapId }: BreadcrumbsProps) {
  const stack = useNavigation((state) => state.stack);
  const policy = useSpoilerPolicy();
  const [searchParams] = useSearchParams();
  // While another map's views are still shown (just switched), only this map's galaxy.
  const entries = stack[0]?.subjectId === mapId ? stack : [];
  const top = entries.at(-1);
  // Narrowed through a local: the galaxy view has no subject object, so no names to load.
  const level = top?.level;
  const subjectLevel = level === undefined || level === 'galaxy' ? 'system' : level;
  const subjectId = level === undefined || level === 'galaxy' ? undefined : top?.subjectId;
  const view = useViewPayload(subjectLevel, subjectId, useReadOptions());

  const names = new Map<string, Nameable>();
  if (view.data) {
    for (const item of [...view.data.ancestors, view.data.subject]) names.set(item.id, item);
  }
  const kept = keptSearch(searchParams.toString());
  const crumbs = entries.length > 0 ? entries : [{ level: 'galaxy', subjectId: mapId }];

  return (
    <nav
      aria-label="Breadcrumbs"
      data-tour="breadcrumbs"
      className="ml-2 text-sm text-muted-foreground"
    >
      <ol className="flex items-center gap-1.5">
        {crumbs.map((entry, index) => {
          const name = names.get(entry.subjectId);
          const text = entry.level === 'galaxy' ? 'Galaxy' : name ? labelText(name, policy) : '…';
          const last = index === crumbs.length - 1;
          const parent = index === crumbs.length - 2;
          // A separator drawn by CSS, so it isn't part of the crumbs' text.
          const separator = index > 0 ? "before:mr-1.5 before:content-['›']" : '';
          const objectId = entry.level === 'galaxy' ? null : entry.subjectId;
          // The parent crumb goes up the way Esc does, back through history when it can.
          const up = (event: MouseEvent) => {
            if (!parent) return;
            event.preventDefault();
            viewNavigation.exit();
          };
          return (
            <li key={`${entry.level}:${entry.subjectId}`} className={separator}>
              {last ? (
                <span aria-current="page" className="text-foreground">
                  {text}
                </span>
              ) : (
                <Link
                  to={`${viewPath(universeSlug, mapSlug, objectId)}${kept}`}
                  onClick={up}
                  className="pointer-events-auto hover:text-foreground hover:underline"
                >
                  {text}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
