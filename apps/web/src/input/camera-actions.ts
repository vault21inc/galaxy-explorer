import { CameraControlsImpl } from '@react-three/drei';
import type { Action } from './bindings.ts';

const { ACTION } = CameraControlsImpl;

type Controls = InstanceType<typeof CameraControlsImpl>;
export type ButtonAction = Controls['mouseButtons']['left'];
export type WheelAction = Controls['mouseButtons']['wheel'];
export type Touches = Controls['touches'];

/**
 * Bindings actions as camera-controls actions. Everything that isn't camera movement (select,
 * box-select, move…) is NONE: camera-controls ignores the press, and the editor or picker
 * handles it instead.
 */
export function buttonAction(action: Action): ButtonAction {
  switch (action) {
    case 'rotate':
      return ACTION.ROTATE;
    case 'pan':
      return ACTION.TRUCK;
    case 'zoom':
      return ACTION.DOLLY;
    default:
      return ACTION.NONE;
  }
}

export function wheelAction(action: Action): WheelAction {
  return action === 'zoom' ? ACTION.DOLLY : ACTION.NONE;
}

/**
 * Touch: one finger and two fingers. Two fingers both pan and pinch-zoom at once in
 * camera-controls (TOUCH_DOLLY_TRUCK), which is what the bindings ask for.
 */
export function touchActions(oneFinger: Action, twoFingers: Action, pinch: Action): Touches {
  const one =
    oneFinger === 'rotate'
      ? ACTION.TOUCH_ROTATE
      : oneFinger === 'pan'
        ? ACTION.TOUCH_TRUCK
        : ACTION.NONE;
  const zoom = pinch === 'zoom';
  const pan = twoFingers === 'pan';
  const two =
    zoom && pan
      ? ACTION.TOUCH_DOLLY_TRUCK
      : zoom
        ? ACTION.TOUCH_DOLLY
        : pan
          ? ACTION.TOUCH_TRUCK
          : ACTION.NONE;
  return { one, two, three: ACTION.NONE };
}
