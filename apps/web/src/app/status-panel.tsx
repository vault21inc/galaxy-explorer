import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button.tsx';

interface StatusPanelProps {
  tone: 'loading' | 'error' | 'empty';
  title: string;
  children?: ReactNode;
  /** Shown as a Retry button for errors. */
  onRetry?: () => void;
}

/**
 * The loading, error and empty states every route shows (M2-T1), as a panel floating over the
 * canvas under the top bar. Loading is announced politely; errors interrupt (`role="alert"`).
 */
export function StatusPanel({ tone, title, children, onRetry }: StatusPanelProps) {
  return (
    <section
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? undefined : 'polite'}
      className="absolute top-16 left-4 max-w-sm rounded-lg border bg-card p-4 text-sm"
    >
      <h1 className="flex items-center gap-2 font-medium">
        {tone === 'loading' && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {tone === 'error' && <AlertTriangle aria-hidden className="size-4 text-destructive" />}
        {title}
      </h1>
      {children && <div className="mt-2 text-muted-foreground">{children}</div>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </section>
  );
}
