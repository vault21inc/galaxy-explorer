import { useId, useState, type SyntheticEvent } from 'react';
import { useCreateToken, type TokenScope } from '@/api/account.ts';
import { useUniverses } from '@/api/containers.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { ShownOnce } from '@/app/shown-once.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { INPUT_CLASS } from '@/panels/entity-form/fields/field-row.tsx';

const SCOPES: { value: TokenScope; label: string; hint: string }[] = [
  { value: 'read', label: 'Read', hint: 'Reads what you can, as a viewer would.' },
  { value: 'write', label: 'Write', hint: 'Also changes content, as you can.' },
];

/**
 * Making an API token (M8-T2, ux.md §13): a name, read or write, optionally one universe, and a
 * current code. The token is shown once, here, then never again.
 */
export function TokenForm() {
  const id = useId();
  const create = useCreateToken();
  const universes = useUniverses();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TokenScope>('read');
  const [universeId, setUniverseId] = useState('');
  const [totp, setTotp] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const ready = name.trim() !== '' && /^\d{6}$/.test(totp) && !create.isPending;

  if (secret !== null) {
    return (
      <div className="flex flex-col gap-3">
        <ShownOnce
          value={secret}
          label="Your new token:"
          note={
            <>
              Copy it now: it’s shown only once. An agent sends it as{' '}
              <code>Authorization: Bearer …</code>.
            </>
          }
          testId="token-once"
        />
        <Button
          type="button"
          size="sm"
          className="self-start"
          onClick={() => {
            setSecret(null);
          }}
        >
          Done
        </Button>
      </div>
    );
  }

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!ready) return;
    create.mutate(
      { name: name.trim(), scope, universeId: universeId || null, totp },
      {
        onSuccess: (made) => {
          setName('');
          setTotp('');
          setSecret(made.secret);
        },
        onError: () => {
          // A code works once: the next try needs the next one.
          setTotp('');
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label="Make an API token">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={60}
          autoComplete="off"
          placeholder="claude-code on laptop"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm">What it may do</legend>
        {SCOPES.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name={`${id}-scope`}
              value={option.value}
              checked={scope === option.value}
              onChange={() => {
                setScope(option.value);
              }}
              className="mt-1 accent-primary"
            />
            <span>
              {option.label}
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-universe`}>Universe</Label>
        <select
          id={`${id}-universe`}
          className={INPUT_CLASS}
          value={universeId}
          onChange={(event) => {
            setUniverseId(event.currentTarget.value);
          }}
        >
          <option value="">Every universe you can reach</option>
          {(universes.data ?? []).map((universe) => (
            <option key={universe.id} value={universe.id}>
              Only {universe.namePlain}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-code`}>Code from your authenticator app</Label>
        <Input
          id={`${id}-code`}
          value={totp}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          onChange={(event) => {
            setTotp(event.target.value.replace(/\D/g, ''));
          }}
        />
      </div>
      {create.error && (
        <p role="alert" className="text-destructive">
          {errorMessage(create.error)}
        </p>
      )}
      <Button type="submit" size="sm" className="self-start" disabled={!ready}>
        {create.isPending ? 'Making…' : 'Make token'}
      </Button>
    </form>
  );
}
