import { X } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { useQuality } from '@/state/quality.ts';

/** How long the step-down notice stays, in milliseconds. */
const NOTICE_MS = 8_000;

/** The small notice after an automatic quality step-down (rendering.md §13), bottom right. */
export function QualityNotice() {
  const notice = useQuality((state) => state.notice);
  const dismiss = useQuality((state) => state.dismissNotice);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismiss, NOTICE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [notice, dismiss]);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="absolute right-4 bottom-4 flex max-w-xs items-start gap-2 rounded-lg border bg-card p-3 text-sm"
    >
      <p>
        {notice} You can change it in the settings <span aria-hidden>(⚙)</span>.
      </p>
      <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={dismiss}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
