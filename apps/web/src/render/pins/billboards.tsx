import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Vector3,
  type Mesh,
  type ShaderMaterial,
} from 'three';
import { hexToLinear } from '../color.ts';
import { QUESTION_CELL, useIconAtlas } from '../icons/icon-atlas.ts';
import { publishDrawn, type DrawnObject, type DrawnState } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import { REDACTION_COLOR } from '../tuning.ts';

/** One icon billboard: a globe's pin (pins.tsx) or an event marker (markers/event-markers.tsx). */
export interface BillboardItem {
  id: string;
  /** In the mesh's parent's frame: the globe's own, or the view's. */
  position: readonly [number, number, number];
  /** A diamond (a place, or a marker) rather than a round head (a pin's event). */
  diamond: boolean;
  /** The icon key, or null for a redacted one, which shows "?". */
  icon: string | null;
  color: string;
  state: DrawnState;
  /** Drawn this far from `position` on screen, in CSS pixels right and up. */
  offsetPx: readonly [number, number];
}

const STATES = { normal: 0, redacted: 1, draft: 2 } as const;

/**
 * Icon billboards in one instanced draw (rendering.md §8, M6-T4): camera-facing quads of
 * `radiusPx` on screen at any distance. Each is a round head or a diamond in its color, with its
 * icon from the atlas in white; a redacted one is grey with "?"; a draft is faded.
 *
 * Each is published to the scene index (picking, hover labels, selection rings) in world
 * coordinates, through `drawn`; only when the items or the mesh's place in the world change
 * (a globe's ambient turn), not as the camera moves.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uWorldPerPxAt1;
  uniform float uRadiusPx;
  uniform float uTowardCamera;
  attribute vec3 aCenter;
  attribute vec3 aColor;
  attribute float aCell;
  attribute float aState;
  attribute float aShape;
  attribute vec2 aOffsetPx;
  varying vec2 vCorner;
  varying vec3 vColor;
  varying float vCell;
  varying float vState;
  varying float vShape;
  void main() {
    vec4 centerView = modelViewMatrix * vec4(aCenter, 1.0);
    // A little nearer the camera, along the line to it (PIN_TOWARD_CAMERA_RADII on a globe).
    centerView.xyz += normalize(-centerView.xyz) * uTowardCamera;
    // World units per pixel at this depth: a constant size on screen (rendering.md §6). The
    // view's x and y are the screen's right and up, so a pixel offset is added there too.
    float worldPerPx = uWorldPerPxAt1 * max(-centerView.z, 1e-3);
    vec2 offset = (position.xy * uRadiusPx + aOffsetPx) * worldPerPx;
    gl_Position = projectionMatrix * (centerView + vec4(offset, 0.0, 0.0));
    vCorner = position.xy;
    vColor = aColor;
    vCell = aCell;
    vState = aState;
    vShape = aShape;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uColumns;
  uniform float uHasAtlas;
  uniform vec3 uRedacted;
  varying vec2 vCorner;
  varying vec3 vColor;
  varying float vCell;
  varying float vState;
  varying float vShape;
  void main() {
    // The shape as a signed distance from its edge (negative inside): a circle, or a diamond
    // (a square turned 45°). fwidth gives one pixel in these units, for a smooth edge at any
    // size.
    float distance = vShape > 0.5
      ? (abs(vCorner.x) + abs(vCorner.y)) * 0.75 - 0.75
      : length(vCorner) - 0.8;
    float pixel = fwidth(distance);
    float inside = 1.0 - smoothstep(-pixel, pixel, distance);
    if (inside <= 0.0) discard;
    bool redacted = vState > 0.5 && vState < 1.5;
    vec3 fill = redacted ? uRedacted : vColor;
    // A white rim, then the icon in white on the fill.
    float rim = smoothstep(-0.16 - pixel, -0.16 + pixel, distance);
    vec3 color = mix(fill, vec3(1.0), rim);
    if (uHasAtlas > 0.5 && vCell >= 0.0) {
      // The cell's corner in the atlas (flipped: a canvas texture's first row is at the top).
      vec2 cell = vec2(mod(vCell, uColumns), floor(vCell / uColumns));
      vec2 inCell = vCorner * 0.62 * 0.5 + 0.5;
      vec2 uv = (cell + vec2(inCell.x, 1.0 - inCell.y)) / uColumns;
      uv.y = 1.0 - uv.y;
      float icon = texture2D(uAtlas, uv).a;
      color = mix(color, vec3(1.0), icon * (1.0 - rim));
    }
    float alpha = inside * (vState > 1.5 ? 0.55 : 1.0);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

export function Billboards<T extends BillboardItem>({
  name,
  items,
  radiusPx,
  towardCamera = 0,
  drawn,
}: {
  /** The renderer's name in the scene index. */
  name: string;
  items: readonly T[];
  radiusPx: number;
  /** Drawn this far nearer the camera, in world units. */
  towardCamera?: number;
  /** The scene index's record of one item, at its world position. */
  drawn: (item: T, center: [number, number, number]) => DrawnObject;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const iconKeys = useMemo(
    () => items.flatMap((item) => (item.icon === null ? [] : [item.icon])),
    [items],
  );
  const atlas = useIconAtlas(iconKeys);

  const geometry = useMemo(() => {
    const instanced = new InstancedBufferGeometry();
    // One quad, corners at ±1: the shader scales it to the billboard's size.
    instanced.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
    );
    instanced.setIndex([0, 1, 2, 0, 2, 3]);
    const count = items.length;
    const centers = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const cells = new Float32Array(count);
    const states = new Float32Array(count);
    const shapes = new Float32Array(count);
    const offsets = new Float32Array(count * 2);
    items.forEach((item, i) => {
      centers.set(item.position, i * 3);
      colors.set(hexToLinear(item.color), i * 3);
      cells[i] = item.icon === null ? QUESTION_CELL : (atlas?.cellOf.get(item.icon) ?? -1);
      states[i] = STATES[item.state];
      shapes[i] = item.diamond ? 1 : 0;
      offsets.set(item.offsetPx, i * 2);
    });
    instanced.setAttribute('aCenter', new InstancedBufferAttribute(centers, 3));
    instanced.setAttribute('aColor', new InstancedBufferAttribute(colors, 3));
    instanced.setAttribute('aCell', new InstancedBufferAttribute(cells, 1));
    instanced.setAttribute('aState', new InstancedBufferAttribute(states, 1));
    instanced.setAttribute('aShape', new InstancedBufferAttribute(shapes, 1));
    instanced.setAttribute('aOffsetPx', new InstancedBufferAttribute(offsets, 2));
    instanced.instanceCount = count;
    return instanced;
  }, [items, atlas]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  // A new object when the atlas changes: React Three Fiber copies the values into the material.
  const uniforms = useMemo(
    () => ({
      uWorldPerPxAt1: { value: 1 },
      uRadiusPx: { value: radiusPx },
      uTowardCamera: { value: towardCamera },
      uAtlas: { value: atlas?.texture ?? null },
      uColumns: { value: atlas?.columns ?? 1 },
      uHasAtlas: { value: atlas ? 1 : 0 },
      uRedacted: { value: hexToLinear(REDACTION_COLOR) },
    }),
    [atlas, radiusPx, towardCamera],
  );
  useEffect(() => {
    invalidate();
  }, [uniforms, geometry, invalidate]);

  const mesh = useRef<Mesh>(null);
  const material = useRef<ShaderMaterial>(null);
  // The mesh's place in the world when the items were last published to the scene index.
  const publishedMatrix = useRef<Float64Array | null>(null);
  const publishedItems = useRef<readonly T[] | null>(null);
  const publishedDrawn = useRef<typeof drawn | null>(null);
  const world = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
    const object = mesh.current;
    if (!object) {
      // None left (the mesh is gone): nothing to pick either.
      if (publishedItems.current !== items) {
        publishedItems.current = items;
        publishDrawn(name, []);
      }
      return;
    }
    object.updateWorldMatrix(true, false);
    const matrix = object.matrixWorld.elements;
    const last = publishedMatrix.current;
    if (
      publishedItems.current === items &&
      publishedDrawn.current === drawn &&
      last &&
      matrix.every((value, i) => value === last[i])
    ) {
      return;
    }
    publishedItems.current = items;
    publishedDrawn.current = drawn;
    publishedMatrix.current = Float64Array.from(matrix);
    publishDrawn(
      name,
      items.map((item) => {
        world.set(...item.position).applyMatrix4(object.matrixWorld);
        return drawn(item, [world.x, world.y, world.z]);
      }),
    );
  });
  useEffect(
    () => () => {
      publishedItems.current = null;
      publishDrawn(name, null);
    },
    [name],
  );

  if (items.length === 0) return null;
  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={4}>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  );
}
