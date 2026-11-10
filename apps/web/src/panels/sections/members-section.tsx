import { spoilerKeys } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { unwrap } from '@ge/api-client';
import { api } from '@/api/client.ts';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { refreshAfterWrite } from '@/api/refresh.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { labelText } from '@/render/labels/label-text.ts';
import { Redactable } from '@/richtext/redactable.tsx';
import { useEditor } from '@/state/editor.ts';
import { useSelection } from '@/state/selection.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { useToasts } from '@/state/toasts.ts';
import type { SectionProps } from '../types.ts';
import { SectionHeading } from './section-heading.tsx';

/**
 * A group's members (M4-T2). Names come from the galaxy view already loaded for the map, and
 * selecting one selects the object. In edit mode each has its membership's spoiler flag (a
 * hidden membership leaves the object out of the outline, ux.md §7) and Remove; when reading,
 * a spoiler membership is blacked out until revealed.
 */
export function MembersSection({ entity }: SectionProps) {
  const members = entity.members ?? [];
  const mapId = (entity as { mapId?: string }).mapId;
  const view = useViewPayload('galaxy', mapId, useReadOptions());
  const policy = useSpoilerPolicy();
  const editing = useEditor((state) => state.editing);
  const queryClient = useQueryClient();
  const groupId = entity.id;

  const write = async (send: () => Promise<unknown>) => {
    try {
      await send();
    } catch (error) {
      const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
      useToasts.getState().show(`Couldn't change the members: ${reason}`, 'error');
    } finally {
      await refreshAfterWrite(queryClient, [['group'], ['view']]);
    }
  };
  const headers = (description: string) => ({
    'X-GE-Batch-Description': encodeURIComponent(description),
  });

  const nameOf = (objectId: string) => {
    const object = view.data?.objects.find((item) => item.id === objectId);
    return object ? labelText(object, policy) : 'Unknown object';
  };

  return (
    <section>
      <SectionHeading>Members ({members.length.toString()})</SectionHeading>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <ul aria-label="Members" className="flex flex-col gap-1 text-sm">
          {members.map((member) => {
            const name = nameOf(member.objectId);
            const select = (
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:text-primary"
                onClick={() => {
                  useSelection.getState().select([member.objectId]);
                }}
              >
                {name}
              </button>
            );
            return (
              <li key={member.objectId} className="flex items-center gap-2">
                {editing ? (
                  <>
                    {select}
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Switch
                        aria-label={`${name}'s membership is a spoiler`}
                        checked={member.isSpoiler}
                        onCheckedChange={(checked) => {
                          const description = `${checked ? 'Hide' : 'Show'} “${name}” in “${entity.namePlain}” as a spoiler`;
                          void write(() =>
                            unwrap(
                              api.POST('/api/v1/groups/{groupId}/members', {
                                params: { path: { groupId } },
                                body: {
                                  members: [{ objectId: member.objectId, isSpoiler: checked }],
                                },
                                headers: headers(description),
                              }),
                            ),
                          );
                        }}
                      />
                      Spoiler
                    </label>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${name} from the group`}
                      onClick={() => {
                        const description = `Remove “${name}” from “${entity.namePlain}”`;
                        void write(() =>
                          unwrap(
                            api.DELETE('/api/v1/groups/{groupId}/members', {
                              params: { path: { groupId } },
                              body: { objectIds: [member.objectId] },
                              headers: headers(description),
                            }),
                          ),
                        );
                      }}
                    >
                      <X aria-hidden />
                    </Button>
                  </>
                ) : (
                  <Redactable
                    flagged={member.isSpoiler}
                    revealKey={spoilerKeys.member(groupId, member.objectId)}
                    hiddenText={name}
                  >
                    {select}
                  </Redactable>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
