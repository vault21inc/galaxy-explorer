import { Link } from 'react-router';
import { useState } from 'react';
import {
  useAdminUniverses,
  useAdminUsers,
  useDeleteAdminUniverse,
  useUpdateAdminUniverse,
  type AdminUniverse,
} from '@/api/admin.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { formatBytes } from '@/lib/bytes.ts';
import { ActionDialog, type AdminAction } from './action-dialog.tsx';
import { formatWhen } from './format-when.ts';

const VISIBILITY_NAMES: Record<AdminUniverse['visibility'], string> = {
  private: 'Private',
  link: 'Link-only',
  public: 'Public',
};

/**
 * The Universes screen (M8-T13, ux.md §13): every universe as facts about it (owner, visibility,
 * objects, media, last change). An admin can open one, to read and edit it as an editor would
 * (D-50), transfer it, take it down (make it private) or delete it.
 */
export function UniversesTab() {
  const universes = useAdminUniverses();
  // Every active account, for a transfer: the Accounts screen lists them all already (D-59).
  const users = useAdminUsers();
  const activeNames = (users.data ?? [])
    .filter((user) => user.disabledAt === null)
    .map((user) => user.username);
  const update = useUpdateAdminUniverse();
  const remove = useDeleteAdminUniverse();
  const [action, setAction] = useState<AdminAction | null>(null);

  const actionsFor = (
    universe: AdminUniverse,
  ): { label: string; action: AdminAction; hidden?: boolean }[] => [
    {
      label: 'Transfer',
      action: {
        title: `Transfer ${universe.name}`,
        description: `It becomes the new owner’s, if their quota has room for its ${formatBytes(universe.mediaBytes)} of media. ${universe.owner ?? 'The installation'} keeps no access.`,
        confirmLabel: 'Transfer',
        input: {
          label: 'Username of the new owner',
          suggestions: activeNames.filter((name) => name !== universe.owner),
        },
        askConfirmation: true,
        run: async ({ input, confirmation }) => {
          await update.mutateAsync({ universeId: universe.id, owner: input, confirmation });
        },
      },
    },
    {
      label: 'Make private',
      hidden: universe.visibility === 'private',
      action: {
        title: `Take ${universe.name} down`,
        description:
          'It becomes private: only its owner and the people it’s shared with can open it, and its share link stops working.',
        confirmLabel: 'Make it private',
        destructive: true,
        askConfirmation: false,
        run: async () => {
          await update.mutateAsync({ universeId: universe.id, visibility: 'private' });
        },
      },
    },
    {
      label: 'Delete',
      action: {
        title: `Delete ${universe.name}`,
        description: 'The universe goes, with everything in it. This can’t be undone.',
        confirmLabel: 'Delete the universe',
        destructive: true,
        confirmText: universe.slug,
        askConfirmation: true,
        run: async ({ confirmation }) => {
          await remove.mutateAsync({ universeId: universe.id, confirmation });
        },
      },
    },
  ];

  return (
    <section aria-label="Universes" className="flex flex-col gap-3">
      {universes.error && (
        <p role="alert" className="text-destructive">
          {errorMessage(universes.error)}
        </p>
      )}
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Universes</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">
              Name
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Owner
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Visibility
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Objects
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Storage
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Last change
            </th>
            <th scope="col" className="py-1 font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {(universes.data ?? []).map((universe) => (
            <tr key={universe.id} className="border-t align-top">
              <th scope="row" className="py-1.5 pr-3 font-medium">
                {universe.name}
                <span className="block text-xs font-normal text-muted-foreground">
                  /u/{universe.slug}
                </span>
              </th>
              <td className="py-1.5 pr-3">{universe.owner ?? 'Installation'}</td>
              <td className="py-1.5 pr-3">{VISIBILITY_NAMES[universe.visibility]}</td>
              <td className="py-1.5 pr-3">{universe.objectCount}</td>
              <td className="py-1.5 pr-3">{formatBytes(universe.mediaBytes)}</td>
              <td className="py-1.5 pr-3">{formatWhen(universe.lastChangeAt)}</td>
              <td className="py-1.5">
                <div className="flex flex-wrap gap-1">
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                    <Link to={`/u/${universe.slug}`} aria-label={`Open: ${universe.name}`}>
                      Open
                    </Link>
                  </Button>
                  {actionsFor(universe)
                    .filter((item) => !item.hidden)
                    .map((item) => (
                      <Button
                        key={item.label}
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        aria-label={`${item.label}: ${universe.name}`}
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
