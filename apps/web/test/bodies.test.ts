import { describe, expect, it } from 'vitest';
import { clampedRadiusPx } from '../src/render/bodies/body-scale.ts';
import { BODY_STATES, buildBodyBuffers } from '../src/render/bodies/body-buffers.ts';
import { hexToLinear } from '../src/render/color.ts';
import { partitionByRenderer } from '../src/render/registry.ts';
import { REDACTION_COLOR } from '../src/render/tuning.ts';
import { viewObject } from './view-fixtures.ts';

const hidden = { showAll: false, revealed: new Set<string>() };
const shown = { showAll: true, revealed: new Set<string>() };

describe('buildBodyBuffers', () => {
  const objects = [
    viewObject('aster', 'system', { position: [1, 2, 3] }),
    viewObject('erebus', 'system', { isSpoiler: true, appearance: { color: '#ff0000' } }),
    viewObject('draft', 'planet', { status: 'draft', size: 60 }),
  ];

  it('packs each object into the instance buffers', () => {
    const buffers = buildBodyBuffers(objects, hidden, 'bodies');
    expect(buffers.ids).toEqual(['aster', 'erebus', 'draft']);
    expect([...buffers.centers.slice(0, 3)]).toEqual([1, 2, 3]);
    expect(buffers.radii[0]).toBe(120);
    expect(buffers.radii[2]).toBe(60);
    expect([...buffers.states]).toEqual([
      BODY_STATES.normal,
      BODY_STATES.redacted,
      BODY_STATES.draft,
    ]);
  });

  it('draws a hidden spoiler in the redaction color, giving away neither color nor size', () => {
    const buffers = buildBodyBuffers(objects, hidden, 'bodies');
    const [r, g, b] = hexToLinear(REDACTION_COLOR);
    expect(buffers.colors[3]).toBeCloseTo(r);
    expect(buffers.colors[4]).toBeCloseTo(g);
    expect(buffers.colors[5]).toBeCloseTo(b);
    expect(buffers.radii[1]).toBe(0);
    expect(buffers.drawn[1]).toMatchObject({ state: 'redacted', color: REDACTION_COLOR });
  });

  it('draws the spoiler normally once spoilers are shown', () => {
    const buffers = buildBodyBuffers(objects, shown, 'bodies');
    expect(buffers.drawn[1]).toMatchObject({ state: 'normal', color: '#ff0000' });
    expect(buffers.colors[3]).toBeCloseTo(1);
  });
});

describe('clampedRadiusPx', () => {
  // At distance 1, one pixel spans 0.01 world units in this example.
  const worldPerPxAt1 = 0.01;

  it('scales with distance between the limits', () => {
    expect(clampedRadiusPx(1, 10, worldPerPxAt1, 2, 50)).toBeCloseTo(10);
  });

  it('never shrinks below the minimum, however far away', () => {
    expect(clampedRadiusPx(1, 1e9, worldPerPxAt1, 4, 50)).toBe(4);
  });

  it('never grows past the maximum, however close', () => {
    expect(clampedRadiusPx(1, 1e-6, worldPerPxAt1, 4, 50)).toBe(50);
  });
});

describe('partitionByRenderer', () => {
  it('sends regions to the region cloud and everything else to the instanced bodies', () => {
    const groups = partitionByRenderer('galaxy', [
      viewObject('a', 'system'),
      viewObject('n', 'nebula', { size: null }),
      viewObject('p', 'planet'),
      viewObject('m', 'anomaly', { size: null }),
    ]);
    expect(groups.map((group) => [group.renderer.name, group.objects.map((o) => o.id)])).toEqual([
      ['instanced-bodies', ['a', 'p']],
      ['region-cloud', ['n', 'm']],
    ]);
  });

  it('draws nothing for a view without renderers yet', () => {
    expect(partitionByRenderer('orbit', [viewObject('a', 'planet')])).toEqual([]);
  });
});
