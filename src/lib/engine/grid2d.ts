/**
 * 2D samples: 64 slices of a sample file laid out on an 8x8 grid.
 * Both axes are a percentual manipulation of the sample.
 *
 * The grid is continuous over [0, 8). Every cell 0..7 owns exactly one unit of
 * width, and 8 itself can never be reached, so nothing ever plays out of range.
 *   - sample picking  -> cell(v)   (floor)
 *   - continuous uses -> unit(v)   (0..1), or the raw float (e.g. hihat delay)
 *
 * Two ideas, related on purpose:
 *   anchor = where the path is at some progress      (coordinates)
 *   drift  = where the path is heading from there    (tangent)
 */

export type Point = { x: number; y: number };

/** One circular wobble layered on the straight diagonal. Summed together they shape the path. */
export type Epicycle = {
  /** starting angle, in turns (0..1) */
  phase: number;
  /** how many turns it makes over the whole path (negative = backwards) */
  turns: number;
  /** relative strength (0.5..1) */
  radius: number;
};

export const GRID = 8;
const EPS = 1e-9;
const MAX = GRID - EPS;
const BEATS_PER_CELL = 2;

// how far the wobbles can push the path, shared between all epicycles
const WOBBLE_REACH = 7 * 1.2;
// step used to read the slope of the path
const SLOPE_STEP = 1 / 100;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** the ONE clamp: keeps a value inside [0, 8) */
export const clampGrid = (v: number) => Math.max(0, Math.min(MAX, v));

/** continuous value -> cell index 0..7 (for picking a sample slice) */
export const cell = (v: number) => Math.floor(clampGrid(v));

/** continuous value -> 0..1 (for continuous parameters like delay) */
export const unit = (v: number) => clampGrid(v) / GRID;

/** grid position -> offset (in beats) inside the sample file */
export function compoundValue(x: number, y: number) {
  return (cell(x) + cell(y) * GRID) * BEATS_PER_CELL;
}

// ---- the path ---------------------------------------------------------------------------

export function makeEpicycles(rng: { range(a: number, b: number): number }): Epicycle[] {
  // same draw order and ranges as before (degrees / 360 -> turns)
  return [
    { phase: rng.range(0, 360) / 360, turns: (rng.range(0, 720) + 180) / 360,   radius: rng.range(0.5, 1) },
    { phase: rng.range(0, 360) / 360, turns: (-rng.range(0, 720) + 180) / 360,  radius: rng.range(0.5, 1) },
    { phase: rng.range(0, 360) / 360, turns: (rng.range(0, 1440) + 720) / 360,  radius: rng.range(0.5, 1) },
    { phase: rng.range(0, 360) / 360, turns: (-rng.range(0, 720) + 720) / 360,  radius: rng.range(0.5, 1) },
  ];
}

/** progress 0..1 -> anchor on the grid (floats, already clamped) */
export function coordinates(progress: number, epicycles: Epicycle[]): Point {
  const p = clamp01(progress);
  // wobbles fade in from the start, peak in the middle, fade out at the end
  const taper = (0.5 - Math.abs(p - 0.5)) * 2;
  const reach = WOBBLE_REACH / epicycles.length;

  let x = GRID * p;
  let y = GRID * p;
  for (const e of epicycles) {
    const angle = (e.phase + e.turns * p) * 2 * Math.PI;
    x += reach * taper * e.radius * Math.cos(angle);
    y += reach * taper * e.radius * Math.sin(angle);
  }
  return { x: clampGrid(x), y: clampGrid(y) };
}

/**
 * progress 0..1 -> drift from the anchor.
 * Follows the path forward in the first half, backward in the second, and is
 * zero in the middle. It is shortened if needed so anchor + drift stays on the grid.
 */
export function tangent(progress: number, epicycles: Epicycle[], scale = 0.5): Point {
  const p = clamp01(progress);
  const anchor = coordinates(p, epicycles);

  // slope over one small step (kept inside 0..1 so it never reads before the start)
  const hi = Math.max(p, SLOPE_STEP);
  const a = coordinates(hi, epicycles);
  const b = coordinates(hi - SLOPE_STEP, epicycles);

  const factor = ((0.5 - p) / SLOPE_STEP) * scale;
  const tx = (a.x - b.x) * factor;
  const ty = (a.y - b.y) * factor;

  // largest fraction (0..1) of the drift that keeps anchor + drift inside the grid
  let limit = 1;
  if (tx > 0) limit = Math.min(limit, (MAX - anchor.x) / tx);
  else if (tx < 0) limit = Math.min(limit, (0 - anchor.x) / tx);
  if (ty > 0) limit = Math.min(limit, (MAX - anchor.y) / ty);
  else if (ty < 0) limit = Math.min(limit, (0 - anchor.y) / ty);

  return { x: tx * limit, y: ty * limit };
}
