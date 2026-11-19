import { useSearchParams } from 'react-router';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { keptSearch } from '@/lib/kept-params.ts';
import { labelText, type Nameable } from '@/render/labels/label-text.ts';
import { useNavigation } from '@/state/navigation.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { viewPath } from '@/state/view-navigator.ts';

/** One open view, from the galaxy down: what the breadcrumbs and the location sheet list. */
export interface Crumb {
  key: string;
  level: string;
  /** Its name, redacted as labels are when it's a hidden spoiler. */
  text: string;
  /** Its page, with the query parameters that follow the reader (`perf`, `k`). */
  href: string;
  /** The view on top: where the reader is. */
  current: boolean;
  /** The view just above the current one: going there is going back up, as Esc does. */
  parent: boolean;
}

/**
 * The views open on this map, one crumb each (ux.md §1, §9). Names come from the top view's
 * payload, which lists the subject's ancestors, and follow the spoiler policy like labels do.
 * Shared by the breadcrumbs (app/breadcrumbs.tsx) and the slim bar's location sheet.
 */
export function useCrumbs(universeSlug: string, mapSlug: string, mapId: string): Crumb[] {
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
  const open = entries.length > 0 ? entries : [{ level: 'galaxy', subjectId: mapId }];

  return open.map((entry, index) => {
    const name = names.get(entry.subjectId);
    const objectId = entry.level === 'galaxy' ? null : entry.subjectId;
    return {
      key: `${entry.level}:${entry.subjectId}`,
      level: entry.level,
      text: entry.level === 'galaxy' ? 'Galaxy' : name ? labelText(name, policy) : '…',
      href: `${viewPath(universeSlug, mapSlug, objectId)}${kept}`,
      current: index === open.length - 1,
      parent: index === open.length - 2,
    };
  });
}
