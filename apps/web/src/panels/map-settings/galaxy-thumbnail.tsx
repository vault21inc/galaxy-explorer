import {
  resolveGalaxySettings,
  sampleGalaxyPosition,
  seededRandom,
  type GalaxySettings,
} from '@ge/domain';
import { useEffect, useRef } from 'react';

/** Stars plotted per thumbnail: enough to show the arms, cheap enough to draw on a click. */
const THUMBNAIL_STARS = 2_500;

/**
 * A preset's look (M3-T8): stars sampled from the very density the disc and the depth stars use
 * (`sampleGalaxyPosition`), plotted from above on a 2D canvas. No WebGL, so the panel's
 * thumbnails cost the canvas nothing.
 */
export function GalaxyThumbnail({
  settings,
  sizePx,
}: {
  settings: GalaxySettings;
  sizePx: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const json = JSON.stringify(settings);

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const resolved = resolveGalaxySettings(JSON.parse(json) as GalaxySettings);
    const scale = sizePx / (2.2 * resolved.radiusLy);
    const random = seededRandom(resolved.seed);
    context.fillStyle = '#05060a';
    context.fillRect(0, 0, sizePx, sizePx);
    // Each star adds light, so crowded arms glow.
    context.globalCompositeOperation = 'lighter';
    for (let i = 0; i < THUMBNAIL_STARS; i++) {
      const [x, , z] = sampleGalaxyPosition(resolved, random);
      const r = Math.hypot(x, z) / resolved.radiusLy;
      context.fillStyle = r < 0.2 ? resolved.colors.core : resolved.colors.arm;
      context.globalAlpha = 0.5;
      // The canvas's y runs down the screen; -z keeps the view the canvas shows from above.
      context.fillRect(sizePx / 2 + x * scale, sizePx / 2 - z * scale, 1, 1);
    }
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
  }, [json, sizePx]);

  return (
    <canvas
      ref={canvas}
      width={sizePx}
      height={sizePx}
      aria-hidden
      className="rounded"
      style={{ width: sizePx, height: sizePx }}
    />
  );
}
