import { useState } from 'react';
import {
  useAdminUsers,
  useDeleteAccount,
  useInvite,
  useResetLink,
  useUpdateAccount,
  type AdminUser,
} from '@/api/admin.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { formatBytes } from '@/lib/bytes.ts';
import { ActionDialog, type AdminAction } from './action-dialog.tsx';
import { formatWhen } from './format-when.ts';

const GIB = 1024 ** 3;

/**
 * The Accounts screen (M8-T13, ux.md §13): every account with its role, last sign-in, universes
 * owned, media used of its quota, and status; inviting an account, and each account's actions.
 */
export function AccountsTab() {
  const users = useAdminUsers();
  const invite = useInvite();
  const resetLink = useResetLink();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const [action, setAction] = useState<AdminAction | null>(null);

  const inviteAction = (role: 'member' | 'admin'): AdminAction => ({
    title: role === 'admin' ? 'Invite an admin' : 'Invite someone',
    description:
      role === 'admin'
        ? 'A link that makes one new admin account, within 7 days. Admins manage accounts, not other people’s universes.'
        : 'A link that makes one new account, within 7 days. The person chooses a username and password, and sets up two-factor codes.',
    confirmLabel: 'Make the link',
    askCode: false,
    run: async () => (await invite.mutateAsync(role)).url,
  });

  const actionsFor = (user: AdminUser) => {
    const name = user.username;
    return [
      {
        label: 'Reset link',
        action: {
          title: `A reset link for ${name}`,
          description: `For a forgotten password or lost codes: within 24 hours, the link sets a new password and new codes, and signs ${name} out everywhere.`,
          confirmLabel: 'Make the link',
          askCode: true,
          run: async ({ totp }) => (await resetLink.mutateAsync({ userId: user.id, totp })).url,
        } satisfies AdminAction,
      },
      {
        label: user.disabledAt ? 'Enable' : 'Disable',
        action: {
          title: user.disabledAt ? `Enable ${name}` : `Disable ${name}`,
          description: user.disabledAt
            ? `${name} can sign in again.`
            : `${name} is signed out at once and can’t sign in until enabled again. Their universes stay as they are.`,
          confirmLabel: user.disabledAt ? 'Enable' : 'Disable',
          destructive: !user.disabledAt,
          askCode: true,
          run: async ({ totp }) => {
            await update.mutateAsync({ userId: user.id, disabled: !user.disabledAt, totp });
          },
        } satisfies AdminAction,
      },
      {
        label: user.role === 'admin' ? 'Make member' : 'Make admin',
        action: {
          title: user.role === 'admin' ? `Make ${name} a member` : `Make ${name} an admin`,
          description:
            user.role === 'admin'
              ? `${name} stops managing accounts.`
              : `${name} can manage accounts, but not open other people’s universes.`,
          confirmLabel: 'Change the role',
          askCode: true,
          run: async ({ totp }) => {
            await update.mutateAsync({
              userId: user.id,
              role: user.role === 'admin' ? 'member' : 'admin',
              totp,
            });
          },
        } satisfies AdminAction,
      },
      {
        label: 'Set quota',
        action: {
          title: `Media quota for ${name}`,
          description: `How much media the universes ${name} owns may hold together. ${formatBytes(user.mediaUsedBytes)} is used now.`,
          confirmLabel: 'Set the quota',
          input: {
            label: 'Quota in GB',
            numeric: true,
            initial: String(user.mediaQuotaBytes / GIB),
          },
          askCode: false,
          run: async ({ input }) => {
            const gb = Number(input.replace(',', '.'));
            if (!Number.isFinite(gb) || gb < 0) throw new Error('Type a number of GB, such as 2.');
            await update.mutateAsync({ userId: user.id, mediaQuotaBytes: Math.round(gb * GIB) });
          },
        } satisfies AdminAction,
      },
      {
        label: 'Delete',
        disabled: user.universesOwned > 0,
        action: {
          title: `Delete ${name}`,
          description: `The account goes, with its sessions and memberships. This can’t be undone.`,
          confirmLabel: 'Delete the account',
          destructive: true,
          confirmText: name,
          askCode: true,
          run: async ({ totp }) => {
            await remove.mutateAsync({ userId: user.id, totp });
          },
        } satisfies AdminAction,
      },
    ];
  };

  return (
    <section aria-label="Accounts" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            setAction(inviteAction('member'));
          }}
        >
          Invite someone
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setAction(inviteAction('admin'));
          }}
        >
          Invite an admin
        </Button>
      </div>
      {users.error && (
        <p role="alert" className="text-destructive">
          {errorMessage(users.error)}
        </p>
      )}
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Accounts</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">
              Username
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Role
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Last sign-in
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Universes
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Storage
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Status
            </th>
            <th scope="col" className="py-1 font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {(users.data ?? []).map((user) => (
            <tr key={user.id} className="border-t align-top">
              <th scope="row" className="py-1.5 pr-3 font-medium">
                {user.username}
              </th>
              <td className="py-1.5 pr-3">{user.role === 'admin' ? 'Admin' : 'Member'}</td>
              <td className="py-1.5 pr-3">
                {user.lastLoginAt ? formatWhen(user.lastLoginAt) : 'Never'}
              </td>
              <td className="py-1.5 pr-3">{user.universesOwned}</td>
              <td className="py-1.5 pr-3">
                {formatBytes(user.mediaUsedBytes)} of {formatBytes(user.mediaQuotaBytes)}
              </td>
              <td className="py-1.5 pr-3">{user.disabledAt ? 'Disabled' : 'Active'}</td>
              <td className="py-1.5">
                <div className="flex flex-wrap gap-1">
                  {actionsFor(user).map((item) => (
                    <Button
                      key={item.label}
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      disabled={'disabled' in item ? item.disabled : false}
                      aria-label={`${item.label}: ${user.username}`}
                      title={
                        'disabled' in item && item.disabled
                          ? 'It owns universes: transfer or delete them first.'
                          : undefined
                      }
                      onClick={() => {
                        setAction(item.action);
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ActionDialog
        action={action}
        onClose={() => {
          setAction(null);
        }}
      />
    </section>
  );
}
