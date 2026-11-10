import { useEffect } from 'react';
import { levelArrived } from '@/render/transition/transition-controller.ts';

/**
 * The orbit view's place in the levels registry until M6 brings the globe (rendering.md §8):
 * the canvas shows only the sky, and the page says the view is on its way. With no camera to
 * place, it tells the transition at once that it has arrived.
 */
export default function OrbitLevel() {
  useEffect(() => {
    levelArrived();
  }, []);
  return null;
}
