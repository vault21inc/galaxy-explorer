import { MEMBER_ROLES, type MemberRole } from '@ge/domain';
import { X } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';
import type { Universe } from '@/api/containers.ts';
import { useMembers, useRemoveMember, useSetMember } from '@/api/sharing.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { UsernameInput } from '@/components/username-input.tsx';
import { cn } from '@/lib/utils.ts';
import { INPUT_CLASS } from '@/panels/entity-form/fields/field-row.tsx';

/**
 * "People" (M8-T12, ux.md §13): the owner, then each account the universe is shared with and
 * its role. The owner changes roles, removes people and adds them by username: a name that
 * doesn't exist says so. As they type, the field offers the people they already know, or every
 * account to an admin (D-59), leaving out those already here. Editors see the list read-only.
 */

export const ROLE_LABELS: Record<MemberRole, string> = { editor: 'Editor', viewer: 'Viewer' };
const ROLE_HINTS: Record<MemberRole, string> = {
  editor: 'changes its content, sees drafts and History',
  viewer: 'reads it',
};

export function PeopleList({
  universe,
  owner,
  suggestions,
}: {
  universe: Universe;
  owner: boolean;
  /** Names to offer when adding someone (D-59). */
  suggestions: readonly string[];
}) {
  const members = useMembers(universe.id);
  const setMember = useSetMember(universe.id);
  const removeMember = useRemoveMember(universe.id);
  const [error, setError] = useState<string | null>(null);
  const roleSelectId = useId();

  /** Runs a change, showing what went wrong; true if it worked. */
  const act = async (work: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    try {
      await work();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? errorMessage(caught) : String(caught));
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 id={`${roleSelectId}-people`} className="font-medium">
        People
      </h3>
      <ul aria-labelledby={`${roleSelectId}-people`} className="flex max-w-xl flex-col divide-y">
        <li className="flex items-center justify-between py-1.5">
          <span>{universe.owner ?? 'This installation'}</span>
          <span className="text-muted-foreground">Owner</span>
        </li>
        {(members.data ?? []).map((member) => (
          <li key={member.username} className="flex items-center justify-between gap-2 py-1.5">
            <span>{member.username}</span>
            {owner ? (
              <span className="flex items-center gap-1">
                <select
                  aria-label={`Role of ${member.username}`}
                  className={cn(INPUT_CLASS, 'w-28')}
                  value={member.role}
                  onChange={(event) => {
                    const role = event.currentTarget.value as MemberRole;
                    void act(() => setMember.mutateAsync({ username: member.username, role }));
                  }}
                >
                  {MEMBER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${member.username}`}
                  onClick={() => void act(() => removeMember.mutateAsync(member.username))}
                >
                  <X aria-hidden />
                </Button>
              </span>
            ) : (
              <span className="text-muted-foreground">{ROLE_LABELS[member.role]}</span>
            )}
          </li>
        ))}
      </ul>
      {members.data?.length === 0 && (
        <p className="text-muted-foreground">It isn’t shared with anyone else.</p>
      )}
      {owner && (
        <AddPerson
          suggestions={suggestions.filter(
            (name) => !members.data?.some((member) => member.username === name),
          )}
          onAdd={(username, role) => act(() => setMember.mutateAsync({ username, role }))}
          busy={setMember.isPending}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function AddPerson({
  suggestions,
  onAdd,
  busy,
}: {
  suggestions: readonly string[];
  onAdd: (username: string, role: MemberRole) => Promise<boolean>;
  busy: boolean;
}) {
  const id = useId();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<MemberRole>('viewer');
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const name = username.trim();
    if (name === '') return;
    // Kept on a mistake, such as a misspelt name, to correct it.
    if (await onAdd(name, role)) setUsername('');
  };
  return (
    <form
      aria-label="Add a person"
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => void submit(event)}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-username`} className="text-xs text-muted-foreground">
          Username
        </label>
        <UsernameInput
          id={`${id}-username`}
          className="h-8 w-48"
          value={username}
          suggestions={suggestions}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-role`} className="text-xs text-muted-foreground">
          Role
        </label>
        <select
          id={`${id}-role`}
          className={cn(INPUT_CLASS, 'h-8 w-28')}
          value={role}
          aria-describedby={`${id}-role-hint`}
          onChange={(event) => {
            setRole(event.currentTarget.value as MemberRole);
          }}
        >
          {MEMBER_ROLES.map((item) => (
            <option key={item} value={item}>
              {ROLE_LABELS[item]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={busy || username.trim() === ''}>
        Add
      </Button>
      <p id={`${id}-role-hint`} className="w-full text-xs text-muted-foreground">
        {ROLE_LABELS[role]}: {ROLE_HINTS[role]}.
      </p>
    </form>
  );
}
