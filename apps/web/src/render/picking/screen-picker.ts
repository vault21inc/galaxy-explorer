import { clampedRadiusPx } from '../bodies/body-scale.ts';
import type { DrawnObject } from '../scene-index.ts';
import { PICK_CELL_PX, PICK_MIN_RADIUS_PX } from '../tuning.ts';

/**
 * Screen-space picking (rendering.md §10). Tiny spheres are hard to hit with a 3D ray, so
 * instead every drawn object is projected to the screen once, as a circle of its on-screen
 * radius (never under PICK_MIN_RADIUS_PX), and a pointer is matched against those circles.
 *
 * The circles are bucketed into a grid of PICK_CELL_PX squares. Each circle goes into every
 * cell it overlaps, so a pointer only checks the one cell it's in: about the same work for 50
 * objects or 5,000. The buckets are stored flat ("compressed rows"): `cellStart[c]` to
 * `cellStart[c + 1]` indexes the entries of cell c in `cellItems`. Arrays are reused between
 * rebuilds and only grow, so picking allocates nothing while the camera moves.
 */
export interface Viewport {
  widthPx: number;
  heightPx: number;
  /** World units per CSS pixel at distance 1 (screen-scale.ts). */
  worldPerPxAt1: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class ScreenPicker {
  #objects: readonly DrawnObject[] = [];
  #count = 0;
  #x = new Float32Array(0);
  #y = new Float32Array(0);
  #radius = new Float32Array(0);
  /** The drawn radius, without the minimum pick size: labels sit just outside it. */
  #drawnRadius = new Float32Array(0);
  #depth = new Float32Array(0);
  #columns = 0;
  #rows = 0;
  #cellStart = new Int32Array(0);
  #cellItems = new Int32Array(0);
  #cursor = new Int32Array(0);
  /** Which object each projected slot is (an index into #objects). */
  #slotObject = new Int32Array(0);

  get size(): number {
    return this.#count;
  }

  /**
   * Projects `objects` with `viewProjection`, the camera's projection × view matrix as 16
   * numbers in three.js's column-major order (`Matrix4.elements`). Objects behind the camera or
   * whose circle lies entirely off screen are left out.
   */
  rebuild(
    objects: readonly DrawnObject[],
    viewProjection: ArrayLike<number>,
    viewport: Viewport,
  ): void {
    const { widthPx, heightPx, worldPerPxAt1 } = viewport;
    const m = viewProjection;
    this.#objects = objects;
    this.#ensureItems(objects.length);
    let count = 0;
    for (const [index, object] of objects.entries()) {
      const [x, y, z] = object.center;
      // Clip coordinates: the matrix times (x, y, z, 1). For a perspective camera, w is the
      // distance in front of the camera; w ≤ 0 means behind it.
      const clipX = (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0);
      const clipY = (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0);
      const clipW = (m[3] ?? 0) * x + (m[7] ?? 0) * y + (m[11] ?? 0) * z + (m[15] ?? 0);
      if (clipW <= 0) continue;
      // Divide by w for normalized device coordinates (−1 to 1), then scale to CSS pixels,
      // with y flipped: device y points up, screen y points down.
      const screenX = ((clipX / clipW + 1) / 2) * widthPx;
      const screenY = ((1 - clipY / clipW) / 2) * heightPx;
      const drawnRadius = clampedRadiusPx(
        object.radius,
        clipW,
        worldPerPxAt1,
        object.minRadiusPx,
        object.maxRadiusPx,
      );
      const radius = Math.max(drawnRadius, PICK_MIN_RADIUS_PX);
      if (screenX + radius < 0 || screenX - radius > widthPx) continue;
      if (screenY + radius < 0 || screenY - radius > heightPx) continue;
      this.#x[count] = screenX;
      this.#y[count] = screenY;
      this.#radius[count] = radius;
      this.#drawnRadius[count] = drawnRadius;
      this.#depth[count] = clipW;
      this.#slotObject[count] = index;
      count++;
    }
    this.#count = count;
    // The grid is built at the first pick, not here: labels re-project every frame while the
    // camera moves but never pick, so they shouldn't pay for it.
    this.#gridSize = { widthPx, heightPx };
    this.#gridStale = true;
  }

  /**
   * The object whose circle contains the point, or null. Among overlapping circles the highest
   * `pickPriority` wins, then the one whose center is nearest the point (relative to its
   * radius), then the nearest to the camera.
   */
  pick(xPx: number, yPx: number): DrawnObject | null {
    this.#ensureGrid();
    const cell = this.#cellAt(xPx, yPx);
    if (cell < 0) return null;
    let best = -1;
    let bestPriority = -Infinity;
    let bestScore = Infinity;
    let bestDepth = Infinity;
    const end = this.#cellStart[cell + 1] ?? 0;
    for (let k = this.#cellStart[cell] ?? 0; k < end; k++) {
      const slot = this.#cellItems[k] ?? 0;
      const dx = xPx - (this.#x[slot] ?? 0);
      const dy = yPx - (this.#y[slot] ?? 0);
      const radius = this.#radius[slot] ?? 0;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radius * radius) continue;
      const object = this.#objectAt(slot);
      const priority = object?.pickPriority ?? 0;
      const score = Math.sqrt(distanceSquared) / radius;
      const depth = this.#depth[slot] ?? 0;
      if (
        priority > bestPriority ||
        (priority === bestPriority &&
          (score < bestScore || (score === bestScore && depth < bestDepth)))
      ) {
        best = slot;
        bestPriority = priority;
        bestScore = score;
        bestDepth = depth;
      }
    }
    return best < 0 ? null : this.#objectAt(best);
  }

  /** Objects whose projected center is inside the rectangle (box selection, M3). */
  pickRect(rect: ScreenRect): DrawnObject[] {
    const hits: DrawnObject[] = [];
    for (let slot = 0; slot < this.#count; slot++) {
      const x = this.#x[slot] ?? 0;
      const y = this.#y[slot] ?? 0;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
      const object = this.#objectAt(slot);
      if (object) hits.push(object);
    }
    return hits;
  }

  /** Calls `visit` for every projected object with its screen center and drawn radius. */
  visit(visit: (object: DrawnObject, xPx: number, yPx: number, radiusPx: number) => void): void {
    for (let slot = 0; slot < this.#count; slot++) {
      const object = this.#objectAt(slot);
      if (object)
        visit(object, this.#x[slot] ?? 0, this.#y[slot] ?? 0, this.#drawnRadius[slot] ?? 0);
    }
  }

  /** Where an object was projected: its screen center and pick radius, or null. */
  screenCircleOf(id: string): { x: number; y: number; radiusPx: number } | null {
    for (let slot = 0; slot < this.#count; slot++) {
      if (this.#objectAt(slot)?.id === id) {
        return { x: this.#x[slot] ?? 0, y: this.#y[slot] ?? 0, radiusPx: this.#radius[slot] ?? 0 };
      }
    }
    return null;
  }

  #objectAt(slot: number): DrawnObject | null {
    return this.#objects[this.#slotObject[slot] ?? -1] ?? null;
  }

  #cellAt(xPx: number, yPx: number): number {
    const column = Math.floor(xPx / PICK_CELL_PX);
    const row = Math.floor(yPx / PICK_CELL_PX);
    if (column < 0 || row < 0 || column >= this.#columns || row >= this.#rows) return -1;
    return row * this.#columns + column;
  }

  #gridStale = true;
  #gridSize = { widthPx: 0, heightPx: 0 };

  #ensureGrid(): void {
    if (!this.#gridStale) return;
    this.#buildGrid(this.#gridSize.widthPx, this.#gridSize.heightPx);
    this.#gridStale = false;
  }

  #buildGrid(widthPx: number, heightPx: number): void {
    const count = this.#count;
    this.#columns = Math.max(1, Math.ceil(widthPx / PICK_CELL_PX));
    this.#rows = Math.max(1, Math.ceil(heightPx / PICK_CELL_PX));
    const cells = this.#columns * this.#rows;
    if (this.#cellStart.length < cells + 1) this.#cellStart = new Int32Array(cells + 1);
    const start = this.#cellStart;
    start.fill(0, 0, cells + 1);

    // Pass 1: count each cell's entries (stored one ahead, so a running sum gives the starts).
    let total = 0;
    for (let slot = 0; slot < count; slot++) {
      this.#forEachCell(slot, (cell) => {
        start[cell + 1] = (start[cell + 1] ?? 0) + 1;
        total++;
      });
    }
    for (let cell = 0; cell < cells; cell++)
      start[cell + 1] = (start[cell + 1] ?? 0) + (start[cell] ?? 0);

    // Pass 2: place each slot in its cells.
    if (this.#cellItems.length < total) this.#cellItems = new Int32Array(Math.ceil(total * 1.5));
    if (this.#cursor.length < cells) this.#cursor = new Int32Array(cells);
    this.#cursor.set(start.subarray(0, cells));
    for (let slot = 0; slot < count; slot++) {
      this.#forEachCell(slot, (cell) => {
        const position = this.#cursor[cell] ?? 0;
        this.#cellItems[position] = slot;
        this.#cursor[cell] = position + 1;
      });
    }
  }

  /** The cells a slot's circle overlaps (its bounding square, clamped to the grid). */
  #forEachCell(slot: number, visit: (cell: number) => void): void {
    const x = this.#x[slot] ?? 0;
    const y = this.#y[slot] ?? 0;
    const radius = this.#radius[slot] ?? 0;
    const firstColumn = Math.max(0, Math.floor((x - radius) / PICK_CELL_PX));
    const lastColumn = Math.min(this.#columns - 1, Math.floor((x + radius) / PICK_CELL_PX));
    const firstRow = Math.max(0, Math.floor((y - radius) / PICK_CELL_PX));
    const lastRow = Math.min(this.#rows - 1, Math.floor((y + radius) / PICK_CELL_PX));
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++)
        visit(row * this.#columns + column);
    }
  }

  #ensureItems(capacity: number): void {
    if (this.#x.length >= capacity) return;
    const size = Math.ceil(capacity * 1.5);
    this.#x = new Float32Array(size);
    this.#y = new Float32Array(size);
    this.#radius = new Float32Array(size);
    this.#drawnRadius = new Float32Array(size);
    this.#depth = new Float32Array(size);
    this.#slotObject = new Int32Array(size);
  }
}
