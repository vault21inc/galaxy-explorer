import { unwrap, type components } from '@ge/api-client';
import type { EntityKind, ImageRole } from '@ge/domain';
import { skipToken, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.ts';
import { queryKeys } from './keys.ts';
import { refreshAfterWrite } from './refresh.ts';

/** Images: the universe's library (assets) and the images attached to entities (M3-T7). */

export type ImageRead = components['schemas']['ImageRead'];
/** An uploaded image, as the API returns it. */
export type Asset = components['schemas']['AssetRead'];
type ImageChanges = Partial<Pick<ImageRead, 'role' | 'caption' | 'isSpoiler' | 'sortKey'>>;
export type AssetMetadata = Partial<
  Record<'altText' | 'credit' | 'sourceUrl' | 'license', string | null>
>;

/**
 * Uploads one image file. The same file twice returns the asset already there. Goes through
 * the shared client, so the upload is an undo step like any other change.
 */
export async function uploadAsset(universeId: string, file: File): Promise<Asset> {
  const form = new FormData();
  form.append('file', file);
  const result: unknown = await unwrap(
    api.POST('/api/v1/universes/{universeId}/assets', {
      params: { path: { universeId } },
      // The browser sets the multipart boundary itself; JSON-encoding it would break it.
      body: form as never,
      bodySerializer: (body: unknown) => body as FormData,
    }),
  );
  return result as Asset;
}

/** One asset by id, or nothing while there's no id. */
export function useAsset(assetId: string | null | undefined) {
  return useQuery({
    queryKey: ['asset', 'detail', assetId ?? ''],
    queryFn: assetId
      ? ({ signal }) =>
          unwrap(api.GET('/api/v1/assets/{assetId}', { params: { path: { assetId } }, signal }))
      : skipToken,
    // An asset's files never change; its credit rarely does, and writes refresh ['asset'].
    staleTime: Infinity,
  });
}

/** The universe's images, newest first, a page at a time: the asset picker's library. */
export function useAssetLibrary(universeId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.assets(universeId),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        api.GET('/api/v1/universes/{universeId}/assets', {
          params: {
            path: { universeId },
            query: { limit: 60, ...(pageParam ? { cursor: pageParam } : {}) },
          },
          signal,
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/**
 * Writing images and their assets. Every write refreshes the entity kind (its images embed the
 * asset), the views, and the library.
 */
export function useImageWrites(kind: EntityKind, entityId: string) {
  const queryClient = useQueryClient();
  const refresh = () => refreshAfterWrite(queryClient, [[kind], ['asset']]);
  const imagePath = (image: Pick<ImageRead, 'assetId' | 'role'>) => ({
    path: { entityId, assetId: image.assetId, role: image.role },
  });

  return {
    attach: async (assetId: string, role: ImageRole = 'gallery') => {
      await unwrap(
        api.POST('/api/v1/entities/{entityId}/images', {
          params: { path: { entityId } },
          body: { assetId, role },
        }),
      );
      await refresh();
    },
    update: async (image: ImageRead, changes: ImageChanges) => {
      await unwrap(
        api.PATCH('/api/v1/entities/{entityId}/images/{assetId}/{role}', {
          params: imagePath(image),
          body: changes,
        }),
      );
      await refresh();
    },
    detach: async (image: ImageRead) => {
      await unwrap(
        api.DELETE('/api/v1/entities/{entityId}/images/{assetId}/{role}', {
          params: imagePath(image),
        }),
      );
      await refresh();
    },
    describe: async (assetId: string, metadata: AssetMetadata) => {
      await unwrap(
        api.PATCH('/api/v1/assets/{assetId}', { params: { path: { assetId } }, body: metadata }),
      );
      await refresh();
    },
  };
}
