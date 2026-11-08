import type { ResolvedGalaxySettings } from '@ge/domain';
import { useEffect, useState } from 'react';
import type { GalaxyPointsRequest, GalaxyPointsResponse } from '@/workers/galaxy-points.worker.ts';
import type { GalaxyPoints } from './galaxy-points.ts';

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, (points: GalaxyPoints) => void>();

/** One worker for the app, started the first time stars are needed. */
function galaxyWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/galaxy-points.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<GalaxyPointsResponse>) => {
      pending.get(event.data.id)?.(event.data.points);
      pending.delete(event.data.id);
    };
  }
  return worker;
}

/**
 * The depth stars for these settings, generated in the worker. Null until they arrive (a few
 * milliseconds), so the disc shows first and the stars join it.
 */
export function useGalaxyPoints(settings: ResolvedGalaxySettings, count: number) {
  // Settings arrive as a new object with every payload; compare their content instead.
  const settingsJson = JSON.stringify(settings);
  const key = `${settingsJson}|${count.toString()}`;
  const [result, setResult] = useState<{ key: string; points: GalaxyPoints } | null>(null);

  useEffect(() => {
    let current = true;
    const id = nextId++;
    pending.set(id, (points) => {
      if (current) setResult({ key, points });
    });
    const request: GalaxyPointsRequest = {
      id,
      settings: JSON.parse(settingsJson) as ResolvedGalaxySettings,
      count,
    };
    galaxyWorker().postMessage(request);
    return () => {
      current = false;
    };
  }, [key, settingsJson, count]);

  // Stars for other settings (the previous map's) are never shown while new ones generate.
  return result?.key === key ? result.points : null;
}
