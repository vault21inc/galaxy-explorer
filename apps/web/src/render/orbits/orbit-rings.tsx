import type { ViewObject } from '@ge/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useSelection } from '@/state/selection.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { movePreview, onMovePreview } from '../scene-index.ts';
import { viewToEquator } from './equator-frame.ts';
import { ORBIT_RING_SEGMENTS, ORBIT_RING_WIDTH_PX } from '../tuning.ts';
import { orbitRings, starCenters, writeOrbitRings, type RingShape } from './orbit-shapes.ts';

/**
 * The rings drawn now, for the test hooks: each body's ring center and radius, in the frame the
 * rings are built in (the planet's own, in a tilted orbit view).
 */
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
export function OrbitRings({
  objects,
  tiltRad = 0,
}: {
  objects: readonly ViewObject[];
  /**
   * The orbit view's planet's axial tilt (D-60): `objects` are drawn turned by it, and each
   * ring lies in the plane of the equator. The rings are built in the planet's own frame, flat
   * as in the system view, and the group they're drawn in turns them into place.
   */
  tiltRad?: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const policy = useSpoilerPolicy();
  const flat = useMemo(
    () =>
      tiltRad === 0
        ? objects
        : objects.map((object) => ({
            ...object,
            position: viewToEquator(object.position, tiltRad),
          })),
    [objects, tiltRad],
  );
  const rings = useMemo(() => orbitRings(flat, policy), [flat, policy]);
  const centers = useMemo(() => starCenters(flat), [flat]);

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
      // A drag's shift is in the view; the rings are built in the planet's frame.
      const preview = movePreview();
      const shift =
        preview && tiltRad !== 0
          ? { ...preview, delta: viewToEquator(preview.delta, tiltRad) }
          : preview;
      drawnRings = writeOrbitRings(rings, centers, positions, colors, selected, shift);
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
  }, [line, rings, centers, tiltRad, invalidate]);

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

  if (!line) return null;
  return tiltRad === 0 ? (
    <primitive object={line} />
  ) : (
    <group rotation-x={tiltRad}>
      <primitive object={line} />
    </group>
  );
}
