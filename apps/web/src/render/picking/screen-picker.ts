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
 * objects or 5,000.
 *
 * A rift (M4-T6) isn't a circle: its curve is projected point by point, the circle around all
 * of it only places it in the grid, and a pointer hits it within its on-screen half-width of the
 * projected curve. The buckets are stored flat ("compressed rows"): `cellStart[c]` to
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
  /** A curved slot's projected points: x, y and half-width in pixels, from `#curveStart`. */
  #curveStart = new Int32Array(0);
  #curveCount = new Int32Array(0);
  #curvePoints = new Float32Array(0);

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
    let curveUsed = 0;
    for (const [index, object] of objects.entries()) {
      if (object.curve && object.curve.length > 1) {
        const projected = this.#projectCurve(object, m, viewport, curveUsed);
        if (!projected) continue;
        this.#x[count] = projected.x;
        this.#y[count] = projected.y;
        this.#radius[count] = projected.radius;
        this.#drawnRadius[count] = projected.widthPx;
        this.#depth[count] = projected.depth;
        this.#slotObject[count] = index;
        this.#curveStart[count] = curveUsed;
        this.#curveCount[count] = projected.points;
        curveUsed += projected.points;
        count++;
        continue;
      }
      this.#curveCount[count] = 0;
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
      let score: number;
      if ((this.#curveCount[slot] ?? 0) > 0) {
        const curve = this.#curveScore(slot, xPx, yPx);
        if (curve === null) continue;
        score = curve;
      } else {
        const dx = xPx - (this.#x[slot] ?? 0);
        const dy = yPx - (this.#y[slot] ?? 0);
        const radius = this.#radius[slot] ?? 0;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > radius * radius) continue;
        score = Math.sqrt(distanceSquared) / radius;
      }
      const object = this.#objectAt(slot);
      const priority = object?.pickPriority ?? 0;
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

  /**
   * Projects a curved object's points (M4-T6) into `#curvePoints` from `offset`, each with its
   * half-width in pixels at its own depth. Returns the circle around them all for the grid, or
   * null when fewer than two points are in front of the camera or none is near the screen.
   */
  #projectCurve(
    object: DrawnObject,
    m: ArrayLike<number>,
    viewport: Viewport,
    offset: number,
  ): {
    x: number;
    y: number;
    radius: number;
    widthPx: number;
    depth: number;
    points: number;
  } | null {
    const curve = object.curve ?? [];
    const { widthPx, heightPx, worldPerPxAt1 } = viewport;
    this.#ensureCurvePoints(offset + curve.length);
    let points = 0;
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    let widest = 0;
    let depthSum = 0;
    for (const [x, y, z] of curve) {
      const clipX = (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0);
      const clipY = (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0);
      const clipW = (m[3] ?? 0) * x + (m[7] ?? 0) * y + (m[11] ?? 0) * z + (m[15] ?? 0);
      // Points behind the camera are dropped: the curve is then picked by what's in front.
      if (clipW <= 0) continue;
      const screenX = ((clipX / clipW + 1) / 2) * widthPx;
      const screenY = ((1 - clipY / clipW) / 2) * heightPx;
      const halfWidth = clampedRadiusPx(
        object.radius,
        clipW,
        worldPerPxAt1,
        object.minRadiusPx,
        object.maxRadiusPx,
      );
      this.#curvePoints.set([screenX, screenY, halfWidth], (offset + points) * 3);
      points++;
      minX = Math.min(minX, screenX);
      maxX = Math.max(maxX, screenX);
      minY = Math.min(minY, screenY);
      maxY = Math.max(maxY, screenY);
      widest = Math.max(widest, halfWidth);
      depthSum += clipW;
    }
    if (points < 2) return null;
    const reach = Math.max(widest, PICK_MIN_RADIUS_PX);
    if (maxX + reach < 0 || minX - reach > widthPx) return null;
    if (maxY + reach < 0 || minY - reach > heightPx) return null;
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      radius: Math.hypot(maxX - minX, maxY - minY) / 2 + reach,
      widthPx: widest,
      depth: depthSum / points,
      points,
    };
  }

  /**
   * How close a point is to a curved slot's projected curve, as a share of its half-width there
   * (0 on the line), or null when it's farther than that. The half-width never drops below
   * PICK_MIN_RADIUS_PX, so a thin rift far away can still be hit.
   */
  #curveScore(slot: number, xPx: number, yPx: number): number | null {
    const start = this.#curveStart[slot] ?? 0;
    const count = this.#curveCount[slot] ?? 0;
    let best: number | null = null;
    for (let i = 1; i < count; i++) {
      const a = (start + i - 1) * 3;
      const b = (start + i) * 3;
      const [ax, ay, aw] = [
        this.#curvePoints[a] ?? 0,
        this.#curvePoints[a + 1] ?? 0,
        this.#curvePoints[a + 2] ?? 0,
      ];
      const [bx, by, bw] = [
        this.#curvePoints[b] ?? 0,
        this.#curvePoints[b + 1] ?? 0,
        this.#curvePoints[b + 2] ?? 0,
      ];
      const [dx, dy] = [bx - ax, by - ay];
      const length2 = dx * dx + dy * dy;
      // The closest point on the segment: t along it, clamped to its ends.
      const t =
        length2 === 0 ? 0 : Math.max(0, Math.min(1, ((xPx - ax) * dx + (yPx - ay) * dy) / length2));
      const distance = Math.hypot(xPx - ax - t * dx, yPx - ay - t * dy);
      const reach = Math.max(aw + (bw - aw) * t, PICK_MIN_RADIUS_PX);
      if (distance > reach) continue;
      const score = distance / reach;
      if (best === null || score < best) best = score;
    }
    return best;
  }

  #ensureCurvePoints(points: number): void {
    if (this.#curvePoints.length >= points * 3) return;
    const grown = new Float32Array(Math.ceil(points * 1.5) * 3);
    grown.set(this.#curvePoints);
    this.#curvePoints = grown;
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
    this.#curveStart = new Int32Array(size);
    this.#curveCount = new Int32Array(size);
  }
}
