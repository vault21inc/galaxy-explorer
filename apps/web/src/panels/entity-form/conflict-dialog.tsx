import { toPlainText, type RichText } from '@ge/domain';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import type { Conflict } from './use-entity-save.ts';

/**
 * "Changed elsewhere" (ux.md §5): someone saved this entity after the form read it. Shows the
 * fields of this edit as they are now and as they would be, then Reload (discard the edit)
 * or Overwrite (save it over theirs).
 */
export function ConflictDialog({ conflict }: { conflict: Conflict | null }) {
  return (
    <Dialog
      open={conflict !== null}
      onOpenChange={(open) => {
        // Closing without choosing keeps what's saved.
        if (!open) conflict?.reload();
      }}
    >
      {conflict && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changed elsewhere</DialogTitle>
            <DialogDescription>
              “{conflict.current.namePlain}” was changed after you opened it. Reload to see the
              current version, or overwrite it with your change.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {Object.entries(conflict.changes).map(([field, mine]) => (
              <Diff
                key={field}
                field={field}
                now={(conflict.current as Record<string, unknown>)[field]}
                mine={mine}
              />
            ))}
          </dl>
          <DialogFooter>
            <Button variant="outline" onClick={conflict.reload}>
              Reload
            </Button>
            <Button onClick={conflict.overwrite}>Overwrite</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function Diff({ field, now, mine }: { field: string; now: unknown; mine: unknown }) {
  return (
    <>
      <dt className="col-span-2 text-xs text-muted-foreground label-caps">{field}</dt>
      <dd className="text-muted-foreground">Now</dd>
      <dd className="break-words">{display(now)}</dd>
      <dd className="text-muted-foreground">Yours</dd>
      <dd className="break-words">{display(mine)}</dd>
    </>
  );
}

function display(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'object' && 'source' in value && 'format' in value) {
    return toPlainText(value as RichText) || '(empty)';
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
