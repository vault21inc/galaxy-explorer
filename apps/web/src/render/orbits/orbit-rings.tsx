import type { ViewObject } from '@ge/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useSelection } from '@/state/selection.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { movePreview, onMovePreview } from '../scene-index.ts';
import { ORBIT_RING_SEGMENTS, ORBIT_RING_WIDTH_PX } from '../tuning.ts';
import { orbitRings, starCenters, writeOrbitRings, type RingShape } from './orbit-shapes.ts';

/** The rings drawn now, for the test hooks: each body's ring center and radius. */
let drawnRings = new Map<string, RingShape>();
export function orbitRingOf(id: string): RingShape | null {
  return drawnRings.get(id) ?? null;
}

/**
 * Every orbit ring in the system view in one draw call (rendering.md §7): thin lines that stay
 * ORBIT_RING_WIDTH_PX wide at any distance (three's `LineSegments2`, a screen-facing quad per
 * segment). They're depth-tested, so a planet in front of its ring hides it. A body that
 * orbits one star of a binary circles that star (D-29). The selected body's ring lights up,
 * and a dragged body's ring follows it, or its star, all by rewriting the buffers in place: no
 * React render, no new GPU buffer.
 */
export function OrbitRings({ objects }: { objects: readonly ViewObject[] }) {
  const invalidate = useThree((state) => state.invalidate);
  const policy = useSpoilerPolicy();
  const rings = useMemo(() => orbitRings(objects, policy), [objects, policy]);
  const centers = useMemo(() => starCenters(objects), [objects]);

  const line = useMemo(() => {
    if (rings.length === 0) return null;
    const segments = rings.length * ORBIT_RING_SEGMENTS;
    const positions = new Float32Array(segments * 6);
    const colors = new Float32Array(segments * 6);
    writeOrbitRings(rings, centers, positions, colors, new Set(), null);
    const geometry = new LineSegmentsGeometry();
    // `setPositions` and `setColors` keep these arrays, so they can be rewritten in place.
    geometry.setPositions(positions);
    geometry.setColors(colors);
    const material = new LineMaterial({
      linewidth: ORBIT_RING_WIDTH_PX,
      vertexColors: true,
      depthWrite: false,
    });
    const segmentsLine = new LineSegments2(geometry, material);
    segmentsLine.frustumCulled = false;
    segmentsLine.userData = { positions, colors };
    return segmentsLine;
  }, [rings, centers]);

  useEffect(() => {
    if (!line) return;
    const { positions, colors } = line.userData as {
      positions: Float32Array;
      colors: Float32Array;
    };
    const start = line.geometry.getAttribute('instanceStart');
    const colorStart = line.geometry.getAttribute('instanceColorStart');
    const apply = () => {
      const selected = new Set(useSelection.getState().selectedIds);
      drawnRings = writeOrbitRings(rings, centers, positions, colors, selected, movePreview());
      // Both attributes view one interleaved buffer each; flag the buffers for upload.
      if ('data' in start) start.data.needsUpdate = true;
      if ('data' in colorStart) colorStart.data.needsUpdate = true;
      invalidate();
    };
    apply();
    const stopPreview = onMovePreview(apply);
    const stopSelection = useSelection.subscribe(apply);
    return () => {
      stopPreview();
      stopSelection();
      drawnRings = new Map();
    };
  }, [line, rings, centers, invalidate]);

  useEffect(
    () => () => {
      line?.geometry.dispose();
      line?.material.dispose();
    },
    [line],
  );

  // The line width is in pixels of the drawing buffer, so the material needs its size.
  useFrame(({ size }) => {
    line?.material.resolution.set(size.width, size.height);
  });

  return line ? <primitive object={line} /> : null;
}
