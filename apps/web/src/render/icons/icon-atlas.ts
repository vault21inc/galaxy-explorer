import type { IconSvg } from '@ge/domain';
import { useEffect, useMemo, useState } from 'react';
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter } from 'three';
import { iconSvg, useIconDrawings } from '@/icons/use-icons.ts';
import { ICON_ATLAS_CELL_PX, ICON_ATLAS_PX } from '../tuning.ts';

/**
 * The icon atlas (rendering.md §8, M6-T4): the icons the pins use, rasterized once into one
 * texture, white on transparent, so one draw of instanced pins can show every category's icon
 * (each pin picks its cell). Cell 0 is the "?" a redacted pin shows (ux.md §6).
 *
 * The icons are SVGs from the API (icons/use-icons.ts); the browser rasterizes each through an
 * `<img>`, which runs no scripts, onto a canvas.
 */
export interface IconAtlas {
  texture: CanvasTexture;
  /** Cells across a row. */
  columns: number;
  /** The cell of each icon key; the "?" is cell 0. */
  cellOf: ReadonlyMap<string, number>;
}

export const QUESTION_CELL = 0;
/** The share of a cell the icon fills, leaving a margin so neighbours don't bleed in. */
const ICON_FILL = 0.78;

/** The atlas for these keys, or null while their drawings load and rasterize. */
export function useIconAtlas(keys: readonly string[]): IconAtlas | null {
  const drawings = useIconDrawings(keys).data;
  const [atlas, setAtlas] = useState<IconAtlas | null>(null);
  const wanted = useMemo(() => [...new Set(keys)].sort(), [keys]);
  const signature = wanted.join(',');

  useEffect(() => {
    if (wanted.length > 0 && !drawings) return;
    let live = true;
    let made: IconAtlas | null = null;
    void buildAtlas(wanted, drawings ?? new Map()).then((built) => {
      if (live) {
        made = built;
        setAtlas(built);
      } else {
        built.texture.dispose();
      }
    });
    return () => {
      live = false;
      made?.texture.dispose();
    };
    // `signature` stands for `wanted`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, drawings]);

  return atlas;
}

async function buildAtlas(
  keys: readonly string[],
  drawings: ReadonlyMap<string, IconSvg>,
): Promise<IconAtlas> {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_ATLAS_PX;
  canvas.height = ICON_ATLAS_PX;
  const context = canvas.getContext('2d');
  const columns = Math.floor(ICON_ATLAS_PX / ICON_ATLAS_CELL_PX);
  const cellOf = new Map<string, number>();
  const cellOrigin = (cell: number) => ({
    x: (cell % columns) * ICON_ATLAS_CELL_PX,
    y: Math.floor(cell / columns) * ICON_ATLAS_CELL_PX,
  });
  if (context) {
    // The "?" of a redacted pin.
    const origin = cellOrigin(QUESTION_CELL);
    context.fillStyle = '#ffffff';
    context.font = `bold ${(ICON_ATLAS_CELL_PX * 0.7).toString()}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('?', origin.x + ICON_ATLAS_CELL_PX / 2, origin.y + ICON_ATLAS_CELL_PX / 2 + 2);

    const size = ICON_ATLAS_CELL_PX * ICON_FILL;
    const margin = (ICON_ATLAS_CELL_PX - size) / 2;
    let next = QUESTION_CELL + 1;
    for (const key of keys) {
      const drawing = drawings.get(key);
      if (!drawing || next >= columns * columns) continue;
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(drawing, '#ffffff', size))}`;
      try {
        await image.decode();
      } catch {
        continue;
      }
      const cell = next++;
      const { x, y } = cellOrigin(cell);
      context.drawImage(image, x + margin, y + margin, size, size);
      cellOf.set(key, cell);
    }
  }
  const texture = new CanvasTexture(canvas);
  // Pins are small, often smaller than a cell: mipmaps keep the icons smooth as they shrink.
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return { texture, columns, cellOf };
}
