import { describe, expect, it } from 'vitest';
import { frameSphere, type FrameTarget } from './fly-to.ts';

const galaxy = {
  frameMinRadius: 8,
  frameNeighbors: { count: 2, minCount: 2, gap: 4, padding: 1.25, maxRadius: 1_500 },
};
const system = { frameMinRadius: 0.6, frameNeighbors: undefined };

const body = (id: string, x: number, z = 0, radius = 120): FrameTarget => ({
  id,
  center: [x, 0, z],
  radius,
});

describe('frameSphere', () => {
  const sun = body('sun', 0);
  const near = [body('a', 4), body('b', -10), body('c', 25), body('far', 20_000)];

  it('frames one body out to its nearest neighbors, not by its drawn radius (D-61)', () => {
    const sphere = frameSphere([sun], [sun, ...near], galaxy);
    expect(sphere.center.toArray()).toEqual([0, 0, 0]);
    // The second nearest is 10 ly away; padded by a quarter.
    expect(sphere.radius).toBe(12.5);
  });

  it('leaves routes and event markers out of the neighbors', () => {
    const route: FrameTarget = { ...body('route', 1), waypointIds: ['sun', 'a'], curve: [] };
    const marker: FrameTarget = { ...body('marker', 0), offsetPx: [12, 12] };
    expect(frameSphere([sun], [sun, route, marker, ...near], galaxy).radius).toBe(12.5);
  });

  it('frames a lone body at the widest neighborhood, and a crowded one at the least', () => {
    expect(frameSphere([sun], [sun], galaxy).radius).toBe(1_500);
    const crowd = [body('a', 0.1), body('b', 0.2)];
    expect(frameSphere([sun], [sun, ...crowd], galaxy).radius).toBe(8);
  });

  it('frames several bodies, as a group’s members are, by where they are', () => {
    const sphere = frameSphere([body('a', -30), body('b', 30)], near, galaxy);
    expect(sphere.center.toArray()).toEqual([0, 0, 0]);
    expect(sphere.radius).toBeCloseTo(30 * 1.25);
  });

  it('keeps a region’s size, and a ring’s disc', () => {
    const nebula: FrameTarget = { ...body('nebula', 0, 0, 400), shape: 'sphere' };
    expect(frameSphere([nebula], [nebula, ...near], galaxy).radius).toBe(400);
    const ring = body('ring', 0, 0, 0);
    expect(frameSphere([{ ...ring, radius: 9_000, shape: 'ring' }], near, galaxy).radius).toBe(
      9_000,
    );
  });

  it('frames a line by its whole length', () => {
    const rift: FrameTarget = {
      ...body('rift', 0, 0, 0),
      shape: 'rift',
      curve: [
        [-500, 0, 0],
        [0, 0, 0],
        [500, 0, 0],
      ],
    };
    const sphere = frameSphere([rift], [rift, ...near], galaxy);
    expect(sphere.center.toArray()).toEqual([0, 0, 0]);
    expect(sphere.radius).toBeCloseTo(500 * 1.25);
  });

  it('elsewhere frames a body at its own size, or the view’s least', () => {
    expect(frameSphere([body('planet', 3, 0, 0.1)], [], system).radius).toBe(0.6);
    expect(frameSphere([body('star', 0, 0, 2)], [], system).radius).toBe(2);
  });
});
