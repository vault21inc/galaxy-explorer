import { useLocation, useNavigate } from 'react-router';
import { SHEET_ROW } from '@/components/ui/sheet.tsx';
import { readableSearch } from '@/lib/camera-param.ts';
import { aspectLabel, CAPTURE_ASPECTS, withCapture } from '@/lib/capture-params.ts';
import { useSheet } from '@/state/sheet.ts';

/**
 * "Record a clip", from the slim bar's More sheet (L3-T5): the shapes capture mode frames, as
 * the command palette offers them. Choosing one closes the sheet and enters capture mode, whose
 * buttons (app/capture-controls.tsx) take it from there.
 */
export function CaptureSheet() {
  const navigate = useNavigate();
  const location = useLocation();
  const close = useSheet((state) => state.close);
  return (
    <div className="flex flex-col">
      <p className="px-3 pb-2 text-xs text-muted-foreground">
        The map alone, framed for a clip. Set where the camera starts and ends, then play the move
        or record it to a video.
      </p>
      {CAPTURE_ASPECTS.map((aspect) => (
        <button
          key={aspect.id}
          type="button"
          className={SHEET_ROW}
          onClick={() => {
            close();
            // In the address, as the palette does it (lib/capture-params.ts): no new history.
            const search = readableSearch(
              withCapture(new URLSearchParams(location.search), aspect.id),
            );
            void navigate({ search }, { replace: true, state: location.state as unknown });
          }}
        >
          <span className="w-10 font-medium">{aspectLabel(aspect)}</span>
          <span className="text-muted-foreground">for {aspect.use}</span>
        </button>
      ))}
    </div>
  );
}
