import {
  isHidden,
  objectTypes,
  spoilerKeys,
  type SpoilerPolicy,
  type ViewGroup,
  type ViewGroupType,
  type ViewObject,
  type ViewRoute,
} from '@ge/domain';
import { labelText } from '@/render/labels/label-text.ts';

/**
 * The outliner's rows (M4-T4, ux.md §1): layer › group type › group › nested groups and member
 * objects, then the routes (M4-T7), then the objects in no group. Pure, so it's unit-tested. Rows come in display order
 * (each parent before its children), each with its depth and parent, which is all the ARIA tree
 * needs: it's drawn flat, with `aria-level`, and collapsing a row hides its descendants.
 */
export interface OutlinerRow {
  /** Unique per row: an object in groups of two layers has two rows. */
  key: string;
  /** The entity a click selects; null for layer and group type rows, which only expand. */
  id: string | null;
  kind: 'layer' | 'type' | 'group' | 'route' | 'object';
  /** What's shown: the name, or a redaction bar for a hidden spoiler (as the 3D labels do). */
  text: string;
  hidden: boolean;
  /** The small caps on the right: an object's type, or a group's own member count (if any). */
  badge: string;
  draft: boolean;
  spoiler: boolean;
  level: number;
  parentKey: string | null;
  childCount: number;
}

type Group = Pick<
  ViewGroup,
  | 'id'
  | 'parentGroupId'
  | 'groupTypeId'
  | 'members'
  | 'status'
  | 'isSpoiler'
  | 'namePlain'
  | 'nameSpoiler'
  | 'nameRedacted'
>;
type GroupType = Pick<ViewGroupType, 'id' | 'name' | 'layer' | 'sortKey'>;
type Route = Pick<
  ViewRoute,
  'id' | 'waypoints' | 'status' | 'isSpoiler' | 'namePlain' | 'nameSpoiler' | 'nameRedacted'
>;

const byText = (a: { text: string }, b: { text: string }) => a.text.localeCompare(b.text);

function objectRow(
  object: ViewObject,
  policy: SpoilerPolicy,
  key: string,
  level: number,
  parentKey: string | null,
): OutlinerRow {
  return {
    key,
    id: object.id,
    kind: 'object',
    text: labelText(object, policy),
    hidden: isHidden(object.isSpoiler, spoilerKeys.record(object.id), policy),
    badge: objectTypes[object.baseType].label,
    draft: object.status === 'draft',
    spoiler: object.isSpoiler || object.nameSpoiler,
    level,
    parentKey,
    childCount: 0,
  };
}

/** Every row of the tree, in display order. */
export function outlinerRows(
  objects: readonly ViewObject[],
  groups: readonly Group[],
  groupTypes: readonly GroupType[],
  policy: SpoilerPolicy,
  routes: readonly Route[] = [],
): OutlinerRow[] {
  const objectsById = new Map(objects.map((object) => [object.id as string, object]));
  const groupIds = new Set(groups.map((group) => group.id as string));
  const childrenOf = new Map<string, Group[]>();
  for (const group of groups) {
    if (group.parentGroupId === null || !groupIds.has(group.parentGroupId)) continue;
    const list = childrenOf.get(group.parentGroupId) ?? [];
    list.push(group);
    childrenOf.set(group.parentGroupId, list);
  }
  const rows: OutlinerRow[] = [];
  const placed = new Set<string>();

  // A group, then its nested groups, then its own members. `placed` stops a cycle of parents.
  const addGroup = (group: Group, parentKey: string, level: number) => {
    if (placed.has(group.id)) return;
    placed.add(group.id);
    const key = `group:${group.id}`;
    const nested = (childrenOf.get(group.id) ?? [])
      .map((child) => ({ child, text: labelText(child, policy) }))
      .toSorted(byText);
    const members = group.members
      .flatMap((member) => {
        const object = objectsById.get(member.objectId);
        return object ? [objectRow(object, policy, `${key}/${object.id}`, level + 1, key)] : [];
      })
      .toSorted(byText);
    rows.push({
      key,
      id: group.id,
      kind: 'group',
      text: labelText(group, policy),
      hidden: isHidden(group.isSpoiler, spoilerKeys.record(group.id), policy),
      badge: members.length > 0 ? members.length.toString() : '',
      draft: group.status === 'draft',
      spoiler: group.isSpoiler || group.nameSpoiler,
      level,
      parentKey,
      childCount: nested.length + members.length,
    });
    for (const { child } of nested) addGroup(child, key, level + 1);
    rows.push(...members);
  };

  // Layers in the order of their first group type, then each layer's types in settings order.
  const types = groupTypes.toSorted((a, b) => a.sortKey - b.sortKey);
  const layers = [...new Set(types.map((type) => type.layer))];
  for (const layer of layers) {
    const layerKey = `layer:${layer}`;
    const layerIndex = rows.length;
    rows.push({
      key: layerKey,
      id: null,
      kind: 'layer',
      text: layer,
      hidden: false,
      badge: 'Layer',
      draft: false,
      spoiler: false,
      level: 1,
      parentKey: null,
      childCount: 0,
    });
    let typeCount = 0;
    for (const type of types.filter((item) => item.layer === layer)) {
      // Groups nested in another group appear under it instead.
      const roots = groups
        .filter(
          (group) =>
            group.groupTypeId === type.id &&
            (group.parentGroupId === null || !groupIds.has(group.parentGroupId)),
        )
        .map((group) => ({ group, text: labelText(group, policy) }))
        .toSorted(byText);
      if (roots.length === 0) continue;
      const typeKey = `type:${type.id}`;
      rows.push({
        key: typeKey,
        id: null,
        kind: 'type',
        text: type.name,
        hidden: false,
        badge: '',
        draft: false,
        spoiler: false,
        level: 2,
        parentKey: layerKey,
        childCount: roots.length,
      });
      typeCount++;
      for (const { group } of roots) addGroup(group, typeKey, 3);
    }
    const layerRow = rows[layerIndex];
    // A layer with no groups yet says nothing: leave it out.
    if (typeCount === 0) rows.splice(layerIndex, 1);
    else if (layerRow) layerRow.childCount = typeCount;
  }

  // Then the routes, under a row of their own, each with its number of waypoints.
  if (routes.length > 0) {
    rows.push({
      key: 'routes',
      id: null,
      kind: 'layer',
      text: 'Routes',
      hidden: false,
      badge: '',
      draft: false,
      spoiler: false,
      level: 1,
      parentKey: null,
      childCount: routes.length,
    });
    rows.push(
      ...routes
        .map((route): OutlinerRow => ({
          key: `route:${route.id}`,
          id: route.id,
          kind: 'route',
          text: labelText(route, policy),
          hidden: isHidden(route.isSpoiler, spoilerKeys.record(route.id), policy),
          badge: route.waypoints.length.toString(),
          draft: route.status === 'draft',
          spoiler: route.isSpoiler || route.nameSpoiler,
          level: 2,
          parentKey: 'routes',
          childCount: 0,
        }))
        .toSorted(byText),
    );
  }

  // Then every object in no group at all.
  const grouped = new Set(groups.flatMap((group) => group.members.map((m) => m.objectId)));
  rows.push(
    ...objects
      .filter((object) => !grouped.has(object.id))
      .map((object) => objectRow(object, policy, `object:${object.id}`, 1, null))
      .toSorted(byText),
  );
  return rows;
}

/** Layers and group types start open, groups closed, so the tree starts compact. */
export function openByDefault(row: OutlinerRow): boolean {
  return row.kind === 'layer' || row.kind === 'type';
}

/** The rows shown when only some parents are open: a closed row hides everything below it. */
export function visibleRows(
  rows: readonly OutlinerRow[],
  isOpen: (row: OutlinerRow) => boolean,
): OutlinerRow[] {
  const shown: OutlinerRow[] = [];
  let hiddenBelow = Infinity;
  for (const row of rows) {
    if (row.level > hiddenBelow) continue;
    hiddenBelow = Infinity;
    shown.push(row);
    if (row.childCount > 0 && !isOpen(row)) hiddenBelow = row.level;
  }
  return shown;
}

/** The keys of a row's ancestors, nearest first: what to open to show it. */
export function ancestorsOf(rows: readonly OutlinerRow[], key: string): string[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const found: string[] = [];
  let parent = byKey.get(key)?.parentKey ?? null;
  while (parent !== null) {
    found.push(parent);
    parent = byKey.get(parent)?.parentKey ?? null;
  }
  return found;
}
