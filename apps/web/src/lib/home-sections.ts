import type { Universe } from '@/api/containers.ts';

/**
 * Whether the reader reaches this universe only by being an admin (D-50): someone else owns it
 * and hasn't shared it with them, yet they may edit it. Nobody else gets `edit` without a role.
 */
const reachedAsAdmin = (universe: Universe) =>
  universe.owner !== null && universe.role === null && universe.access === 'edit';

/**
 * Which list a universe goes in on the home page (ux.md §13):
 * - `yours`: the reader owns it;
 * - `shared`: it's shared with them (or, for an admin, it's the installation's own and not
 *   public);
 * - `others`: for an admin, other accounts' universes that aren't public and aren't shared with
 *   them (D-50), so they don't pass for shared ones;
 * - `rest`: the public rest.
 */
export function homeSections(universes: readonly Universe[], username: string | null) {
  const yours = universes.filter((universe) => username !== null && universe.owner === username);
  const notYours = universes.filter((universe) => !yours.includes(universe));
  const others = notYours.filter(
    (universe) => reachedAsAdmin(universe) && universe.visibility !== 'public',
  );
  const shared = notYours.filter(
    (universe) =>
      !reachedAsAdmin(universe) && (universe.access !== 'read' || universe.visibility !== 'public'),
  );
  const rest = notYours.filter(
    (universe) => !others.includes(universe) && !shared.includes(universe),
  );
  return { yours, shared, others, rest };
}
