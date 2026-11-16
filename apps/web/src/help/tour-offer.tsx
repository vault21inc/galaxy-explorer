import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/components/ui/button.tsx';
import { useCanCreate } from '@/editor/use-can-edit.ts';
import { useEditor } from '@/state/editor.ts';
import { useStartEditorTour } from './practice.ts';
import { useTour, useTourOffers } from './tour-store.ts';
import type { TourId } from './tour-types.ts';

/**
 * The first-visit offers (M8-T10, ux.md §12): "New here? Take the tour" on a map, and "Take the
 * editor tour" the first time someone who may make universes turns on edit mode. Offered,
 * never forced: each shows once per browser, until taken or turned down (`ge.tours`), and both
 * tours stay in the Help menu.
 */
export function TourOffers() {
  const { mapSlug } = useParams();
  const dismissed = useTourOffers((state) => state.dismissed);
  const pending = useTour((state) => state.pending);
  const finishing = useTour((state) => state.finishing);
  const editing = useEditor((state) => state.editing);
  const canCreate = useCanCreate();
  if (mapSlug === undefined || pending || finishing) return null;
  if (editing && canCreate && !dismissed.editor) return <EditorOffer />;
  if (!editing && !dismissed.reader) return <ReaderOffer />;
  return null;
}

function ReaderOffer() {
  return (
    <Offer tour="reader" title="New here?" action="Take the tour">
      A short tour of moving around, labels, spoilers, systems and search. It changes nothing.
    </Offer>
  );
}

function EditorOffer() {
  const start = useStartEditorTour();
  return (
    <Offer
      tour="editor"
      title="Learning to edit?"
      action="Take the editor tour"
      busy={start.isPending}
      onTake={() => {
        start.mutate();
      }}
    >
      It makes a practice universe that only you can see, and offers to delete it at the end.
    </Offer>
  );
}

function Offer({
  tour,
  title,
  action,
  busy = false,
  onTake,
  children,
}: {
  tour: TourId;
  title: string;
  action: string;
  busy?: boolean;
  onTake?: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label="Guided tour"
      className="pointer-events-auto fixed bottom-4 left-4 z-30 flex w-72 flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-lg"
    >
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">{children}</p>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            useTourOffers.getState().dismiss(tour);
          }}
        >
          No thanks
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            if (onTake) onTake();
            else useTour.getState().start(tour);
          }}
        >
          {action}
        </Button>
      </div>
    </aside>
  );
}
