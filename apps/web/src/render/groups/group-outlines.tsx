import type { SpoilerPolicy, ViewGroup, ViewObject } from '@ge/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import {
  GROUP_DASH_PX,
  GROUP_FILL_RENDER_ORDER,
  GROUP_GAP_PX,
  GROUP_LINE_RENDER_ORDER,
} from '../tuning.ts';
import { publishGroups } from './group-index.ts';
import { groupShapes } from './group-shapes.ts';
import { perSegmentWidthLineMaterial } from './line-material.ts';
import { buildFillBuffers, buildLineBuffers, type LineBuffers } from './outline-buffers.ts';

/**
 * Group outlines (rendering.md §6, M4-T3): every group's outline in two draw calls, one for
 * solid lines and one for dashed, plus one for all the fills. Rebuilt only when the groups,
 * their members, positions or the spoiler policy change; the camera moving costs nothing here
 * but two uniform updates.
 */
export function GroupOutlines({
  groups,
  objects,
  galaxyRadiusLy,
}: {
  groups: readonly ViewGroup[];
  objects: readonly ViewObject[];
  galaxyRadiusLy: number;
}) {
  const policy: SpoilerPolicy = useSpoilerPolicy();
  const invalidate = useThree((state) => state.invalidate);
  const shapes = useMemo(
    () => groupShapes(groups, objects, policy, galaxyRadiusLy),
    [groups, objects, policy, galaxyRadiusLy],
  );

  const solid = useMemo(
    () =>
      lineObject(
        shapes.filter((shape) => !shape.dashed),
        false,
      ),
    [shapes],
  );
  const dashed = useMemo(
    () =>
      lineObject(
        shapes.filter((shape) => shape.dashed),
        true,
      ),
    [shapes],
  );
  const fill = useMemo(() => fillMesh(shapes), [shapes]);

  useEffect(() => {
    publishGroups(shapes);
    invalidate();
    return () => {
      publishGroups([]);
    };
  }, [shapes, invalidate]);

  // What `new` made is freed when replaced or unmounted (AGENTS.md).
  useEffect(
    () => () => {
      for (const line of [solid, dashed]) {
        line?.geometry.dispose();
        line?.material.dispose();
      }
      fill?.geometry.dispose();
      fill?.material.dispose();
    },
    [solid, dashed, fill],
  );

  // LineMaterial needs the drawing buffer's size to turn pixel widths into clip space. Dashes are
  // measured along the line in light-years, so their scale follows the camera's distance to keep
  // them about GROUP_DASH_PX long on screen near the target. Setting uniforms allocates nothing.
  useFrame(({ camera, size, controls }) => {
    const perPx = worldPerPxAt1(camera, size.height);
    const target = (controls as { distance?: number } | null)?.distance;
    const distance = target ?? camera.position.length();
    const dashScale = 1 / Math.max(perPx * distance, 1e-6);
    if (solid) frameUniforms(solid, size.width, size.height, dashScale);
    if (dashed) frameUniforms(dashed, size.width, size.height, dashScale);
  });

  return (
    <>
      {fill && <primitive object={fill} />}
      {solid && <primitive object={solid} />}
      {dashed && <primitive object={dashed} />}
    </>
  );
}

function frameUniforms(line: LineSegments2, width: number, height: number, dashScale: number) {
  line.material.resolution.set(width, height);
  line.material.dashScale = dashScale;
}

function lineObject(shapes: Parameters<typeof buildLineBuffers>[0], dashed: boolean) {
  const buffers: LineBuffers = buildLineBuffers(shapes);
  if (buffers.segmentCount === 0) return null;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(buffers.positions);
  geometry.setColors(buffers.colors);
  geometry.setAttribute('instanceWidth', new InstancedBufferAttribute(buffers.widths, 1));
  const material = perSegmentWidthLineMaterial(dashed);
  if (dashed) {
    material.dashSize = GROUP_DASH_PX;
    material.gapSize = GROUP_GAP_PX;
  }
  const line = new LineSegments2(geometry, material);
  // Each dash's distance along the line, from the start of all segments.
  if (dashed) line.computeLineDistances();
  line.renderOrder = GROUP_LINE_RENDER_ORDER;
  line.frustumCulled = false;
  return line;
}

function fillMesh(shapes: Parameters<typeof buildFillBuffers>[0]) {
  const fills = shapes.filter((shape) => shape.fillOpacity > 0);
  if (fills.length === 0) return null;
  const { positions, colors, index } = buildFillBuffers(fills);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  // Four components per color: three.js then reads the fourth as each vertex's alpha.
  geometry.setAttribute('color', new BufferAttribute(colors, 4));
  geometry.setIndex(new BufferAttribute(index, 1));
  const material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Seen from below the plane too. three draws a transparent double-sided mesh twice (back
    // faces, then front) so curved shapes blend in order; a flat fill needs one pass.
    side: DoubleSide,
    forceSinglePass: true,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = GROUP_FILL_RENDER_ORDER;
  mesh.frustumCulled = false;
  return mesh;
}
