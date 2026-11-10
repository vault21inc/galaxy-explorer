import { SPACE_COLOR } from '../tuning.ts';
import { useTransition } from './transition-store.ts';

/**
 * The black fade between views (rendering.md §3–4): a DOM layer over the canvas and labels,
 * under the top bar, so the breadcrumbs stay readable. CSS animates its opacity, so a fade costs
 * no React renders and no canvas frames. While a change of view runs it takes pointer input,
 * so a click or a trackpad's leftover scrolling can't reach the canvas mid-swap.
 */
export function TransitionOverlay() {
  const { active, opacity, fadeMs } = useTransition();
  return (
    <div
      aria-hidden
      data-testid="transition-overlay"
      className="absolute inset-0"
      style={{
        backgroundColor: SPACE_COLOR,
        opacity,
        transition: `opacity ${fadeMs.toString()}ms ease-in-out`,
        pointerEvents: active ? 'auto' : 'none',
      }}
    />
  );
}
