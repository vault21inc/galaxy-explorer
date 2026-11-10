import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  type Mesh,
  type ShaderMaterial,
} from 'three';
import { hoverStore } from '@/state/hover.ts';
import { useSelection } from '@/state/selection.ts';
import { hexToLinear } from '../color.ts';
import { useDrawnGroups } from '../groups/group-index.ts';
import { drawnObject, onDrawnChange } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import {
  HOVER_RING_COLOR,
  HOVER_RING_OPACITY,
  RING_GAP_PX,
  RING_WIDTH_PX,
  SELECTION_RING_COLOR,
  MEMBER_RING_OPACITY,
  SELECTION_RING_OPACITY,
} from '../tuning.ts';

/**
 * Rings around the hovered and selected objects (rendering.md §6): camera-facing squares in one
 * draw call, separate from the bodies, so hovering or selecting never rewrites the bodies'
 * buffers. Each ring sits RING_GAP_PX outside its object's on-screen radius, computed with the
 * same clamp the object's renderer uses, so it hugs a body at every zoom level.
 *
 * The ring itself is drawn by the fragment shader: the square knows its radius in pixels, so it
 * can light only the pixels between (ring − width/2) and (ring + width/2) from the center.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uWorldPerPxAt1;
  uniform float uGapPx;
  uniform float uWidthPx;
  attribute vec3 aCenter;
  attribute float aRadius;
  attribute vec2 aClampPx;     // the object's min and max on-screen radius
  attribute vec4 aColor;       // rgb + opacity
  varying vec2 vCornerPx;
  varying float vRingPx;
  varying vec4 vColor;
  void main() {
    vec4 centerView = viewMatrix * vec4(aCenter, 1.0);
    float worldPerPx = uWorldPerPxAt1 * max(-centerView.z, 1e-3);
    float radiusPx = clamp(aRadius / worldPerPx, aClampPx.x, aClampPx.y);
    vRingPx = radiusPx + uGapPx;
    // The square reaches just past the ring's outer edge.
    float halfSizePx = vRingPx + uWidthPx + 1.0;
    vCornerPx = position.xy * halfSizePx;
    vColor = aColor;
    centerView.xy += position.xy * halfSizePx * worldPerPx;
    gl_Position = projectionMatrix * centerView;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uWidthPx;
  varying vec2 vCornerPx;
  varying float vRingPx;
  varying vec4 vColor;
  void main() {
    // How far this pixel is from the ring's center line, in pixels; fade over one pixel at the
    // edges so the line is smooth without multisampling.
    float offset = abs(length(vCornerPx) - vRingPx);
    float alpha = (1.0 - smoothstep(uWidthPx * 0.5, uWidthPx * 0.5 + 1.0, offset)) * vColor.a;
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(vColor.rgb, alpha);
    #include <colorspace_fragment>
  }
`;

const HOVER = [...hexToLinear(HOVER_RING_COLOR), HOVER_RING_OPACITY];
const SELECTED = [...hexToLinear(SELECTION_RING_COLOR), SELECTION_RING_OPACITY];
const INITIAL_CAPACITY = 64;

function makeGeometry(capacity: number) {
  const quad = new PlaneGeometry(2, 2);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(quad.getIndex());
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('aCenter', new InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  geometry.setAttribute('aRadius', new InstancedBufferAttribute(new Float32Array(capacity), 1));
  geometry.setAttribute(
    'aClampPx',
    new InstancedBufferAttribute(new Float32Array(capacity * 2), 2),
  );
  geometry.setAttribute('aColor', new InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
  geometry.instanceCount = 0;
  quad.dispose();
  return geometry;
}

/** The ids ringed by the last write, for the test hooks. */
let ringed: readonly string[] = [];
export function ringedIds(): readonly string[] {
  return ringed;
}

export function SelectionRings() {
  const invalidate = useThree((state) => state.invalidate);
  const selectedIds = useSelection((state) => state.selectedIds);
  const groups = useDrawnGroups();
  // A selected group's members, each with its group's color (M4-T4). Selected objects keep the
  // selection ring.
  const members = useMemo(() => {
    const selected = new Set(selectedIds);
    const rings = new Map<string, readonly number[]>();
    for (const group of groups) {
      if (!selected.has(group.id)) continue;
      const color = [...hexToLinear(group.color), MEMBER_RING_OPACITY];
      for (const id of group.memberIds) if (!selected.has(id)) rings.set(id, color);
    }
    return rings;
  }, [groups, selectedIds]);
  const needed = selectedIds.length + members.size + 1;
  const capacity = Math.max(INITIAL_CAPACITY, 2 ** Math.ceil(Math.log2(needed)));
  // Rebuilt only when the selection outgrows it, so ordinary changes just rewrite numbers.
  const geometry = useMemo(() => makeGeometry(capacity), [capacity]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  // Writes the rings into the instance buffers. Runs when the selection, the hovered object or
  // the drawn objects change; never per frame.
  const mesh = useRef<Mesh<InstancedBufferGeometry>>(null);
  useEffect(() => {
    const write = () => {
      // Through the mesh, which owns the geometry once mounted.
      const geometry = mesh.current?.geometry;
      if (!geometry) return;
      const hoveredId = hoverStore.getState().hoveredId;
      const ids = [...selectedIds, ...members.keys()];
      if (hoveredId !== null && !selectedIds.includes(hoveredId) && !members.has(hoveredId)) {
        ids.push(hoveredId);
      }
      const centers = geometry.getAttribute('aCenter') as InstancedBufferAttribute;
      const radii = geometry.getAttribute('aRadius') as InstancedBufferAttribute;
      const clamps = geometry.getAttribute('aClampPx') as InstancedBufferAttribute;
      const colors = geometry.getAttribute('aColor') as InstancedBufferAttribute;
      let count = 0;
      const written: string[] = [];
      for (const id of ids) {
        const object = drawnObject(id);
        if (!object || count >= centers.count) continue;
        centers.setXYZ(count, ...object.center);
        radii.setX(count, object.radius);
        clamps.setXY(count, object.minRadiusPx, object.maxRadiusPx);
        const [r = 1, g = 1, b = 1, a = 1] = selectedIds.includes(id)
          ? SELECTED
          : (members.get(id) ?? HOVER);
        colors.setXYZW(count, r, g, b, a);
        written.push(id);
        count++;
      }
      ringed = written;
      for (const attribute of [centers, radii, clamps, colors]) attribute.needsUpdate = true;
      geometry.instanceCount = count;
      invalidate();
    };
    write();
    const stopHover = hoverStore.subscribe(write);
    const stopDrawn = onDrawnChange(write);
    return () => {
      stopHover();
      stopDrawn();
    };
  }, [geometry, selectedIds, members, invalidate]);

  const uniforms = useMemo(
    () => ({
      uWorldPerPxAt1: { value: 1 },
      uGapPx: { value: RING_GAP_PX },
      uWidthPx: { value: RING_WIDTH_PX },
    }),
    [],
  );
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
  });

  return (
    // Drawn last and on top of everything: a ring must never hide behind its own body.
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={10}>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
