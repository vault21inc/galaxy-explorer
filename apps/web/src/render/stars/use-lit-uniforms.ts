import { useFrame } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import type { ShaderMaterial } from 'three';
import { onLightsChange, writeLights, type lightUniforms } from './system-lights.ts';

/**
 * Keeps a lit material's light uniforms in step with the system's stars, and draws a frame
 * when they change (a star added, recolored or dragged). Writing uniforms allocates nothing.
 *
 * The lights are written to the material's own uniforms, before each frame it draws, never to
 * the object handed to `<shaderMaterial uniforms>`: React Three Fiber copies each uniform from
 * that object into the material's (`{ ...uniform }`, to keep the material's references
 * stable), so a later write to the original's `value` never reaches the shader. Vectors are
 * shared by that copy, but the light count, a plain number, isn't: until M6-T2 it stayed 0
 * and planets and belts were lit by the ambient light alone.
 */
export function useLitUniforms(
  name: string,
  material: RefObject<ShaderMaterial | null>,
  invalidate: () => void,
): void {
  useEffect(() => onLightsChange(invalidate), [invalidate]);
  useEffect(() => {
    litMaterials.set(name, material);
    return () => {
      litMaterials.delete(name);
    };
  }, [name, material]);
  useFrame(() => {
    const uniforms = material.current?.uniforms;
    if (uniforms && 'uLightCount' in uniforms) {
      writeLights(uniforms as ReturnType<typeof lightUniforms>);
    }
  });
}

const litMaterials = new Map<string, RefObject<ShaderMaterial | null>>();

/**
 * How many stars each lit renderer's material holds now, by renderer, for the test hooks:
 * what the shader actually uses, which caught planets lit by no star at all (M6-T2).
 */
export function litLightCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [name, material] of litMaterials) {
    const count: unknown = material.current?.uniforms.uLightCount?.value;
    if (typeof count === 'number') counts[name] = count;
  }
  return counts;
}
