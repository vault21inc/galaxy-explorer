/**
 * The height gizmo, as the other pointer handlers need to know it: while its handle is under
 * the pointer or being dragged, presses belong to it, not to selection or moving (M3-T3).
 */
import type { Object3D } from 'three';

interface GizmoLike {
  axis: string | null;
  dragging: boolean;
}

let gizmo: GizmoLike | null = null;
let anchor: Object3D | null = null;

export function setGizmo(next: GizmoLike | null, at: Object3D | null = null): void {
  gizmo = next;
  anchor = at;
}

/** The object the gizmo is attached to: the selection's center. */
export function gizmoAnchor(): Object3D | null {
  return anchor;
}

export function gizmoBusy(): boolean {
  return gizmo !== null && (gizmo.axis !== null || gizmo.dragging);
}

export function gizmoAxis(): string | null {
  return gizmo?.axis ?? null;
}
