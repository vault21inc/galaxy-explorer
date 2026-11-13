import { unwrap } from '@ge/api-client';
import { rt, Slug } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/api/client.ts';
import { queryKeys } from '@/api/keys.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { slugify } from '@/lib/slugify.ts';
import { useToasts } from '@/state/toasts.ts';
import { errorMessage } from './route-states.tsx';

/**
 * "Clone map as…" (M7-T5, U7): a copy of the whole map under a new name, such as "M42, after
 * the Rift", to change for another era. The copy opens once it's made; one undo removes it.
 */
export function CloneMapDialog({
  open,
  onClose,
  universeId,
  universeSlug,
  map,
}: {
  open: boolean;
  onClose: () => void;
  universeId: string;
  universeSlug: string;
  map: { id: string; namePlain: string };
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open && (
        <DialogContent>
          <CloneForm
            universeId={universeId}
            universeSlug={universeSlug}
            map={map}
            onDone={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function CloneForm({
  universeId,
  universeSlug,
  map,
  onDone,
}: {
  universeId: string;
  universeSlug: string;
  map: { id: string; namePlain: string };
  onDone: () => void;
}) {
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(`${map.namePlain} (copy)`);
  // The slug follows the name until it's edited by hand, as for a new universe.
  const [customSlug, setCustomSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const slug = customSlug ?? slugify(name);
  const slugCheck = Slug.safeParse(slug);
  const slugError = slug !== '' && !slugCheck.success ? slugCheck.error.issues[0]?.message : null;
  const canSubmit = name.trim() !== '' && slugCheck.success && !saving;

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const copy = await unwrap(
        api.POST('/api/v1/maps/{mapId}/clone', {
          params: { path: { mapId: map.id } },
          body: { slug, name: rt.plain(name.trim()) },
        }),
      );
      await refreshAfterWrite(queryClient, [queryKeys.maps(universeId)]);
      useToasts.getState().show(`Cloned ${map.namePlain} as ${copy.namePlain}`, 'info');
      onDone();
      void navigate(`/u/${universeSlug}/${copy.slug}`);
    } catch (caught) {
      setError(caught instanceof Error ? errorMessage(caught) : String(caught));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Clone {map.namePlain}</DialogTitle>
        <DialogDescription>
          A copy of the whole map, with everything on it, for another era. Each copy remembers its
          original, so the panel can switch between them.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={200}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-slug`}>Address</Label>
        <Input
          id={`${id}-slug`}
          value={slug}
          maxLength={100}
          aria-describedby={`${id}-slug-hint`}
          aria-invalid={slugError ? true : undefined}
          onChange={(event) => {
            setCustomSlug(event.target.value);
          }}
        />
        <p id={`${id}-slug-hint`} className="text-xs text-muted-foreground">
          {slugError ?? `Opens at /u/${universeSlug}/${slug || '…'}`}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {saving ? 'Cloning…' : 'Clone map'}
        </Button>
      </DialogFooter>
    </form>
  );
}
