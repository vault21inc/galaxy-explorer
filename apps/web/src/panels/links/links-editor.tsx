import type { EntityKind } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';
import type { PanelEntity } from '../types.ts';
import { addLink, removeLink, updateLink, type LinkRead } from './link-writes.ts';

/** The API takes web addresses only (data-model §3.4: `url ~ '^https?://'`). */
const WEB_ADDRESS = /^https?:\/\/\S+$/i;

/**
 * The Links section in edit mode (ux.md §5): each link's address and label, saved when the
 * field loses focus, its spoiler switch and a remove button; then a form to add one. Each
 * change is one step in the history.
 */
export function LinksEditor({ entity, kind }: { entity: PanelEntity; kind: EntityKind }) {
  const queryClient = useQueryClient();
  const links = [...(entity.links ?? [])].sort((a, b) => a.sortKey - b.sortKey);
  const owner = { id: entity.id, kind };
  const name = entity.namePlain;
  return (
    <>
      {links.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              onChange={(patch) =>
                void updateLink(queryClient, owner, link, patch, `Edit a link of “${name}”`)
              }
              onRemove={() =>
                void removeLink(
                  queryClient,
                  owner,
                  link,
                  `Remove the link “${link.label ?? link.url}” from “${name}”`,
                )
              }
            />
          ))}
        </ul>
      )}
      <AddLinkForm
        onAdd={(url, label) =>
          addLink(
            queryClient,
            owner,
            // After the last one.
            { url, label, sortKey: (links.at(-1)?.sortKey ?? 0) + 1 },
            `Add the link “${label ?? url}” to “${name}”`,
          )
        }
      />
    </>
  );
}

function LinkRow({
  link,
  onChange,
  onRemove,
}: {
  link: LinkRead;
  onChange: (patch: { url?: string; label?: string | null; isSpoiler?: boolean }) => void;
  onRemove: () => void;
}) {
  const shown = link.label ?? link.url;
  return (
    <li className="flex flex-col gap-1 rounded border p-2">
      <div className="flex items-center gap-1">
        <input
          // Remounted with each saved address, which replaces what's typed.
          key={link.url}
          type="url"
          aria-label={`Address of ${shown}`}
          defaultValue={link.url}
          className={INPUT_CLASS}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim();
            if (next === link.url) return;
            // An address the API would refuse goes back to the saved one.
            if (WEB_ADDRESS.test(next)) onChange({ url: next });
            else event.currentTarget.value = link.url;
          }}
          onKeyDown={blurOnEnter}
        />
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${shown}`} onClick={onRemove}>
          <X aria-hidden />
        </Button>
      </div>
      <input
        key={link.label ?? ''}
        aria-label={`Label of ${shown}`}
        placeholder="Label (the address if empty)"
        defaultValue={link.label ?? ''}
        className={INPUT_CLASS}
        onBlur={(event) => {
          const next = event.currentTarget.value.trim();
          if (next !== (link.label ?? '')) onChange({ label: next === '' ? null : next });
        }}
        onKeyDown={blurOnEnter}
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch
          checked={link.isSpoiler}
          aria-label={`${shown} is a spoiler`}
          onCheckedChange={(isSpoiler) => {
            onChange({ isSpoiler });
          }}
        />
        Spoiler
      </label>
    </li>
  );
}

function AddLinkForm({
  onAdd,
}: {
  onAdd: (url: string, label: string | null) => Promise<boolean>;
}) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const address = url.trim();
  const valid = WEB_ADDRESS.test(address);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid) return;
    const named = label.trim();
    void onAdd(address, named === '' ? null : named).then((added) => {
      if (!added) return;
      setUrl('');
      setLabel('');
    });
  };
  return (
    <form aria-label="Add a link" className="mt-2 flex flex-col gap-1" onSubmit={submit}>
      <input
        type="url"
        aria-label="New link address"
        placeholder="https://…"
        value={url}
        aria-invalid={address !== '' && !valid}
        className={INPUT_CLASS}
        onChange={(event) => {
          setUrl(event.currentTarget.value);
        }}
      />
      <div className="flex items-center gap-1">
        <input
          aria-label="New link label"
          placeholder="Label (optional)"
          value={label}
          className={INPUT_CLASS}
          onChange={(event) => {
            setLabel(event.currentTarget.value);
          }}
        />
        <Button type="submit" variant="outline" size="sm" className="gap-1" disabled={!valid}>
          <Plus aria-hidden />
          Add link
        </Button>
      </div>
      {address !== '' && !valid && (
        <p className="text-xs text-destructive">Start the address with http:// or https://.</p>
      )}
    </form>
  );
}

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.currentTarget.blur();
}
