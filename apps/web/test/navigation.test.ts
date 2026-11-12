import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryKeys } from '../src/api/keys.ts';
import { arrivalStart, transitionPlan } from '../src/render/transition/transition-plan.ts';
import { systemCamera, systemExtentSu } from '../src/render/system/system-camera.ts';
import {
  SYSTEM_EXIT_EXTENTS,
  SYSTEM_MIN_EXTENT_SU,
  VIEW_ENTER_START_FACTOR,
  VIEW_EXIT_START_FACTOR,
  VIEW_FLY_MS,
  VIEW_REDUCED_FADE_MS,
} from '../src/render/tuning.ts';
import {
  enter,
  exit,
  goTo,
  moveBetween,
  type CameraPose,
  type ViewTarget,
} from '../src/state/navigation-stack.ts';
import { useNavigation } from '../src/state/navigation.ts';
import { resolveView } from '../src/state/view-resolve.ts';

/** The navigation stack and its URL resolution (M5-T1, rendering.md §4, ux.md §9). */

const galaxy: ViewTarget = { level: 'galaxy', subjectId: 'map-1' };
const aster: ViewTarget = { level: 'system', subjectId: 'aster' };
const brennan: ViewTarget = { level: 'system', subjectId: 'brennan' };
const primus: ViewTarget = { level: 'orbit', subjectId: 'primus' };
const pose = (x: number): CameraPose => ({ position: [x, 10, 10], target: [x, 0, 0] });

describe('the navigation stack', () => {
  it('entering saves the pose on the view left and opens the new one without one', () => {
    const start = goTo([], [galaxy], null);
    const inside = enter(start, aster, pose(1));
    expect(inside).toEqual([
      { ...galaxy, cameraPose: pose(1) },
      { ...aster, cameraPose: null },
    ]);
    // The stack is new data: the old one is untouched.
    expect(start).toEqual([{ ...galaxy, cameraPose: null }]);
  });

  it('exiting returns to the parent with the pose it saved', () => {
    const inside = enter(enter(goTo([], [galaxy], null), aster, pose(1)), primus, pose(2));
    const back = exit(inside);
    expect(back).toEqual([
      { ...galaxy, cameraPose: pose(1) },
      { ...aster, cameraPose: pose(2) },
    ]);
    expect(exit(exit(back))).toEqual([{ ...galaxy, cameraPose: pose(1) }]);
  });

  it('goTo across levels keeps the shared views and their poses', () => {
    const inside = enter(enter(goTo([], [galaxy], null), aster, pose(1)), primus, pose(2));
    // From an orbit view straight to another system: the galaxy is shared, the rest replaced.
    const elsewhere = goTo(inside, [galaxy, brennan], pose(3));
    expect(elsewhere).toEqual([
      { ...galaxy, cameraPose: pose(1) },
      { ...brennan, cameraPose: null },
    ]);
    // Two levels down at once (a link to a planet from the galaxy view).
    const deep = goTo(goTo([], [galaxy], null), [galaxy, aster, primus], pose(4));
    expect(deep.map((entry) => entry.cameraPose)).toEqual([pose(4), null, null]);
  });

  it('rebuilds the whole chain from a deep link, with no poses saved', () => {
    expect(goTo([], [galaxy, aster, primus], pose(9))).toEqual([
      { ...galaxy, cameraPose: null },
      { ...aster, cameraPose: null },
      { ...primus, cameraPose: null },
    ]);
  });

  it('names each change, as the transitions need', () => {
    expect(moveBetween([], [galaxy])).toBe('load');
    expect(moveBetween([galaxy], [galaxy, aster])).toBe('enter');
    expect(moveBetween([galaxy], [galaxy, aster, primus])).toBe('enter');
    expect(moveBetween([galaxy, aster, primus], [galaxy])).toBe('exit');
    expect(moveBetween([galaxy, aster], [galaxy, brennan])).toBe('jump');
    expect(moveBetween([galaxy, aster], [galaxy, aster])).toBe('none');
    // Another map shares nothing, not even the galaxy view.
    expect(moveBetween([galaxy], [{ level: 'galaxy', subjectId: 'map-2' }])).toBe('load');
  });
});

describe('the navigation store', () => {
  beforeEach(() => {
    useNavigation.getState().clear();
  });

  it('follows Back and Forward through the URL history as exit and enter', () => {
    // The history, as the URL sync hands it to the store: galaxy → Aster → Back → Forward.
    const { goTo: show } = useNavigation.getState();
    show([galaxy], null, true);
    expect(useNavigation.getState().arrival).toEqual({ move: 'load', from: null, ease: false });

    show([galaxy, aster], pose(1), true);
    expect(useNavigation.getState().arrival).toEqual({ move: 'enter', from: 'map-1', ease: true });

    // Back: the galaxy view returns, at the pose saved when Aster was entered.
    show([galaxy], pose(5), true);
    expect(useNavigation.getState().stack).toEqual([{ ...galaxy, cameraPose: pose(1) }]);
    expect(useNavigation.getState().arrival).toEqual({ move: 'exit', from: 'aster', ease: true });

    // Forward: into Aster again, saving where the galaxy camera is now.
    show([galaxy, aster], pose(6), true);
    expect(useNavigation.getState().stack).toEqual([
      { ...galaxy, cameraPose: pose(6) },
      { ...aster, cameraPose: null },
    ]);
  });

  it('jumps without easing, and ignores a chain that is already shown', () => {
    const { goTo: show } = useNavigation.getState();
    show([galaxy, aster], null, true);
    show([galaxy, brennan], null, true);
    expect(useNavigation.getState().arrival).toEqual({ move: 'jump', from: 'aster', ease: false });
    const before = useNavigation.getState().stack;
    show([galaxy, brennan], pose(1), true);
    expect(useNavigation.getState().stack).toBe(before);
  });
});

describe('transitions', () => {
  it('fly, fade and ease when entering or leaving; a single quick fade with reduced motion', () => {
    expect(transitionPlan('enter', false)).toMatchObject({ flyMs: VIEW_FLY_MS, ease: true });
    expect(transitionPlan('exit', false)).toMatchObject({ flyMs: VIEW_FLY_MS, ease: true });
    expect(transitionPlan('jump', false)).toMatchObject({ flyMs: 0, ease: false });
    expect(transitionPlan('enter', true)).toEqual({
      flyMs: 0,
      fadeOutMs: VIEW_REDUCED_FADE_MS,
      fadeInMs: VIEW_REDUCED_FADE_MS,
      ease: false,
    });
    expect(transitionPlan('load', false)).toEqual({
      flyMs: 0,
      fadeOutMs: 0,
      fadeInMs: 0,
      ease: false,
    });
  });

  it('starts the new camera farther (entering) or nearer (leaving) on the same line of sight', () => {
    const rest: CameraPose = { position: [10, 20, 30], target: [10, 0, 10] };
    expect(arrivalStart('enter', rest).position).toEqual([
      10,
      20 * VIEW_ENTER_START_FACTOR,
      10 + 20 * VIEW_ENTER_START_FACTOR,
    ]);
    const nearer = arrivalStart('exit', rest).position;
    expect(nearer[1]).toBeCloseTo(20 * VIEW_EXIT_START_FACTOR);
    expect(arrivalStart('exit', rest).target).toEqual(rest.target);
  });
});

describe('the system camera', () => {
  const child = (id: string, x: number, z: number, size: number | null = 0.35) =>
    ({ id, position: [x, 0, z], size }) as never;

  it('reaches to the outer edge of the farthest child, and frames an empty system', () => {
    expect(systemExtentSu([])).toBe(SYSTEM_MIN_EXTENT_SU);
    expect(systemExtentSu([child('a', 6, 8), child('b', 1, 0)])).toBeCloseTo(10.35);
    const camera = systemCamera('aster', [child('a', 6, 8)]);
    expect(camera.maxDistance).toBeCloseTo(SYSTEM_EXIT_EXTENTS * 10.35);
    expect(camera.key).toBe('aster');
  });

  it('looks at a child it was left from', () => {
    const camera = systemCamera('aster', [child('primus', 4.5, 1.5)]);
    expect(camera.focusPose?.('primus')?.target).toEqual([4.5, 0, 1.5]);
    expect(camera.focusPose?.('nobody')).toBeNull();
  });
});

describe('resolving a view URL', () => {
  const object = (id: string, baseType: string, explorable: boolean) => ({
    id,
    baseType,
    explorable,
    namePlain: id,
    nameRedacted: id,
    nameSpoiler: false,
    isSpoiler: false,
  });

  function cachedClient(): QueryClient {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.view('galaxy', 'map-1'), {
      map: { id: 'map-1' },
      objects: [object('aster', 'system', true), object('veil', 'nebula', false)],
    });
    client.setQueryData(queryKeys.view('system', 'aster'), {
      map: { id: 'map-1' },
      ancestors: [],
      subject: { ...object('aster', 'system', true), parentId: null },
      children: [object('primus', 'planet', true), object('watch', 'station', false)],
    });
    client.setQueryData(queryKeys.view('orbit', 'primus'), {
      map: { id: 'map-1' },
      ancestors: [object('aster', 'system', true)],
      subject: { ...object('primus', 'planet', true), parentId: 'aster' },
      children: [],
      pins: [],
    });
    return client;
  }

  it('the galaxy view needs nothing', async () => {
    expect(await resolveView(new QueryClient(), 'map-1', null, {})).toEqual({
      kind: 'view',
      chain: [galaxy],
    });
  });

  it('builds the chain from the object’s ancestors', async () => {
    const client = cachedClient();
    expect(await resolveView(client, 'map-1', 'aster', {})).toEqual({
      kind: 'view',
      chain: [galaxy, aster],
    });
    expect(await resolveView(client, 'map-1', 'primus', {})).toEqual({
      kind: 'view',
      chain: [galaxy, aster, primus],
    });
  });

  it('opens the view an object sits in when it doesn’t open one, with it selected', async () => {
    const client = cachedClient();
    expect(await resolveView(client, 'map-1', 'veil', {})).toEqual({
      kind: 'select',
      parentId: null,
      objectId: 'veil',
    });
    expect(await resolveView(client, 'map-1', 'watch', {})).toEqual({
      kind: 'select',
      parentId: 'aster',
      objectId: 'watch',
    });
  });

  it('reads only view payloads from the cache, not the events list beside them (M6-T7)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Cached under `view` too, so it's refreshed with them, but it's no payload; cached first,
    // so it's met before the galaxy view that knows the object.
    client.setQueryData(queryKeys.eventList('map-1'), { map: { id: 'map-1' }, events: [] });
    client.setQueryData(queryKeys.view('galaxy', 'map-1'), {
      map: { id: 'map-1' },
      objects: [object('veil', 'nebula', false)],
    });
    expect(await resolveView(client, 'map-1', 'veil', {})).toEqual({
      kind: 'select',
      parentId: null,
      objectId: 'veil',
    });
  });

  it('points to the right map for an object on another', async () => {
    expect(await resolveView(cachedClient(), 'map-2', 'aster', {})).toEqual({
      kind: 'elsewhere',
      mapId: 'map-1',
    });
  });
});
