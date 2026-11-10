import { configResources, type ConfigReadOf, type ConfigResource } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { sendDelete, sendWrite } from './fetch-data.ts';
import { refreshAfterWrite } from './refresh.ts';
import { configItemRequest, configListRequest } from './requests.ts';

/**
 * Writing a universe's settings records (M4-T1), generic over the config resources like the
 * read hook. Each write is one request, so one batch in the universe's history. Settings have
 * no version (the last write wins). After each, the resource's lists refresh, and the views,
 * which settings such as group colors feed.
 */
export function useConfigWrites<R extends ConfigResource>(resource: R, universeId: string) {
  const queryClient = useQueryClient();
  const one = configResources[resource].label.one.toLowerCase();
  const refresh = () => refreshAfterWrite(queryClient, [[resource], ['view']]);

  return {
    create: async (body: Record<string, unknown>, name: string) => {
      try {
        return await sendWrite<ConfigReadOf<R>>(
          'POST',
          configListRequest(resource, universeId),
          body,
          `Create ${one} “${name}”`,
        );
      } finally {
        await refresh();
      }
    },
    update: async (id: string, changes: Record<string, unknown>, description: string) => {
      try {
        return await sendWrite<ConfigReadOf<R>>(
          'PATCH',
          configItemRequest(resource, id),
          changes,
          description,
        );
      } finally {
        await refresh();
      }
    },
    remove: async (id: string, name: string) => {
      try {
        await sendDelete(configItemRequest(resource, id), `Delete ${one} “${name}”`);
      } finally {
        await refresh();
      }
    },
  };
}
