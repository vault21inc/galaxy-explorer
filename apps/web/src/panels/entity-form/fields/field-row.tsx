import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.ts';

/**
 * One labelled form row: the label on the left, the control on the right, and an optional
 * hint or error below. Inherited values look dimmed (ux.md §5).
 */
export function FieldRow({
  label,
  htmlFor,
  hint,
  error,
  inherited = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string | undefined;
  error?: string | null;
  inherited?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-h-7 items-center gap-2">
        <label htmlFor={htmlFor} className="w-28 shrink-0 text-sm text-muted-foreground">
          {label}
        </label>
        <div
          className={cn('flex min-w-0 flex-1 items-center gap-1.5', inherited && 'opacity-60')}
          data-inherited={inherited ? '' : undefined}
        >
          {children}
        </div>
      </div>
      {error ? (
        <p role="alert" className="pl-30 text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="pl-30 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** The small "reset to default" button beside an overridden value (ux.md §5). */
export function ResetButton({ label, onReset }: { label: string; onReset: () => void }) {
  return (
    <button
      type="button"
      className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      aria-label={`Reset ${label.toLowerCase()} to default`}
      onClick={onReset}
    >
      Reset
    </button>
  );
}

export const INPUT_CLASS =
  'h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-1.5 text-sm focus-visible:border-ring focus-visible:outline-none aria-invalid:border-destructive';
