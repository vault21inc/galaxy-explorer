import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button.tsx';

/**
 * Something the API keeps only a hash of, shown the one time anyone sees it (ux.md §13): an
 * invite or reset link (M8-T13), an API token (M8-T2). Copy puts it on the clipboard.
 */
export function ShownOnce({
  value,
  label,
  note,
  testId,
}: {
  value: string;
  label: string;
  note: ReactNode;
  testId: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm">{label}</p>
      <div className="flex items-center gap-2">
        <code
          data-testid={testId}
          className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1 font-mono text-xs break-all select-all"
        >
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
