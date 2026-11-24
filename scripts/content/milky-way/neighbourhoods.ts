import { callTool, describeTarget, field, listOf } from '../client.ts';
import {
  GROUP_TYPES,
  NEIGHBOURHOOD,
  NEIGHBOURHOODS,
  neighbourhoodMembers,
  UNIVERSE,
} from './plan.ts';

/**
 * Adds the neighbourhood groups (plan.ts) to a Milky Way that was built before they existed,
 * such as production's: `build` refuses a universe whose slug is taken, and a rebuild would
 * lose what the owner has edited since. A fresh `build` makes them itself.
 *
 * It finds the universe by its slug and each member by its name on the map (names in the
 * catalogue are unique), makes the group type if it's missing, then creates the groups and
 * their members in one `batch`: a dry run first, then for real, one undo step. A group already
 * there under its key is left as it is, so running this twice changes nothing.
 */
export async function addNeighbourhoods(): Promise<void> {
  console.log(`Adding neighbourhoods to ${UNIVERSE.slug}: ${describeTarget()}`);
  const universe = listOf(await callTool('universes_list', { limit: 1000 })).find(
    (row) => row.slug === UNIVERSE.slug,
  );
  if (!universe) throw new Error(`No universe "${UNIVERSE.slug}" there: run \`build\` instead.`);
  const universeId = String(universe.id);
  const [map] = listOf(await callTool('maps_list', { universeId }));
  if (!map) throw new Error('The universe has no map.');
  const mapId = String(map.id);

  const view = await callTool('view_galaxy', { mapId });
  const named = (key: string) =>
    (Array.isArray(field(view, key)) ? (field(view, key) as Record<string, unknown>[]) : []).map(
      (row) => ({ id: String(row.id), name: String(row.namePlain) }),
    );
  const objects = new Map(named('objects').map((row) => [row.name, row.id]));
  const existing = new Set(named('groups').map((row) => row.name));

  const types = async () =>
    listOf(await callTool('group_types_list', { universeId })).find(
      (row) => row.name === NEIGHBOURHOOD,
    );
  let type = await types();
  if (!type) {
    for (const [i, g] of GROUP_TYPES.entries())
      await callTool('group_types_create', { universeId, ...g, sortKey: i });
    type = await types();
  }
  if (!type) throw new Error(`The group type "${NEIGHBOURHOOD}" wasn't made.`);

  const operations: Record<string, unknown>[] = [];
  const members: Record<string, unknown>[] = [];
  for (const n of NEIGHBOURHOODS) {
    if (existing.has(n.name)) {
      console.log(`"${n.name}" is already there: left as it is.`);
      continue;
    }
    const ids = neighbourhoodMembers(n).flatMap((member) => {
      const id = objects.get(member.name);
      if (id === undefined) console.log(`  "${member.name}" isn't on the map: left out.`);
      return id === undefined ? [] : [{ objectId: id }];
    });
    console.log(`"${n.name}": ${String(ids.length)} members.`);
    members.push({ op: 'addMembers', id: `$op:${String(operations.length)}`, data: ids });
    operations.push({
      op: 'create',
      kind: 'group',
      mapId,
      data: {
        name: { format: 'plain', source: n.name },
        summary: { format: 'plain', source: n.summary },
        groupTypeId: String(type.id),
        outlineColor: n.color,
        externalKey: `mw-${n.key}`,
      },
    });
  }
  if (operations.length === 0) return;
  const batch = {
    description: 'Add the Milky Way’s neighbourhoods',
    operations: [...operations, ...members],
  };
  const dry = await callTool('batch', { ...batch, dryRun: true });
  console.log('Dry run:', JSON.stringify(field(dry, 'impact')));
  await callTool('batch', batch);
  console.log('Done.');
}
