import { useEffect } from 'react';
import { onLightsChange, writeLights, type lightUniforms } from './system-lights.ts';

/**
 * Keeps a lit material's light uniforms in step with the system's stars, and draws a frame
 * when they change (a star added, recolored or dragged). Writing uniforms allocates nothing.
 */
export function useLitUniforms(
  uniforms: ReturnType<typeof lightUniforms>,
  invalidate: () => void,
): void {
  useEffect(() => {
    const apply = () => {
      writeLights(uniforms);
      invalidate();
    };
    apply();
    return onLightsChange(apply);
  }, [uniforms, invalidate]);
}
