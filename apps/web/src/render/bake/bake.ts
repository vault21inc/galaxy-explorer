import {
  BufferAttribute,
  BufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  WebGLRenderTarget,
  type IUniform,
  type WebGLRenderer,
} from 'three';

/**
 * Baking (rendering.md §9): run a generator shader once over every pixel of a texture, instead
 * of computing the same noise for every screen pixel on every frame. It takes milliseconds,
 * and afterwards drawing the result costs one texture lookup per pixel.
 */
export interface BakeDefinition {
  /**
   * A fragment shader that receives `vUv` (0–1 across the texture) and writes `gl_FragColor`.
   * The values are stored as they are, in 8 bits per channel, so encode wide-range values
   * (the galaxy disc stores the square root of linear light; its draw shader squares it).
   */
  fragmentShader: string;
  uniforms: Record<string, IUniform>;
}

/** Covers the whole target with one triangle bigger than the screen, cheaper than a quad. */
const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Renders the definition into a new render target with mipmaps and returns it. Its `.texture`
 * is the result; the caller owns the target and must `dispose()` it (the bake cache does).
 */
export function bake(
  gl: WebGLRenderer,
  definition: BakeDefinition,
  widthPx: number,
  heightPx: number,
): WebGLRenderTarget {
  const target = bakeTarget(widthPx, heightPx);
  bakeInto(gl, definition, target);
  return target;
}

/** An empty target for bakes: 8-bit RGBA with mipmaps, no depth buffer. */
export function bakeTarget(widthPx: number, heightPx: number): WebGLRenderTarget {
  return new WebGLRenderTarget(widthPx, heightPx, {
    format: RGBAFormat,
    type: UnsignedByteType,
    depthBuffer: false,
    // Mipmaps are pre-shrunk copies for viewing from afar (rendering.md §1, concept 8). three.js
    // builds them right after rendering into a target that asks for them.
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
  });
}

/**
 * Renders the definition into an existing target, replacing what was there. The live preview
 * of galaxy settings re-bakes into one reused target this way, so dragging a slider never
 * creates textures (M3-T8).
 */
export function bakeInto(
  gl: WebGLRenderer,
  definition: BakeDefinition,
  target: WebGLRenderTarget,
): void {
  const geometry = new BufferGeometry();
  // x, y, z per corner: three.js reads positions as 3D even when the shader uses only x and y.
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const material = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: definition.fragmentShader,
    uniforms: definition.uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  // The vertex shader ignores the camera, but render() needs one.
  const camera = new OrthographicCamera();

  const previousTarget = gl.getRenderTarget();
  gl.setRenderTarget(target);
  gl.render(mesh, camera);
  gl.setRenderTarget(previousTarget);

  geometry.dispose();
  material.dispose();
}
