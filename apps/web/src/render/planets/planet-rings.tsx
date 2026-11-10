import type { ViewObject } from '@ge/domain';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Mesh,
  type ShaderMaterial,
} from 'three';
import { hexToLinear } from '../color.ts';
import type { BodyBuffers } from '../bodies/body-buffers.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import { useMovePreview, type InstanceRanges } from '../use-move-preview.ts';
import {
  PLANET_RINGS_COLOR,
  PLANET_RINGS_OPACITY,
  PLANET_RINGS_SEGMENTS,
  SYSTEM_PLANET_MAX_PX,
  SYSTEM_PLANET_MIN_PX,
} from '../tuning.ts';

const DEG = Math.PI / 180;

/**
 * Planetary rings in the system view (rendering.md §7): a flat band around each ringed planet,
 * from `rings.innerRadius` to `outerRadius` planet radii, tilted by the planet's axial tilt plus
 * the rings' own tilt, all of them in one draw call. The planet's radius is clamped on screen
 * the same way the planet shader clamps it, so the rings always fit their planet.
 *
 * The geometry is one band: a ring of vertex pairs, inner (`aEdge` 0) and outer (1), around the
 * unit circle in the X/Z plane. Each instance scales and tilts it.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uWorldPerPxAt1;
  attribute float aEdge;
  attribute vec3 aCenter;
  attribute float aRadius;
  attribute vec2 aSpan;         // inner, outer radius in planet radii
  attribute float aTilt;        // radians, about the X axis
  attribute vec3 aColor;
  attribute float aOpacity;
  varying float vAcross;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    vec4 centerView = viewMatrix * vec4(aCenter, 1.0);
    float worldPerPx = uWorldPerPxAt1 * max(-centerView.z, 1e-3);
    float radius = clamp(aRadius, ${SYSTEM_PLANET_MIN_PX.toFixed(1)} * worldPerPx, ${SYSTEM_PLANET_MAX_PX.toFixed(1)} * worldPerPx);
    vec3 local = position * mix(aSpan.x, aSpan.y, aEdge) * radius;
    // Tilt about X: y and z turn into each other.
    float c = cos(aTilt);
    float s = sin(aTilt);
    vec3 tilted = vec3(local.x, local.y * c - local.z * s, local.y * s + local.z * c);
    vAcross = aEdge;
    vColor = aColor;
    vOpacity = aOpacity;
    gl_Position = projectionMatrix * (centerView + vec4(mat3(viewMatrix) * tilted, 0.0));
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying float vAcross;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    // Fine concentric bands, as real rings have, fading in at the inner edge and out at the outer.
    float bands = 0.75 + 0.25 * sin(vAcross * 60.0) * sin(vAcross * 17.0 + 1.3);
    float edges = smoothstep(0.0, 0.08, vAcross) * (1.0 - smoothstep(0.85, 1.0, vAcross));
    gl_FragColor = vec4(vColor, vOpacity * bands * edges);
    #include <colorspace_fragment>
  }
`;

interface PlanetRingsProps {
  objects: readonly ViewObject[];
  buffers: BodyBuffers;
}

export function PlanetRings({ objects, buffers }: PlanetRingsProps) {
  const ringed = useMemo(() => {
    const list: { id: string; index: number; object: ViewObject }[] = [];
    objects.forEach((object, index) => {
      const rings = object.appearance.planet?.rings;
      if (!rings?.enabled || buffers.drawn[index]?.state === 'redacted') return;
      list.push({ id: object.id, index, object });
    });
    return list;
  }, [objects, buffers]);

  const geometry = useMemo(() => {
    const vertexCount = (PLANET_RINGS_SEGMENTS + 1) * 2;
    const positions = new Float32Array(vertexCount * 3);
    const edges = new Float32Array(vertexCount);
    for (let i = 0; i <= PLANET_RINGS_SEGMENTS; i++) {
      const angle = (i / PLANET_RINGS_SEGMENTS) * 2 * Math.PI;
      for (let edge = 0; edge < 2; edge++) {
        const v = i * 2 + edge;
        positions.set([Math.cos(angle), 0, Math.sin(angle)], v * 3);
        edges[v] = edge;
      }
    }
    // Two triangles per segment, between consecutive vertex pairs.
    const indices: number[] = [];
    for (let i = 0; i < PLANET_RINGS_SEGMENTS; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const count = ringed.length;
    const centers = new Float32Array(count * 3);
    const radii = new Float32Array(count);
    const spans = new Float32Array(count * 2);
    const tilts = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    ringed.forEach(({ index, object }, i) => {
      const planet = object.appearance.planet;
      const rings = planet?.rings ?? {};
      centers.set(buffers.centers.subarray(index * 3, index * 3 + 3), i * 3);
      radii[i] = buffers.radii[index] ?? 0;
      const inner = rings.innerRadius ?? 1.4;
      spans.set([inner, Math.max(inner + 0.05, rings.outerRadius ?? 2.2)], i * 2);
      tilts[i] = ((planet?.axialTiltDeg ?? 0) + (rings.tiltDeg ?? 0)) * DEG;
      colors.set(hexToLinear(rings.color ?? PLANET_RINGS_COLOR), i * 3);
      opacities[i] = rings.opacity ?? PLANET_RINGS_OPACITY;
    });
    const instanced = new InstancedBufferGeometry();
    instanced.setIndex(indices);
    instanced.setAttribute('position', new BufferAttribute(positions, 3));
    instanced.setAttribute('aEdge', new BufferAttribute(edges, 1));
    instanced.setAttribute('aCenter', new InstancedBufferAttribute(centers, 3));
    instanced.setAttribute('aRadius', new InstancedBufferAttribute(radii, 1));
    instanced.setAttribute('aSpan', new InstancedBufferAttribute(spans, 2));
    instanced.setAttribute('aTilt', new InstancedBufferAttribute(tilts, 1));
    instanced.setAttribute('aColor', new InstancedBufferAttribute(colors, 3));
    instanced.setAttribute('aOpacity', new InstancedBufferAttribute(opacities, 1));
    instanced.instanceCount = count;
    return instanced;
  }, [ringed, buffers]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  // The rings follow their planet through a move preview.
  const baseCenters = useMemo(
    () => (geometry.getAttribute('aCenter').array as Float32Array).slice(),
    [geometry],
  );
  const ranges: InstanceRanges = useMemo(
    () => new Map(ringed.map(({ id }, i) => [id, [i, 1] as const])),
    [ringed],
  );
  const mesh = useRef<Mesh<InstancedBufferGeometry>>(null);
  useMovePreview(mesh, ranges, baseCenters);

  const uniforms = useMemo(() => ({ uWorldPerPxAt1: { value: 1 } }), []);
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
  });

  if (ringed.length === 0) return null;
  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={3}>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}
