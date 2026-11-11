import type { ViewPin } from '@ge/domain';
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
import { useConfigList } from '@/api/hooks.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { hexToLinear } from '../color.ts';
import { QUESTION_CELL, useIconAtlas } from '../icons/icon-atlas.ts';
import { labelText } from '../labels/label-text.ts';
import { publishDrawn, type DrawnObject } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import { PIN_RADIUS_PX, PIN_TOWARD_CAMERA_RADII, REDACTION_COLOR } from '../tuning.ts';
import { pinItems, type PinItem } from './pin-items.ts';

export const PINS = 'pins';

/** What each pin draws, for the test hooks. */
const drawnPins = new Map<string, PinItem>();
export function pinOf(id: string): PinItem | null {
  return drawnPins.get(id) ?? null;
}

const STATES = { normal: 0, redacted: 1, draft: 2 } as const;

/**
 * Pins for places and events on the orbit view's globe (rendering.md §8, M6-T4): one
 * instanced draw of camera-facing quads, PIN_RADIUS_PX on screen at any distance. Each pin is a
 * round head (an event) or a diamond (a place) in its category's color, with its icon from the
 * atlas in white; a redacted pin is grey with "?"; a draft is faded.
 *
 * It sits inside the globe's turning group (globe.tsx), so pins tilt and turn with the surface.
 * The globe hides the pins on its far side by the ordinary depth test. The scene index (picking,
 * hover labels, selection rings) holds every pin in world coordinates, marked as lying on the
 * globe (`onSphere`), so the picker leaves out those on the far side.
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
  varying vec2 vCorner;
  varying vec3 vColor;
  varying float vCell;
  varying float vState;
  varying float vShape;
  void main() {
    vec4 centerView = modelViewMatrix * vec4(aCenter, 1.0);
    // A little nearer the camera, along the line to it (PIN_TOWARD_CAMERA_RADII).
    centerView.xyz += normalize(-centerView.xyz) * uTowardCamera;
    // World units per pixel at this depth: a constant size on screen (rendering.md §6).
    float worldPerPx = uWorldPerPxAt1 * max(-centerView.z, 1e-3);
    vec2 offset = position.xy * uRadiusPx * worldPerPx;
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
    // The shape as a signed distance from its edge (negative inside): a circle for an event, a
    // diamond (a square turned 45°) for a place. fwidth gives one pixel in these units, for a
    // smooth edge at any size.
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

export function Pins({ pins, universeId }: { pins: readonly ViewPin[]; universeId: string }) {
  const invalidate = useThree((state) => state.invalidate);
  const policy = useSpoilerPolicy();
  const categories = useConfigList('event_categories', universeId).data;
  const items = useMemo(() => pinItems(pins, categories ?? [], policy), [pins, categories, policy]);
  const iconKeys = useMemo(
    () => items.flatMap((item) => (item.icon === null ? [] : [item.icon])),
    [items],
  );
  const atlas = useIconAtlas(iconKeys);

  const geometry = useMemo(() => {
    const instanced = new InstancedBufferGeometry();
    // One quad, corners at ±1: the shader scales it to the pin's size.
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
    items.forEach((item, i) => {
      centers.set(item.position, i * 3);
      colors.set(hexToLinear(item.color), i * 3);
      cells[i] = item.icon === null ? QUESTION_CELL : (atlas?.cellOf.get(item.icon) ?? -1);
      states[i] = STATES[item.state];
      shapes[i] = item.shape === 'place' ? 1 : 0;
    });
    instanced.setAttribute('aCenter', new InstancedBufferAttribute(centers, 3));
    instanced.setAttribute('aColor', new InstancedBufferAttribute(colors, 3));
    instanced.setAttribute('aCell', new InstancedBufferAttribute(cells, 1));
    instanced.setAttribute('aState', new InstancedBufferAttribute(states, 1));
    instanced.setAttribute('aShape', new InstancedBufferAttribute(shapes, 1));
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
      uRadiusPx: { value: PIN_RADIUS_PX },
      uTowardCamera: { value: PIN_TOWARD_CAMERA_RADII },
      uAtlas: { value: atlas?.texture ?? null },
      uColumns: { value: atlas?.columns ?? 1 },
      uHasAtlas: { value: atlas ? 1 : 0 },
      uRedacted: { value: hexToLinear(REDACTION_COLOR) },
    }),
    [atlas],
  );
  useEffect(() => {
    invalidate();
  }, [uniforms, geometry, invalidate]);

  const mesh = useRef<Mesh>(null);
  const material = useRef<ShaderMaterial>(null);
  // The globe's turn (tilt and spin) when the pins were last published to the scene index.
  const publishedMatrix = useRef<Float64Array | null>(null);
  const publishedItems = useRef<readonly PinItem[] | null>(null);
  const world = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
    const object = mesh.current;
    if (!object) return;
    // Republished only when the pins or the globe's turn changed (ambient motion turns it), not
    // as the camera moves: the picker leaves out the far side's pins itself (`onSphere`).
    object.updateWorldMatrix(true, false);
    const matrix = object.matrixWorld.elements;
    const last = publishedMatrix.current;
    if (publishedItems.current === items && last && matrix.every((value, i) => value === last[i])) {
      return;
    }
    publishedItems.current = items;
    drawnPins.clear();
    for (const item of items) drawnPins.set(item.id, item);
    publishedMatrix.current = Float64Array.from(matrix);
    publishDrawn(
      PINS,
      items.map((item) => {
        world.set(...item.position).applyMatrix4(object.matrixWorld);
        return drawnPin(item, [world.x, world.y, world.z], policy);
      }),
    );
  });
  useEffect(
    () => () => {
      publishedItems.current = null;
      drawnPins.clear();
      publishDrawn(PINS, null);
    },
    [],
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

function drawnPin(
  item: PinItem,
  center: [number, number, number],
  policy: Parameters<typeof labelText>[1],
): DrawnObject {
  return {
    id: item.id,
    renderer: PINS,
    center,
    radius: 0,
    minRadiusPx: PIN_RADIUS_PX,
    maxRadiusPx: PIN_RADIUS_PX,
    state: item.state,
    color: item.color,
    // Above the moons: a pin is what the pointer is on when they overlap.
    pickPriority: 1.1,
    label: labelText(item.pin, policy),
    labelPriority: 5,
    onSphere: { center: [0, 0, 0], radius: 1 },
  };
}
