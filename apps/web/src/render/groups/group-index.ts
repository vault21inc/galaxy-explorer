import { createDrawnIndex } from '../drawn-index.ts';
import type { GroupShape } from './group-shapes.ts';

/**
 * The groups drawn now (M4-T3), like the objects' scene index: `GroupOutlines` publishes its
 * shapes; the label layer reads their anchors after each frame, the selection rings ring a
 * selected group's members (M4-T4), and the test hooks report them.
 */
const index = createDrawnIndex<GroupShape>();

export const publishGroups = index.publish;
export const drawnGroups = index.all;
export const drawnGroup = index.get;
export const onGroupsChange = index.onChange;
/** The drawn groups, as React state: components re-render when they change. */
export const useDrawnGroups = index.useAll;
