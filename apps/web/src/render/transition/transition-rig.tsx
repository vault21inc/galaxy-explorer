import { CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { attachTransitionControls } from './transition-controller.ts';

/**
 * Hands the canvas's camera controls to the transition controller, which runs outside React
 * and flies the camera before each change of view.
 */
export function TransitionRig() {
  const controls = useThree((state) => state.controls);
  useEffect(() => {
    if (!(controls instanceof CameraControlsImpl)) return;
    attachTransitionControls(controls);
    return () => {
      attachTransitionControls(null);
    };
  }, [controls]);
  return null;
}
