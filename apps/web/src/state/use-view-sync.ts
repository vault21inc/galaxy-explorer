import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiError } from '@ge/api-client';
import type { GalaxyMap } from '@/api/containers.ts';
import { useReadOptions } from '@/api/read-options.ts';
import {
  clearView,
  expectNavigation,
  navigationApplied,
  requestView,
  trackResolve,
} from '@/render/transition/transition-controller.ts';
import { useNavigation } from './navigation.ts';
import type { ViewEntry } from './navigation-stack.ts';
import { resolveView } from './view-resolve.ts';
import { setViewNavigator, viewPath } from './view-navigator.ts';

/** Why the URL's view can't be shown, for the map page to say so. */
export type ViewProblem = { kind: 'missing' } | { kind: 'error'; error: Error; retry: () => void };

interface ViewSyncArgs {
  universeSlug: string;
  mapSlug: string;
  /** The map in the URL, once its slug is resolved. */
  mapId: string | undefined;
  /** The object in `/view/{objectId}`, or undefined for the galaxy view. */
  objectId: string | undefined;
  maps: readonly GalaxyMap[];
}

/**
 * History state on an entry made by entering a view: which view it was entered from. Leaving
 * goes back through history when that's where the previous entry leads, so Esc and Back agree
 * and history doesn't fill with copies of the galaxy view.
 */
interface EnteredState {
  geEnteredFrom: string;
}

const entryKey = (entry: ViewEntry) => `${entry.level}:${entry.subjectId}`;

/**
 * Keeps the canvas's views in step with the URL (ux.md §9). Every change of address (a link,
 * Back, Forward, a breadcrumb, Esc) is resolved into a chain of views and handed to the
 * transition controller, which animates from what's shown to it. Also installs the navigator
 * (view-navigator.ts) that turns those actions into addresses.
 */
export function useViewSync({
  universeSlug,
  mapSlug,
  mapId,
  objectId,
  maps,
}: ViewSyncArgs): ViewProblem | null {
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const options = useReadOptions();
  const [failure, setFailure] = useState<{ key: string; problem: ViewProblem } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${mapId ?? ''}/${objectId ?? ''}#${attempt.toString()}`;

  // Read by the navigator's callbacks at call time, not captured once.
  const here = useRef({ location, maps, mapId, options });
  useEffect(() => {
    here.current = { location, maps, mapId, options };
  });

  useEffect(() => {
    const kept = (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams();
      const perf = new URLSearchParams(here.current.location.search).get('perf');
      if (perf !== null) params.set('perf', perf);
      for (const [name, value] of Object.entries(extra)) params.set(name, value);
      const search = params.toString();
      return search === '' ? '' : `?${search}`;
    };
    setViewNavigator({
      enter: (id) => {
        const top = useNavigation.getState().stack.at(-1);
        const state: EnteredState | undefined = top ? { geEnteredFrom: entryKey(top) } : undefined;
        expectNavigation();
        void navigate(`${viewPath(universeSlug, mapSlug, id)}${kept()}`, { state });
      },
      exit: () => {
        const { stack } = useNavigation.getState();
        const parent = stack.at(-2);
        const top = stack.at(-1);
        if (!parent || !top) return;
        const entered = here.current.location.state as Partial<EnteredState> | null;
        expectNavigation();
        if (entered?.geEnteredFrom === entryKey(parent)) {
          void navigate(-1);
          return;
        }
        // Opened from a link: the parent view is a new address, with the view just left selected.
        const parentId = parent.level === 'galaxy' ? null : parent.subjectId;
        void navigate(
          `${viewPath(universeSlug, mapSlug, parentId)}${kept({ select: top.subjectId })}`,
        );
      },
      goTo: (id) => {
        expectNavigation();
        void navigate(`${viewPath(universeSlug, mapSlug, id)}${kept()}`);
      },
      show: (id, { select, mapId: targetMapId }) => {
        const { maps: knownMaps, mapId: currentMapId } = here.current;
        const slug =
          targetMapId && targetMapId !== currentMapId
            ? (knownMaps.find((map) => map.id === targetMapId)?.slug ?? mapSlug)
            : mapSlug;
        expectNavigation();
        void navigate(`${viewPath(universeSlug, slug, id)}${kept({ select })}`);
      },
      prefetch: (id) => {
        const { mapId: currentMapId, options: currentOptions } = here.current;
        if (currentMapId === undefined) return;
        // Resolving fills the cache the new view reads; a failure shows when it's entered.
        resolveView(client, currentMapId, id, currentOptions).catch(() => undefined);
      },
    });
    return () => {
      setViewNavigator(null);
    };
  }, [client, navigate, universeSlug, mapSlug]);

  useEffect(() => {
    if (mapId === undefined) return;
    let live = true;
    const retry = () => {
      setAttempt((value) => value + 1);
    };
    void trackResolve(resolveView(client, mapId, objectId ?? null, options)).then(
      (result) => {
        if (!live) return;
        switch (result.kind) {
          case 'view':
            void requestView(result.chain);
            return;
          case 'select': {
            // Doesn't open a view: show the one it's in, with it selected. Replace, so Back
            // doesn't return to an address that only redirects.
            const params = new URLSearchParams(here.current.location.search);
            params.set('select', result.objectId);
            expectNavigation();
            void navigate(
              `${viewPath(universeSlug, mapSlug, result.parentId)}?${params.toString()}`,
              { replace: true },
            );
            return;
          }
          case 'elsewhere': {
            const map = here.current.maps.find((item) => item.id === result.mapId);
            if (!map) {
              setFailure({ key, problem: { kind: 'missing' } });
              return;
            }
            expectNavigation();
            void navigate(
              `${viewPath(universeSlug, map.slug, objectId ?? null)}${here.current.location.search}`,
              { replace: true },
            );
            return;
          }
        }
      },
      (error: unknown) => {
        if (!live) return;
        const missing = error instanceof ApiError && error.status === 404;
        setFailure({
          key,
          problem: missing
            ? { kind: 'missing' }
            : {
                kind: 'error',
                error: error instanceof Error ? error : new Error(String(error)),
                retry,
              },
        });
      },
    );
    return () => {
      live = false;
    };
  }, [client, key, mapId, objectId, options, navigate, universeSlug, mapSlug]);

  // After the resolving effect above, so a new address is never "settled" before it starts.
  useEffect(() => {
    navigationApplied();
  }, [location.key]);

  // Leaving the map pages: no view, and the canvas shows only the sky.
  useEffect(
    () => () => {
      clearView();
    },
    [],
  );

  return failure?.key === key ? failure.problem : null;
}
