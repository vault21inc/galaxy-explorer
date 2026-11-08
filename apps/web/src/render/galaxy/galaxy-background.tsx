import { resolveGalaxySettings, type GalaxySettings } from '@ge/domain';
import { useMemo } from 'react';
import { useQualityPreset } from '@/state/quality.ts';
import { useViewCamera } from '../camera/use-view-camera.ts';
import { CoreGlow } from './core-glow.tsx';
import { DepthStars } from './depth-stars.tsx';
import { galaxyCamera } from './galaxy-camera.ts';
import { GalaxyDisc } from './galaxy-disc.tsx';
import { useGalaxyPoints } from './use-galaxy-points.ts';

interface GalaxyBackgroundProps {
  mapId: string;
  settings: GalaxySettings;
}

/**
 * Everything behind the galaxy view's objects (rendering.md §6), from `map.galaxySettings`
 * with defaults: the baked disc, the depth stars and the core glow. With the sky that's four
 * draw calls (budget: five).
 */
export function GalaxyBackground({ mapId, settings }: GalaxyBackgroundProps) {
  const settingsKey = JSON.stringify(settings);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the settings' content
  const resolved = useMemo(() => resolveGalaxySettings(settings), [settingsKey]);
  const quality = useQualityPreset();
  // The map may ask for fewer stars than the quality setting allows, never more.
  const starCount = Math.min(settings.starPoints ?? quality.starPoints, quality.starPoints);
  const points = useGalaxyPoints(resolved, starCount);
  useViewCamera(galaxyCamera(mapId, resolved));

  return (
    <group key={settingsKey}>
      <GalaxyDisc settings={resolved} />
      <CoreGlow settings={resolved} />
      {points && <DepthStars points={points} />}
    </group>
  );
}
