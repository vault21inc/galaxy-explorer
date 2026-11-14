import { Copy, RefreshCw } from 'lucide-react';
import { useId, useState } from 'react';
import type { Universe } from '@/api/containers.ts';
import { shareLinkOf, useNewShareKey } from '@/api/sharing.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { useToasts } from '@/state/toasts.ts';

/**
 * The share link of a link-only universe (M8-T12, ux.md §13): its address with the key, Copy,
 * and "Make a new link", which stops the old one working for everyone who had it. Only the
 * owner is sent the key; editors are told who has it.
 */
export function ShareLink({ universe }: { universe: Universe }) {
  const id = useId();
  const newKey = useNewShareKey(universe.id);
  const [error, setError] = useState<string | null>(null);
  const toasts = useToasts.getState();

  if (universe.shareKey === null) {
    return <p className="text-muted-foreground">Its owner has the link to hand out.</p>;
  }
  const link = shareLinkOf(universe.slug, universe.shareKey);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toasts.show('Link copied', 'info');
    } catch {
      // Some browsers refuse without a click's permission: the field can still be copied.
      toasts.show('Couldn’t copy: select the link and copy it yourself.', 'error');
    }
  };
  const replace = async () => {
    setError(null);
    try {
      await newKey.mutateAsync();
      toasts.show('A new link: the old one no longer works.', 'info');
    } catch (caught) {
      setError(caught instanceof Error ? errorMessage(caught) : String(caught));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">
        The link
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          readOnly
          value={link}
          className="h-8 max-w-xl flex-1 font-mono text-xs"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          <Copy aria-hidden />
          Copy
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={newKey.isPending}
          onClick={() => void replace()}
        >
          <RefreshCw aria-hidden />
          Make a new link
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Anyone with this link can read the universe. A new link stops this one working.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
