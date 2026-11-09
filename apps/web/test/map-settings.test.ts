import { beforeEach, describe, expect, it } from 'vitest';
import { sliderScale } from '../src/panels/map-settings/setting-slider.tsx';
import { useGalaxyPreview } from '../src/state/galaxy-preview.ts';

/** Map settings (M3-T8): the sliders' scales and the live preview. */

describe('sliderScale', () => {
  it('a linear slider is the value itself, so an arrow key moves one step', () => {
    const arms = sliderScale(0, 8, 1, false);
    expect([arms.trackMin, arms.trackMax, arms.trackStep]).toEqual([0, 8, 1]);
    expect(arms.toValue(3.4)).toBe(3);
    expect(arms.toValue(9)).toBe(8);
    const twist = sliderScale(0, 3, 0.05, false);
    expect(twist.toValue(1.234)).toBeCloseTo(1.25);
  });

  it('a log slider spends equal track on equal ratios', () => {
    const radius = sliderScale(1_000, 500_000, 100, true);
    expect(radius.toValue(0)).toBe(1_000);
    expect(radius.toValue(1_000)).toBe(500_000);
    // Halfway along the track is the geometric mean, not the midpoint.
    expect(radius.toValue(500)).toBeCloseTo(Math.sqrt(1_000 * 500_000), -2);
    expect(radius.toTrack(radius.toValue(250))).toBeCloseTo(250, -1);
  });
});

describe('the map preview', () => {
  beforeEach(() => {
    useGalaxyPreview.getState().clear();
  });

  it('merges a map’s previewed values, and starts over for another map', () => {
    const { show } = useGalaxyPreview.getState();
    show({ mapId: 'a', galaxySettings: { arms: 3 } });
    show({
      mapId: 'a',
      underlay: { widthLy: 1, rotationDeg: 0, offsetX: 0, offsetZ: 0, opacity: 1, visible: true },
    });
    expect(useGalaxyPreview.getState().preview).toMatchObject({
      mapId: 'a',
      galaxySettings: { arms: 3 },
      underlay: { widthLy: 1 },
    });
    show({ mapId: 'b', galaxySettings: { arms: 1 } });
    expect(useGalaxyPreview.getState().preview).toEqual({
      mapId: 'b',
      galaxySettings: { arms: 1 },
    });
  });
});
