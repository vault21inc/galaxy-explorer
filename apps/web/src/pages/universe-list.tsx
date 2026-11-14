import { useId } from 'react';
import { Link } from 'react-router';
import type { Universe } from '@/api/containers.ts';
import { containerName } from '@/lib/container-name.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';

interface UniverseListProps {
  title: string;
  universes: readonly Universe[];
  /** The signed-in username, so others' universes say whose they are. */
  username: string | null;
  /** Show the reader's role in each (Shared with you). */
  roles?: boolean;
  /** Said when there are none; without it, an empty list isn't shown at all. */
  empty?: string;
}

const ROLE_NAMES: Record<Universe['access'], string> = {
  own: 'Admin',
  edit: 'Editor',
  read: 'Viewer',
};

/**
 * One of the home page's lists of universes (ux.md §13): each with a small badge when it's
 * Private or Link-only, and "by {owner}" when it isn't the reader's.
 */
export function UniverseList({
  title,
  universes,
  username,
  roles = false,
  empty,
}: UniverseListProps) {
  const id = useId();
  const policy = useSpoilerPolicy();
  if (universes.length === 0 && empty === undefined) return null;
  return (
    <section aria-labelledby={id}>
      <h1 id={id} className="mb-2 text-xs text-muted-foreground label-caps">
        {title}
      </h1>
      {universes.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {universes.map((universe) => (
            <li key={universe.id}>
              <Link
                to={`/u/${universe.slug}`}
                className="flex items-baseline gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus-visible:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate">{containerName(universe, policy)}</span>
                {universe.visibility !== 'public' && (
                  <span className="rounded-sm border px-1 text-[10px] text-muted-foreground">
                    {universe.visibility === 'link' ? 'Link-only' : 'Private'}
                  </span>
                )}
                {roles && (
                  <span className="text-xs text-muted-foreground">
                    {ROLE_NAMES[universe.access]}
                  </span>
                )}
              </Link>
              {universe.owner !== null && universe.owner !== username && (
                <p className="px-2 text-xs text-muted-foreground">by {universe.owner}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
