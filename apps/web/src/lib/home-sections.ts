import type { Universe } from '@/api/containers.ts';

/**
 * Which list a universe goes in on the home page (ux.md §13): the reader's own, those shared
 * with them (or, for an admin, the installation's own that aren't public), and the public rest.
 */
export function homeSections(universes: readonly Universe[], username: string | null) {
  const yours = universes.filter((universe) => username !== null && universe.owner === username);
  const shared = universes.filter(
    (universe) =>
      !yours.includes(universe) && (universe.access !== 'read' || universe.visibility !== 'public'),
  );
  const rest = universes.filter(
    (universe) => !yours.includes(universe) && !shared.includes(universe),
  );
  return { yours, shared, rest };
}
