import {
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  UnsignedByteType,
  WebGLArrayRenderTarget,
  type IUniform,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { bakeInto, type BakeDefinition } from '../bake.ts';

/** One planet's layer: what to bake there, and a key that changes whenever its pixels would. */
export interface PlanetLayer {
  key: string;
  definition: () => BakeDefinition;
}

/**
 * Every planet of a system view in one array texture (M6-T2): a stack of same-size layers, one
 * per planet, that a single shader samples by layer index. The planets keep drawing in one call
 * (rendering.md §2) even though each has its own surface.
 *
 * `update` bakes only the layers whose key changed, so editing one planet re-bakes one layer.
 * The stack grows when more planets arrive (losing its contents, so everything is re-baked);
 * it never shrinks while the view is open.
 */
export class PlanetTextureArray {
  readonly widthPx: number;
  readonly heightPx: number;
  /** The shader uniform to sample: it follows the texture when the stack is replaced. */
  readonly uniform: IUniform<Texture>;
  #target: WebGLArrayRenderTarget;
  #keys: (string | null)[];

  constructor(widthPx: number, heightPx: number, initialLayers = 1) {
    this.widthPx = widthPx;
    this.heightPx = heightPx;
    this.#target = this.#create(initialLayers);
    this.#keys = Array.from({ length: initialLayers }, () => null);
    this.uniform = { value: this.#target.texture };
  }

  /** The key baked into each layer, for the test hooks. */
  get keys(): readonly (string | null)[] {
    return this.#keys;
  }

  /** Bakes the layers whose key changed. Returns whether the texture was replaced. */
  update(gl: WebGLRenderer, layers: readonly PlanetLayer[]): boolean {
    let replaced = false;
    if (layers.length > this.#keys.length) {
      this.#target.dispose();
      this.#target = this.#create(layers.length);
      this.#keys = Array.from({ length: layers.length }, () => null);
      this.uniform.value = this.#target.texture;
      replaced = true;
    }
    // Mipmaps are rebuilt for the whole stack after every layer bake; skip that until the last.
    // (`mipmapsAutoUpdate`, not `generateMipmaps`: the latter also decides how many mip levels
    // the texture is allocated with.)
    const changed = layers.flatMap((layer, index) =>
      this.#keys[index] === layer.key ? [] : [index],
    );
    changed.forEach((index, n) => {
      const layer = layers[index];
      if (!layer) return;
      this.#target.texture.mipmapsAutoUpdate = n === changed.length - 1;
      bakeInto(gl, layer.definition(), this.#target, index);
      this.#keys[index] = layer.key;
    });
    this.#target.texture.mipmapsAutoUpdate = true;
    return replaced;
  }

  /**
   * Frees the GPU texture. The stack stays usable: three.js re-creates the texture on its next
   * use, empty, so every layer is marked for re-baking. (React's development mode unmounts and
   * remounts every component once, which disposes the stack between its first bake and draw.)
   */
  dispose(): void {
    this.#target.dispose();
    this.#keys.fill(null);
  }

  #create(depth: number): WebGLArrayRenderTarget {
    return new WebGLArrayRenderTarget(this.widthPx, this.heightPx, depth, {
      format: RGBAFormat,
      type: UnsignedByteType,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    });
  }
}

let systemPlanets: PlanetTextureArray | null = null;

/**
 * The system view's planet stack, one for the page's life like the bake cache (bake-cache.ts):
 * entering a system again finds its planets already baked, so only a planet whose look
 * changed is re-baked, and the stack isn't rebuilt on every entry (M5's 700 ms transition
 * budget). Its size is the most planets any system view has needed.
 */
export function systemPlanetTextures(widthPx: number, heightPx: number, initialLayers: number) {
  systemPlanets ??= new PlanetTextureArray(widthPx, heightPx, initialLayers);
  return systemPlanets;
}
