import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';

/**
 * An invite or reset link, shown once (M8-T13, ux.md §13): the API keeps only its hash, so this
 * is the only time anyone sees it. Copy puts it on the clipboard to pass on.
 */
export function LinkOnce({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm">{label}</p>
      <div className="flex items-center gap-2">
        <code
          data-testid="link-once"
          className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1 font-mono text-xs break-all select-all"
        >
          {url}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        It’s shown only now: copy it and pass it on. It works once.
      </p>
    </div>
  );
}
