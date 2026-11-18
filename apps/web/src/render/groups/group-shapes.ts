import {
  isHidden,
  outlineForGroup,
  ringForGroup,
  spoilerKeys,
  type GroupFigure,
  type PlanePoint,
  type SpoilerPolicy,
  type ViewGroup,
  type ViewObject,
} from '@ge/domain';
import { labelText } from '../labels/label-text.ts';
import {
  GROUP_FILL_OPACITY,
  GROUP_LINE_WIDTH_PX,
  GROUP_OUTLINE_NESTING_SHARE,
  GROUP_OUTLINE_PADDING_SHARE,
  GROUP_RING_LABEL_DEG,
  GROUP_RING_STEP_DEG,
  REDACTION_COLOR,
} from '../tuning.ts';

/**
 * One group as drawn: its outline, look and label (rendering.md §6, M4-T3). Hulls and rings
 * (D-53) share this form, so the buffers and the label layer never ask which shape it is.
 */
export interface GroupShape {
  id: string;
  /** 'hull' around the members, or a 'ring' around a centre (D-53). */
  kind: 'hull' | 'ring';
  /** The closed lines on the plane, [x, z] in light-years: one for a hull or disc, two for a ring. */
  loops: PlanePoint[][];
  /** The fill's points on the plane and three indices into them per triangle. */
  fill: GroupFigure['fill'];
  /** A ring's centre and radii as drawn, for the test hooks; null for a hull. */
  ring: { center: PlanePoint; innerRadiusLy: number; outerRadiusLy: number } | null;
  /** The plane's height: the members' mean y (0 with none). */
  y: number;
  color: string;
  dashed: boolean;
  widthPx: number;
  fillOpacity: number;
  /** Where the label goes, at the plane's height: a hull's area centroid, or on a ring's band. */
  labelAnchor: [number, number, number];
  label: string;
  /** Members inside the outline, own and nested: larger groups' labels win (rendering.md §11). */
  memberCount: number;
  /** Those members' ids, for the rings around a selected group's members (M4-T4). */
  memberIds: string[];
  /** A hidden spoiler group: grey, with a redacted label (ux.md §7). */
  redacted: boolean;
}

type Group = Pick<
  ViewGroup,
  | 'id'
  | 'parentGroupId'
  | 'members'
  | 'outlineColor'
  | 'style'
  | 'isSpoiler'
  | 'namePlain'
  | 'nameSpoiler'
  | 'nameRedacted'
>;
type Placed = Pick<ViewObject, 'id' | 'position'>;

/**
 * Every group's shape, from the galaxy view's groups and objects. A group's outline encloses
 * its own members and every member of the groups nested inside it, padded more for each level
 * of nesting below it, so outlines nest visibly. While spoilers are hidden, a member whose
 * membership is a spoiler is left out (ux.md §7), and a spoiler group is drawn grey with a
 * redaction bar for a label. Groups with nothing to enclose aren't drawn, except a ring whose
 * outer radius is pinned (D-53): a ring group is the band around the galaxy's centre that its
 * members lie in, from `ringForGroup()`, instead of a hull around them.
 */
export function groupShapes(
  groups: readonly Group[],
  objects: readonly Placed[],
  policy: SpoilerPolicy,
  galaxyRadiusLy: number,
): GroupShape[] {
  const positions = new Map(objects.map((object) => [object.id as string, object.position]));
  const children = new Map<string, Group[]>();
  for (const group of groups) {
    if (group.parentGroupId === null) continue;
    const list = children.get(group.parentGroupId) ?? [];
    list.push(group);
    children.set(group.parentGroupId, list);
  }

  // A group's own visible members, with their positions.
  const own = (group: Group) =>
    group.members.flatMap((member) => {
      const hidden = isHidden(
        member.isSpoiler,
        spoilerKeys.member(group.id, member.objectId),
        policy,
      );
      const position = positions.get(member.objectId);
      return !hidden && position ? [{ id: member.objectId, position }] : [];
    });

  // Members of the group and its descendants, and how many levels lie below it. `seen` stops a
  // cycle of parents (the server prevents them; a stale view shouldn't hang the page).
  const collect = (group: Group, seen: Set<string>) => {
    const points = own(group);
    let depth = 0;
    for (const child of children.get(group.id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      const below = collect(child, seen);
      points.push(...below.points);
      depth = Math.max(depth, below.depth + 1);
    }
    return { points, depth };
  };

  return groups.flatMap((group): GroupShape[] => {
    const collected = collect(group, new Set([group.id]));
    // An object can be in a group and in one nested inside it (they're of different types).
    const members = [...new Map(collected.points.map((member) => [member.id, member])).values()];
    const { depth } = collected;
    const points = members.map((member) => member.position);
    const plane = points.map(([x, , z]): PlanePoint => [x, z]);
    const paddingLy =
      galaxyRadiusLy * (GROUP_OUTLINE_PADDING_SHARE + depth * GROUP_OUTLINE_NESTING_SHARE);
    const isRing = group.style.shape === 'ring';
    // A ring with a pinned outer radius is drawn with no members; a hull needs one.
    const figure = isRing
      ? ringForGroup(plane, {
          paddingLy,
          ring: group.style.ring,
          stepDeg: GROUP_RING_STEP_DEG,
          labelDeg: GROUP_RING_LABEL_DEG,
        })
      : outlineForGroup(plane, { paddingLy });
    if (!figure) return [];
    const y =
      points.length === 0 ? 0 : points.reduce((sum, point) => sum + point[1], 0) / points.length;
    const redacted = isHidden(group.isSpoiler, spoilerKeys.record(group.id), policy);
    return [
      {
        id: group.id,
        kind: isRing ? 'ring' : 'hull',
        loops: figure.loops,
        fill: figure.fill,
        ring:
          'innerRadiusLy' in figure
            ? {
                center: figure.center,
                innerRadiusLy: figure.innerRadiusLy,
                outerRadiusLy: figure.outerRadiusLy,
              }
            : null,
        y,
        color: redacted ? REDACTION_COLOR : group.outlineColor,
        dashed: group.style.dashed ?? false,
        widthPx: group.style.lineWidthPx ?? GROUP_LINE_WIDTH_PX,
        fillOpacity: group.style.fillOpacity ?? GROUP_FILL_OPACITY,
        labelAnchor: [figure.label[0], y, figure.label[1]],
        label: labelText(group, policy),
        memberCount: members.length,
        memberIds: members.map((member) => member.id),
        redacted,
      },
    ];
  });
}
