import { resolveGalaxySettings, type GalaxySettings } from '@ge/domain';
import { useMemo } from 'react';
import { useQualityPreset } from '@/state/quality.ts';
import { CoreGlow } from './core-glow.tsx';
import { DepthStars } from './depth-stars.tsx';
import { GalaxyDisc } from './galaxy-disc.tsx';
import { useGalaxyPoints } from './use-galaxy-points.ts';

interface GalaxyBackgroundProps {
  settings: GalaxySettings;
  /** Unsaved settings the Map settings panel is previewing (M3-T8), or null. */
  preview: GalaxySettings | null;
}

/** Settings arrive as new objects with every payload; keep one per content. */
function useResolved(settings: GalaxySettings | null) {
  const json = settings ? JSON.stringify(settings) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the JSON is the settings' content
  return useMemo(() => (settings ? resolveGalaxySettings(settings) : null), [json]);
}

/**
 * Everything behind the galaxy view's objects (rendering.md §6), from `map.galaxySettings`
 * with defaults: the baked disc, the depth stars and the core glow. With the sky that's four
 * draw calls (budget: five).
 *
 * While settings are previewed, the disc and the glow follow the preview; the depth stars keep
 * the saved settings and regenerate in the worker once the change is saved (rendering.md §9).
 */
export function GalaxyBackground({ settings, preview }: GalaxyBackgroundProps) {
  const resolved = useResolved(settings);
  const previewed = useResolved(preview);
  const quality = useQualityPreset();
  // The map may ask for fewer stars than the quality setting allows, never more.
  const starCount = Math.min(settings.starPoints ?? quality.starPoints, quality.starPoints);
  const saved = resolved ?? resolveGalaxySettings({});
  const points = useGalaxyPoints(saved, starCount);

  return (
    <group>
      <GalaxyDisc settings={saved} preview={previewed} />
      <CoreGlow settings={previewed ?? saved} />
      {points && <DepthStars points={points} />}
    </group>
  );
}
