import { X } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';
import { useToasts, type Toast } from '@/state/toasts.ts';

/** How long a toast stays, in milliseconds. Errors stay until dismissed. */
const INFO_MS = 5_000;

/** The toasts, stacked in the bottom-right corner (ux.md §1). */
export function Toaster() {
  const toasts = useToasts((state) => state.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="absolute right-4 bottom-4 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((state) => state.dismiss);
  useEffect(() => {
    if (toast.tone === 'error') return;
    const timer = window.setTimeout(() => {
      dismiss(toast.id);
    }, INFO_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast, dismiss]);
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border bg-card p-3 text-sm',
        toast.tone === 'error' && 'border-destructive/50',
      )}
    >
      <p className="flex-1">{toast.message}</p>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Dismiss"
        onClick={() => {
          dismiss(toast.id);
        }}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}
