import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { attachRecorder } from './record-move.ts';

/**
 * Hands the canvas's state to the clip recorder (record-move.ts, D-56), which runs outside
 * React and draws the canvas frame by frame itself.
 */
export function CaptureRecorderRig() {
  const get = useThree((state) => state.get);
  useEffect(() => {
    attachRecorder(get);
    return () => {
      attachRecorder(null);
    };
  }, [get]);
  return null;
}
