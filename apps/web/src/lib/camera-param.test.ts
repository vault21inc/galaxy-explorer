import { describe, expect, it } from 'vitest';
import { formatCameraParam, parseCameraParam, viewLink } from './camera-param.ts';

const pose = {
  position: [23_548.123_456, -68.5, 12_520.8] as [number, number, number],
  target: [0.000_123_456_7, 0, -3.25] as [number, number, number],
};

describe('the cam parameter (ux.md §9)', () => {
  it('round-trips a pose to six significant digits', () => {
    const text = formatCameraParam(pose);
    expect(text).toBe('23548.1,-68.5,12520.8,0.000123457,0,-3.25');
    expect(parseCameraParam(text)).toEqual({
      position: [23_548.1, -68.5, 12_520.8],
      target: [0.000_123_457, 0, -3.25],
    });
  });

  it('ignores anything that isn’t six sane numbers', () => {
    expect(parseCameraParam(null)).toBeNull();
    expect(parseCameraParam('')).toBeNull();
    expect(parseCameraParam('1,2,3,4,5')).toBeNull();
    expect(parseCameraParam('1,2,3,4,5,6,7')).toBeNull();
    expect(parseCameraParam('1,2,x,4,5,6')).toBeNull();
    expect(parseCameraParam('1,2,,4,5,6')).toBeNull();
    expect(parseCameraParam('1,2,Infinity,4,5,6')).toBeNull();
    expect(parseCameraParam('1e9,0,0,0,0,0')).toBeNull();
    // Looking at itself: no direction.
    expect(parseCameraParam('1,2,3,1,2,3')).toBeNull();
  });

  it('builds a link to the view on screen, keeping its selection and share key', () => {
    const link = viewLink(
      {
        origin: 'https://galaxy.example',
        pathname: '/u/milky-way/present-day/view/abc',
        search: '?select=earth&k=key1&cam=1,1,1,0,0,0',
      },
      { position: [1, 2, 3], target: [0, 0, 0] },
    );
    expect(link).toBe(
      'https://galaxy.example/u/milky-way/present-day/view/abc?select=earth&k=key1&cam=1,2,3,0,0,0',
    );
  });
});
