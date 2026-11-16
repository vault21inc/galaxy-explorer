import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useEditor } from '@/state/editor.ts';
import { COMPLETIONS } from './completions.ts';
import { TourFinish } from './tour-finish.tsx';
import { TourHighlight } from './tour-highlight.tsx';
import { TourOffers } from './tour-offer.tsx';
import { TourPopover } from './tour-popover.tsx';
import { useTour } from './tour-store.ts';
import { TOURS } from './tours.ts';
import { useTarget } from './use-target.ts';

/**
 * A short pause between doing what a step asks and the next step, so the reader sees what
 * they did take effect before the popover moves on.
 */
const ADVANCE_DELAY_MS = 400;

/**
 * The guided tours on the page (M8-T10, ux.md §12): the first-visit offers, the step showing
 * with its highlight, and the editor tour's ending. Mounted once in the app shell, over the
 * canvas and its panels, under dialogs.
 */
export function TourLayer() {
  useTourStarter();
  const active = useTour((state) => state.active);
  const steps = active ? TOURS[active.tour].steps : [];
  const step = active ? steps[active.index] : undefined;
  useStepCompletion();
  const box = useTarget(step?.target);
  const { next, back, end } = useTour.getState();

  return (
    <>
      {active && step ? (
        <>
          {box && <TourHighlight box={box} />}
          <TourPopover
            step={step}
            number={active.index + 1}
            count={steps.length}
            target={box}
            canGoBack={active.index > 0}
            onBack={back}
            onNext={next}
            onEnd={end}
          />
        </>
      ) : (
        <TourOffers />
      )}
      <TourFinish />
    </>
  );
}

/**
 * Starts a prepared tour once its page is ready: the editor tour on its practice universe's
 * map, once edit mode is offered there (the first step needs it).
 */
function useTourStarter(): void {
  const pending = useTour((state) => state.pending);
  const path = useLocation().pathname;
  const canEdit = useEditor((state) => state.available);
  useEffect(() => {
    if (!pending) return;
    const { tour, practice } = pending;
    if (practice && !path.startsWith(`/u/${practice.slug}/`)) return;
    // As it is now: the page that just opened may have reset it after this render.
    if (tour === 'editor' && !useEditor.getState().available) return;
    useTour.getState().start(tour, practice ?? undefined);
  }, [pending, path, canEdit]);
}

/**
 * Watches for what the step asks the reader to do, and moves on shortly after it's done. Only
 * that step moves on: a late signal for a step already left does nothing.
 */
function useStepCompletion(): void {
  const active = useTour((state) => state.active);
  const tour = active?.tour;
  const index = active?.index;
  useEffect(() => {
    if (tour === undefined || index === undefined) return;
    const step = TOURS[tour].steps[index];
    if (!step || step.completes === 'next') return;
    let timer: number | undefined;
    const stop = COMPLETIONS[step.completes].watch(() => {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        const now = useTour.getState().active;
        if (now?.tour === tour && now.index === index) useTour.getState().next();
      }, ADVANCE_DELAY_MS);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [tour, index]);
}
