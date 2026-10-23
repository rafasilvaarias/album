import { compoundValue, unit, type Point, type Rng } from "$lib/engine";

/**
 * Gestures (single, syncopated, multi, roll, random) build neutral nodes that keep
 * their grid position as floats. Nothing is rounded until `finalize` turns them into
 * schema objects. That is what lets repetition shift a whole gesture along the path
 * without losing the movement inside it.
 */

// ---- types ------------------------------------------------------------------------------

/** everything a gesture needs to know about one step */
export type Chars = {
  sample: number;
  gain: { value: number; min: number };
  /** where the path is at this step */
  anchor: Point;
  /** where the path is heading from the anchor (a hit lands somewhere between anchor and anchor + drift) */
  drift: Point;
  density: number;
};

export type Hit = { kind: "hit"; name: string; sample: number; gain: number; delay: number; x: number; y: number };
export type Ghost = { kind: "ghost"; delay: number; x: number; y: number };
/** a step in a sequence: a hit, a ghost, silence, or a nested group of them */
export type Node = Hit | Ghost | null | Node[];

// ---- tuning ------------------------------------------------------------------------------

const GHOST_WINDOW = 1 / 4;      // ghosts land within the first quarter of a step
const RANDOM_SLOTS = 32;         // a random() gesture lives in one step split into this many slots

// voice: the anchor's x slides the offset inside a base sample, y slides the duration
const VOICE_OFFSET_MAX = 0.5;    // x = 0 -> base + 0.5, x = 1 -> base + 0
const VOICE_DURATION_MIN = 0.125; // y = 0
const VOICE_DURATION_MAX = 0.5;   // y = 1

// ---- small helpers ----------------------------------------------------------------------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** a value between a and b, pulled toward a. higher `power` = stronger pull */
const biased = (a: number, b: number, power: number, rng: Rng) =>
  lerp(a, b, Math.pow(rng.range(0, 1), power));

/** a point between the anchor and anchor + drift, pulled toward the anchor */
const wander = (c: Chars, power: number, rng: Rng): Point => ({
  x: biased(c.anchor.x, c.anchor.x + c.drift.x, power, rng),
  y: biased(c.anchor.y, c.anchor.y + c.drift.y, power, rng),
});

/** a point a fraction `f` of the way along the drift */
const slide = (c: Chars, f: number): Point => ({
  x: c.anchor.x + c.drift.x * f,
  y: c.anchor.y + c.drift.y * f,
});

/** a uniformly random point between the anchor and anchor + drift */
const scatter = (c: Chars, rng: Rng): Point => ({
  x: rng.range(c.anchor.x, c.anchor.x + c.drift.x),
  y: rng.range(c.anchor.y, c.anchor.y + c.drift.y),
});

export const hit = (name: string, c: Chars, gain: number, delay: number, at: Point): Hit =>
  ({ kind: "hit", name, sample: c.sample, gain, delay, x: at.x, y: at.y });

export const ghost = (c: Chars, delay: number, rng: Rng): Ghost => {
  const at = wander(c, 0.5, rng);
  return { kind: "ghost", delay, x: at.x, y: at.y };
};

// ---- nodes -> schema ----------------------------------------------------------------------

/**
 * Turn nodes into schema objects. `shift` moves every hit across the grid first,
 * keeping the distances between hits. Rounding happens only here, in compoundValue.
 */
export function finalize(node: Node, shift: Point = { x: 0, y: 0 }): any {
  if (node === null) return null;
  if (Array.isArray(node)) return node.map((n) => finalize(n, shift));

  if (node.kind === "ghost") {
    return {
      name: ".",
      sample: 0,
      gainMin: 0.05, gainMax: 0.15,
      delay: node.delay,
      offset: compoundValue(node.x + shift.x, node.y + shift.y),
      duration: 1,
      attack: 0.01,
    };
  }

  return {
    name: node.name,
    sample: node.sample,
    gain: node.gain,
    delay: node.delay,
    offset: compoundValue(node.x + shift.x, node.y + shift.y),
    duration: 1,
    attack: 0,
  };
}

// ---- voice ---------------------------------------------------------------------------------

/**
 * One voice hit, already in schema form (it skips compoundValue: voice offsets are not
 * grid cells). `base` is the base sample (offset 0, 1, 2, ...). The anchor only adds to it:
 *   x: 0 -> +0.5 of offset, 1 -> +0
 *   y: 0 -> 0.125 duration, 1 -> 0.5
 */
export function voiceHit(base: number, anchor: Point) {
  return {
    name: "V",
    sample: 0,
    gain: 1,
    delay: 0,
    offset: base + VOICE_OFFSET_MAX * (1 - unit(anchor.x)),
    duration: lerp(VOICE_DURATION_MIN, VOICE_DURATION_MAX, unit(anchor.y)),
    probability: 1,
  };
}

// ---- gestures ------------------------------------------------------------------------------

export function single(c: Chars, rng: Rng): Node[] {
  const gain = biased(c.gain.value, c.gain.min, 2, rng);
  const out: Node[] = [hit("Si", c, gain, 0, wander(c, 2, rng))];
  if (rng.chance(c.density)) out.push(ghost(c, rng.range(0, GHOST_WINDOW), rng));
  return out;
}

export function syncopated(c: Chars, rng: Rng): Node[] {
  const lead: Node = rng.chance(c.density) ? ghost(c, rng.range(0, GHOST_WINDOW), rng) : null;
  const gain = biased(c.gain.value, c.gain.min, 2, rng);
  return [lead, hit("Sy", c, gain, 0, wander(c, 2, rng))];
}

export function multi(c: Chars, rng: Rng): Node[] {
  const out: Node[] = [];
  const hits = Math.floor(biased(2, 4 + 4 * c.density, 1 + (1 - c.density) * 2, rng));
  const duplet = hits % 2 === 0;

  for (let i = 0; i < hits; i++) {
    const accent = duplet ? i % 2 === 0 : i % 3 === 0;
    const window = 1 / hits / 2;

    if (!accent && !rng.chance(c.density)) {
      out.push(ghost(c, rng.range(0, window), rng));
      continue;
    }

    const delay = accent ? 0 : rng.range(0, window);
    const gain = biased(c.gain.value, c.gain.min, 1, rng);
    out.push(hit(accent ? "MU" : "mu", c, gain, delay, wander(c, 1, rng)));
  }
  return out;
}

/**
 * `steps` steps filled with fast hits. Gain and position travel from the anchor
 * toward anchor + drift across the hits (or the other way round if `inverted`).
 */
export function roll(c: Chars, steps: number, inverted: boolean, rng: Rng): Node[][] {
  const perStep = Math.floor(rng.range(4, 4 + c.density * 12));
  const total = steps * perStep;
  const hits = Math.round(biased(total, c.density * total, 1, rng));

  const out: Node[][] = [];
  for (let i = 0; i < steps; i++) {
    const micro: Node[] = [];
    for (let a = 0; a < perStep; a++) {
      const n = i * perStep + a;
      if (n >= hits) {
        micro.push(null);
        continue;
      }
      const t = n / hits;
      const f = inverted ? 1 - t : t;
      micro.push(hit("ro", c, lerp(c.gain.value, c.gain.min, f), 0, slide(c, f)));
    }
    out.push(micro);
  }
  return out;
}

/** scattered hits at random times inside `steps` steps (all stored in the first step) */
export function random(c: Chars, steps: number, rng: Rng): Node[] {
  const max = Math.max(1, Math.floor(c.density * steps * 2));
  const hits = rng.int(1, max);
  const times = Array.from({ length: hits }, () => rng.range(0, steps)).sort((a, b) => a - b);

  const micro: Node[] = times.map((time, i) => {
    const delay = time - (1 / RANDOM_SLOTS / hits) * i;
    if (!rng.chance(0.5 + c.density * 0.5)) return ghost(c, delay, rng);
    return hit("ra", c, rng.range(c.gain.min, c.gain.value), delay, scatter(c, rng));
  });

  const slots: Node[] = [micro, ...Array<Node>(RANDOM_SLOTS - 1).fill(null)];
  return [slots, ...Array<Node>(steps - 1).fill(null)];
}