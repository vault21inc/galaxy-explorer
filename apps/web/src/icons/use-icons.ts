import { unwrap } from '@ge/api-client';
import type { IconSet, IconSummary, IconSvg } from '@ge/domain';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client.ts';

/**
 * The bundled icon sets, from the API (M6-T4, D-32): searching them for the picker, and the
 * drawings of the icons a page needs. Both are fixed for a deployed version, so they're
 * fetched once and kept.
 */

/** The drawings of these keys, by key; those the API doesn't know are missing. */
export function useIconDrawings(keys: readonly string[]) {
  const sorted = [...new Set(keys)].sort();
  return useQuery({
    queryKey: ['icons', 'drawings', sorted],
    queryFn:
      sorted.length === 0
        ? skipToken
        : async ({ signal }) => {
            const found = await unwrap(
              api.GET('/api/v1/icons', { params: { query: { keys: sorted.join(',') } }, signal }),
            );
            return new Map<string, IconSvg>(found.map((icon) => [icon.key, icon]));
          },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

/** Icons matching `query`, in one set or both. */
export function useIconSearch(query: string, set: IconSet | null, limit = 60) {
  return useQuery({
    queryKey: ['icons', 'search', query, set, limit],
    queryFn: async ({ signal }): Promise<IconSummary[]> =>
      unwrap(
        api.GET('/api/v1/icons/search', {
          params: { query: { q: query, limit, ...(set ? { set } : {}) } },
          signal,
        }),
      ),
    staleTime: Number.POSITIVE_INFINITY,
    // The grid keeps showing the last results while the next search loads.
    placeholderData: keepPreviousData,
  });
}

/**
 * An icon as a standalone SVG document in one color, for an `<img>` or for drawing into the
 * pins' atlas. The sets draw in `currentColor`, which the outer `color` attribute sets.
 */
export function iconSvg(icon: IconSvg, color: string, sizePx: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx.toString()}" height="${sizePx.toString()}" ` +
    `viewBox="0 0 ${icon.width.toString()} ${icon.height.toString()}" color="${color}">${icon.body}</svg>`
  );
}

export function iconDataUrl(icon: IconSvg, color: string, sizePx: number): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(icon, color, sizePx))}`;
}
