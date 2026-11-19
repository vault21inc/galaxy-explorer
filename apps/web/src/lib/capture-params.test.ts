import { describe, expect, it } from 'vitest';
import {
  captureFrame,
  CAPTURE_ASPECTS,
  parseCaptureShot,
  recordingSize,
  stepDuration,
  withCapture,
  withPose,
} from './capture-params.ts';

describe('capture mode’s address (D-55)', () => {
  it('reads a whole shot', () => {
    const shot = parseCaptureShot(
      new URLSearchParams('capture=9x16&cam=1,2,3,0,0,0&to=4,5,6,1,1,1&secs=12&spin=90'),
    );
    expect(shot.aspect?.id).toBe('9x16');
    expect(shot.start).toEqual({ position: [1, 2, 3], target: [0, 0, 0] });
    expect(shot.end).toEqual({ position: [4, 5, 6], target: [1, 1, 1] });
    expect(shot.durationS).toBe(12);
    expect(shot.spinDeg).toBe(90);
  });

  it('ignores what it doesn’t know, and bounds the numbers', () => {
    const shot = parseCaptureShot(new URLSearchParams('capture=2x1&to=nope&secs=-4&spin=1e9'));
    expect(shot.aspect).toBeNull();
    expect(shot.end).toBeNull();
    expect(shot.durationS).toBe(3);
    expect(shot.spinDeg).toBe(3_600);
    expect(parseCaptureShot(new URLSearchParams('secs=abc')).durationS).toBe(10);
  });

  it('turns capture mode on and off, keeping what isn’t the shot’s', () => {
    const on = withCapture(new URLSearchParams('select=a&k=key'), '4x5');
    expect(on.toString()).toBe('select=a&k=key&capture=4x5');
    const shot = withPose(withPose(on, 'to', { position: [1, 2, 3], target: [0, 0, 0] }), 'cam', {
      position: [7, 8, 9],
      target: [0, 0, 0],
    });
    shot.set('secs', '8');
    const off = withCapture(shot, null);
    expect(off.get('select')).toBe('a');
    expect(off.get('k')).toBe('key');
    // Where the view opens stays (D-52); the move's end and length go with capture mode.
    expect(off.get('cam')).toBe('7,8,9,0,0,0');
    expect(off.has('capture')).toBe(false);
    expect(off.has('to')).toBe(false);
    expect(off.has('secs')).toBe(false);
  });

  it('steps the move’s length through the list, stopping at the ends', () => {
    expect(stepDuration(10, 1)).toBe(12);
    expect(stepDuration(10, -1)).toBe(8);
    expect(stepDuration(11, 1)).toBe(12);
    expect(stepDuration(11, -1)).toBe(10);
    expect(stepDuration(60, 1)).toBe(60);
    expect(stepDuration(3, -1)).toBe(3);
  });

  it('frames the largest centred box of the shape, in whole pixels', () => {
    // A landscape window: full height, bars left and right.
    expect(captureFrame(1512, 800, { width: 9, height: 16 })).toEqual({
      left: 531,
      top: 0,
      width: 450,
      height: 800,
    });
    // A tall, narrow window: full width, bars above and below.
    expect(captureFrame(400, 1000, { width: 4, height: 5 })).toEqual({
      left: 0,
      top: 250,
      width: 400,
      height: 500,
    });
    // Exactly the shape, in whole steps of it, so a recording isn't stretched (D-56).
    for (const [width, height] of [
      [1280, 719],
      [1512, 860],
      [1000, 1000],
    ] as const) {
      for (const aspect of CAPTURE_ASPECTS) {
        const frame = captureFrame(width, height, aspect);
        expect(frame.width * aspect.height).toBe(frame.height * aspect.width);
        expect(frame.width).toBeLessThanOrEqual(width);
        expect(frame.height).toBeLessThanOrEqual(height);
        // Never more than one step short of filling the window's tighter side.
        expect(
          Math.min(width - frame.width - aspect.width, height - frame.height - aspect.height),
        ).toBeLessThan(0);
      }
    }
  });

  it('records clips at Instagram’s sizes', () => {
    expect(CAPTURE_ASPECTS.map((aspect) => recordingSize(aspect))).toEqual([
      { width: 1080, height: 1920 },
      { width: 1080, height: 1350 },
      { width: 1080, height: 1440 },
    ]);
  });

  it('reads the frame rate, keeping to the rates on offer', () => {
    expect(parseCaptureShot(new URLSearchParams('fps=60')).fps).toBe(60);
    expect(parseCaptureShot(new URLSearchParams('fps=59')).fps).toBe(30);
    expect(parseCaptureShot(new URLSearchParams('')).fps).toBe(30);
    expect(withCapture(new URLSearchParams('capture=9x16&fps=60'), null).has('fps')).toBe(false);
  });
});
