import { describe, expect, it } from 'vitest';
import { buildRegionBuffers } from '../src/render/regions/region-buffers.ts';
import {
  REDACTION_COLOR,
  REGION_BILLBOARDS_MAX,
  REGION_BILLBOARDS_MIN,
} from '../src/render/tuning.ts';
import { viewObject } from './view-fixtures.ts';

const hidden = { showSpoilers: false };
const region = (id: string, baseType: 'nebula' | 'anomaly', density: number, extra = {}) =>
  viewObject(id, baseType, {
    size: null,
    position: [1_000, 0, -2_000],
    appearance: {
      color: '#7a5cff',
      region: { radius: 2_000, density, shape: 'sphere', color: '#7a5cff' },
    },
    ...extra,
  });

describe('buildRegionBuffers', () => {
  it('gives denser regions more billboards, within the limits', () => {
    expect(buildRegionBuffers([region('a', 'nebula', 0)], hidden, 'r').count).toBe(
      REGION_BILLBOARDS_MIN,
    );
    expect(buildRegionBuffers([region('a', 'nebula', 1)], hidden, 'r').count).toBe(
      REGION_BILLBOARDS_MAX,
    );
  });

  it('keeps every billboard inside the region', () => {
    const buffers = buildRegionBuffers([region('a', 'nebula', 0.5)], hidden, 'r');
    for (let i = 0; i < buffers.count; i++) {
      const dx = (buffers.centers[i * 3] ?? 0) - 1_000;
      const dy = buffers.centers[i * 3 + 1] ?? 0;
      const dz = (buffers.centers[i * 3 + 2] ?? 0) + 2_000;
      expect(Math.hypot(dx, dy, dz)).toBeLessThanOrEqual(2_000);
    }
  });

  it('keeps the same shape for the same region, and differs between regions', () => {
    const first = buildRegionBuffers([region('a', 'nebula', 0.5)], hidden, 'r').centers;
    const again = buildRegionBuffers([region('a', 'nebula', 0.5)], hidden, 'r').centers;
    const other = buildRegionBuffers([region('b', 'nebula', 0.5)], hidden, 'r').centers;
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it('adds light for nebulae and covers for anomalies', () => {
    const buffers = buildRegionBuffers(
      [region('n', 'nebula', 0), region('m', 'anomaly', 0)],
      hidden,
      'r',
    );
    expect(buffers.additive[0]).toBe(1);
    expect(buffers.additive[REGION_BILLBOARDS_MIN]).toBe(0);
  });

  it('greys out a hidden spoiler region', () => {
    const buffers = buildRegionBuffers(
      [region('s', 'nebula', 0, { isSpoiler: true })],
      hidden,
      'r',
    );
    expect(buffers.drawn[0]).toMatchObject({ state: 'redacted', color: REDACTION_COLOR });
    expect(buffers.additive[0]).toBe(0);
  });
});
