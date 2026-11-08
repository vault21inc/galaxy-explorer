import { Slug } from '@ge/domain';
import { useId, useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { useCreateUniverse } from '@/api/containers.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { slugify } from '@/lib/slugify.ts';

/**
 * Starts a universe with one map and opens it. The slug follows the name until it's edited by
 * hand; it's checked with the same `Slug` schema the API uses.
 */
export function NewUniverseForm() {
  const id = useId();
  const navigate = useNavigate();
  const create = useCreateUniverse();
  const [name, setName] = useState('');
  const [customSlug, setCustomSlug] = useState<string | null>(null);
  const slug = customSlug ?? slugify(name);
  const slugCheck = Slug.safeParse(slug);
  const slugError = slug !== '' && !slugCheck.success ? slugCheck.error.issues[0]?.message : null;
  const canSubmit = name.trim() !== '' && slugCheck.success && !create.isPending;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    create.mutate(
      { name: name.trim(), slug },
      {
        onSuccess: ({ map }) => {
          void navigate(`/u/${slug}/${map.slug}`);
        },
      },
    );
  };

  return (
    <form aria-labelledby={`${id}-heading`} onSubmit={onSubmit} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-xs text-muted-foreground label-caps">
        New universe
      </h2>
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
          {slugError ?? `Opens at /u/${slug || '…'}`}
        </p>
      </div>
      {create.error && (
        <p role="alert" className="text-destructive">
          {errorMessage(create.error)}
        </p>
      )}
      <Button type="submit" disabled={!canSubmit}>
        {create.isPending ? 'Creating…' : 'Create universe'}
      </Button>
    </form>
  );
}
