import type { Visibility } from '@ge/domain';
import { useState } from 'react';
import type { Universe } from '@/api/containers.ts';
import { useDraftCount, useSetVisibility } from '@/api/sharing.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { useToasts } from '@/state/toasts.ts';

/**
 * "Who can see it" (M8-T12, ux.md §13): private, anyone with the link, or public, each with one
 * line saying what it means. Making it public asks first, and says how many drafts stay
 * hidden. Editors see the choice without being able to change it.
 */

export const VISIBILITY_CHOICES: { value: Visibility; label: string; hint: string }[] = [
  {
    value: 'private',
    label: 'Private',
    hint: 'Only its owner and the people below can see it.',
  },
  {
    value: 'link',
    label: 'Anyone with the link',
    hint: 'Whoever has its link can read it. It isn’t listed, and search engines are asked to leave it out.',
  },
  {
    value: 'public',
    label: 'Public',
    hint: 'Listed on the home page, and readable by everyone.',
  },
];

export function VisibilityChoice({ universe, owner }: { universe: Universe; owner: boolean }) {
  const setVisibility = useSetVisibility(universe);
  const [confirming, setConfirming] = useState(false);
  // Shown as chosen while it saves, so the radio doesn't jump back until the API answers.
  const [saving, setSaving] = useState<Visibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = saving ?? universe.visibility;

  const choose = async (visibility: Visibility) => {
    setError(null);
    setSaving(visibility);
    try {
      await setVisibility.mutateAsync(visibility);
      const label = VISIBILITY_CHOICES.find((choice) => choice.value === visibility)?.label;
      useToasts.getState().show(`Who can see it: ${label ?? visibility}`, 'info');
    } catch (caught) {
      setError(caught instanceof Error ? errorMessage(caught) : String(caught));
    } finally {
      setSaving(null);
    }
  };

  if (!owner) {
    const current = VISIBILITY_CHOICES.find((choice) => choice.value === universe.visibility);
    return (
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">Who can see it</h3>
        <p>
          {current?.label}
          <span className="block text-xs text-muted-foreground">{current?.hint}</span>
        </p>
      </div>
    );
  }

  return (
    <fieldset className="flex flex-col gap-1.5" disabled={setVisibility.isPending}>
      <legend className="mb-1 font-medium">Who can see it</legend>
      {VISIBILITY_CHOICES.map((choice) => (
        <label key={choice.value} className="flex items-start gap-2">
          <input
            type="radio"
            name="universe-visibility"
            className="mt-1"
            checked={shown === choice.value}
            onChange={() => {
              if (choice.value === 'public') setConfirming(true);
              else void choose(choice.value);
            }}
          />
          <span>
            {choice.label}
            <span className="block text-xs text-muted-foreground">{choice.hint}</span>
          </span>
        </label>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <MakePublicDialog
        universe={universe}
        open={confirming}
        onClose={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          setConfirming(false);
          void choose('public');
        }}
      />
    </fieldset>
  );
}

function MakePublicDialog({
  universe,
  open,
  onClose,
  onConfirm,
}: {
  universe: Universe;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const drafts = useDraftCount(universe.id, open).data;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make {universe.namePlain} public?</DialogTitle>
          <DialogDescription>
            It will be listed on the home page, and everyone can read its published content.{' '}
            {drafts ? draftsSentence(drafts) : 'Counting its drafts…'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm}>
            Make it public
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "2 drafts stay hidden: 1 map and 1 entry." */
export function draftsSentence({ maps, entries }: { maps: number; entries: number }): string {
  const total = maps + entries;
  if (total === 0) return 'It has no drafts: everything in it will be readable.';
  const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
  const parts = [
    ...(maps > 0 ? [count(maps, 'map', 'maps')] : []),
    ...(entries > 0 ? [count(entries, 'entry', 'entries')] : []),
  ];
  return `${count(total, 'draft stays', 'drafts stay')} hidden from readers: ${parts.join(' and ')}.`;
}
