import {
  BAR, coordinates, tangent, makeEpicycles,
  type Mutation, type Rng, type Epicycle, type Point,
} from "$lib/engine";
import type { Plan } from "./plan";
import {
  finalize, single, syncopated, multi, roll, random, voiceHit,
  type Chars, type Node,
} from "./gestures";

export type ASectionName = "maximalist" | "minimalist" | "tandem" | "disjointed" | "repetition" | "transition";
export type ASection = { name: ASectionName; start: number; end: number };

const KICK_SEQUENCE_START = 2;
const SNARE_SEQUENCE_START = 1;
const HIHAT_SEQUENCE_START = 1;

const META_SEQUENCE_START = 1;

type Role = "kick" | "snare" | "hiHat";
const ROLES: Role[] = ["kick", "snare", "hiHat"];

// strong hits (the hiHat has none: its rolls use `upTo` instead of `toNextStrong`)
type StrongRole = "kick" | "snare";
// all steps except 0 (note: your list had `8, 8` where `9` should be)
const allSteps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
// reassigned at the start of renderDrumSequences
let strong: Record<StrongRole, number[]> = { kick: [0, 4, 8, 12], snare: [2, 6, 10, 14] };
/** shuffle all steps, keep the first 3-5, plus any steps that must always be there */
const pickStrong = (rng: Rng, always: number[] = []): number[] => {
  const count = rng.pick([3, 3, 4, 4, 5]);
  const picked = rng.shuffle([...allSteps]).slice(0, count);
  return [...new Set([...always, ...picked])].sort((a, b) => a - b);
};
const isStrong = (role: StrongRole, j: number) => strong[role].includes(j);
/** steps from j to the role's next strong hit (or the end of the bar) */
const stepsToNext = (role: StrongRole, j: number) => (strong[role].find((s) => s > j) ?? BAR) - j;

/** shared by every renderer: the rng, the plan, and each role's path across all of A */
type RenderCtx = { rng: Rng; plan: Plan; epicycles: Record<Role, Epicycle[]> };
type Rendered = { kick: Mutation[]; snare: Mutation[]; hiHat: Mutation[]; bars: number };
type Renderer = (ctx: RenderCtx, section: ASection) => Rendered;

// ---- helpers ------------------------------------------------------------------------------

const addSequence = (nodes: Node[], shift?: Point): Mutation => ({
  type: "add",
  where: ["sequences"],
  probability: 1,
  injection: finalize(nodes, shift),
});

const progressAt = (ctx: RenderCtx, position: number) => position / ctx.plan.middlePoint;

const anchorAt = (ctx: RenderCtx, role: Role, position: number): Point =>
  coordinates(progressAt(ctx, position), ctx.epicycles[role]);

/** anchor + drift of a role at an absolute step position */
const pathAt = (ctx: RenderCtx, role: Role, position: number) => {
  const progress = progressAt(ctx, position);
  return {
    anchor: coordinates(progress, ctx.epicycles[role]),
    drift: tangent(progress, ctx.epicycles[role]),
  };
};

/** runs `makeBar` once per bar of the section and collects all tracks */
function perBar(
  section: ASection,
  makeBar: (barStart: number) => { kick: Node[]; snare: Node[]; hiHat: Node[] },
): Rendered {
  const out: Rendered = { kick: [], snare: [], hiHat: [], bars: 0 };
  for (let barStart = section.start; barStart < section.end; barStart += BAR) {
    const bar = makeBar(barStart);
    out.kick.push(addSequence(bar.kick));
    out.snare.push(addSequence(bar.snare));
    out.hiHat.push(addSequence(bar.hiHat));
    out.bars++;
  }
  return out;
}

// ---- step-based roles: one profile per role + one shared bar loop -------------------------

type StepType = "single" | "multi" | "roll" | "none" | "syncopated" | "random";
/** `density` is optional: leave it out to use the role's base density for that step */
type StepRule = { gain: number; minGain: number; type: StepType; density?: number };
type Rule = (j: number, rng: Rng) => StepRule;
type BarFn = (ctx: RenderCtx, barStart: number) => Node[];

/** how many steps a "roll" / "random" starting at step j covers */
type RollLength = (j: number, rng: Rng) => number;

/** up to the role's next strong hit, so it ends right before it; `shortChance` collapses it to 1 step */
const toNextStrong = (role: StrongRole, shortChance = 0): RollLength => (j, rng) =>
  rng.chance(shortChance) ? 1 : rng.int(1, stepsToNext(role, j));

/** 1..max steps, never past the end of the bar */
const upTo = (max: number): RollLength => (j, rng) => rng.int(1, Math.min(max, BAR - j));

/**
 * One role's behavior inside a section. It either decides step by step,
 * or writes its whole bar at once.
 */
type RoleProfile =
  | { density: number; steps: Rule; rollLength: RollLength }
  | { bar: BarFn };

/** a section is one role profile per role */
type SectionProfile = Record<Role, RoleProfile>;

function renderRoleBar(ctx: RenderCtx, role: Role, profile: RoleProfile, barStart: number): Node[] {
  const { rng } = ctx;
  if ("bar" in profile) return profile.bar(ctx, barStart);

  const sequence: Node[] = [];
  for (let j = 0; j < BAR; j++) {
    const { gain, minGain, type, density } = profile.steps(j, rng);
    const chars: Chars = {
      sample: 0,
      gain: { value: gain, min: minGain },
      ...pathAt(ctx, role, barStart + j),
      density: density ?? profile.density,
    };

    switch (type) {
      case "none":       sequence.push(null); break;
      case "single":     sequence.push(single(chars, rng)); break;
      case "syncopated": sequence.push(syncopated(chars, rng)); break;
      case "multi":      sequence.push(multi(chars, rng)); break;
      case "roll":
      case "random": {
        const steps = profile.rollLength(j, rng);
        j += steps - 1;
        if (type === "random") {
          sequence.push(...random(chars, steps, rng));
        } else {
          sequence.push(...roll(chars, steps, rng.chance(0.3), rng));
        }
        break;
      }
    }
  }
  return sequence;
}

const renderWith = (profile: SectionProfile): Renderer => (ctx, section) =>
  perBar(section, (barStart) => ({
    kick: renderRoleBar(ctx, "kick", profile.kick, barStart),
    snare: renderRoleBar(ctx, "snare", profile.snare, barStart),
    hiHat: renderRoleBar(ctx, "hiHat", profile.hiHat, barStart),
  }));

/** one random scatter across the whole bar, ignoring the grid (used by disjointed) */
const scatterBar = (role: Role): BarFn => (ctx, barStart) => {
  const { rng } = ctx;
  const chars: Chars = {
    sample: 0,
    gain: { value: 1, min: 0.5 },
    ...pathAt(ctx, role, barStart),
    density: rng.range(0.1, 0.5),
  };
  return random(chars, BAR, rng);
};

// ---- profiles ---------------------------------------------------------------------------------
// hiHat only uses single / syncopated / multi (plus "none" for rests, and roll / random in places)

const maximalist: SectionProfile = {
  kick: {
    density: 0.5,
    rollLength: toNextStrong("kick"),
    steps: (j, rng) => {
      if (isStrong("kick", j)) return { gain: 1, minGain: 0.8, type: rng.chance(0.95) ? "single" : "none" };
      const gain = rng.range(0.2, 0.6);
      if (isStrong("snare", j)) {
        return { gain, minGain: rng.range(0.3, 0.5), type: rng.pick<StepType>(["single", "none", "single"]) };
      }
      return {
        gain,
        minGain: rng.range(0.05, 0.2),
        type: rng.weighted<StepType>([["single", 0.4], ["multi", 0.4], ["roll", 0.02], ["none", 0.18]]),
      };
    },
  },
  snare: {
    density: 0.5,
    rollLength: toNextStrong("snare"),
    steps: (j, rng) => {
      if (isStrong("snare", j)) return { gain: 1, minGain: 0.7, type: "single" };
      const gain = rng.range(0.1, 0.3);
      if (isStrong("kick", j)) return { gain, minGain: rng.range(0.05, 0.1), type: "none" };
      return {
        gain,
        minGain: rng.range(0.05, 0.1),
        type: rng.weighted<StepType>([["syncopated", 0.4], ["single", 0.3], ["random", 0.1], ["roll", 0.02], ["none", 0.18]]),
      };
    },
  },
  hiHat: {
    density: 0.5,
    rollLength: upTo(4),
    steps: (j, rng) => {
      if (j % 4 == 0 && rng.chance(0.7)) return { gain: 0.8, minGain: 0.4, type: "single" };
      if (j % 3 == 0 && rng.chance(0.4)) return { gain: 0.8, minGain: 0.5, type: "syncopated" };
      return {
        gain: rng.range(0.2, 0.35),
        minGain: rng.range(0.05, 0.1),
        type: rng.weighted<StepType>([["multi", 0.1], ["syncopated", 0.2], ["random", 0.1], ["none", 0.6]]),
      };
    },
  },
};

const minimalist: SectionProfile = {
  kick: {
    density: 0.2,
    rollLength: toNextStrong("kick", 0.6),
    steps: (j, rng) => {
      if (isStrong("kick", j)) return { gain: 1, minGain: 0.8, type: rng.chance(0.8) ? "single" : "none" };
      if (isStrong("snare", j)) return { gain: 0, minGain: 0, type: "none" };
      if (rng.chance(0.01)) {
        return { gain: rng.range(0.7, 0.8), minGain: rng.range(0.7, 0.8), type: "roll", density: rng.range(0.8, 1) };
      }
      return {
        gain: 0.5,
        minGain: rng.range(0.05, 0.3),
        type: rng.weighted<StepType>([["single", 0.2], ["multi", 0.1], ["none", 0.7]]),
      };
    },
  },
  snare: {
    density: 0.2,
    rollLength: toNextStrong("snare", 0.6),
    steps: (j, rng) => {
      if (isStrong("snare", j)) return { gain: 1, minGain: 0.8, type: rng.chance(0.8) ? "single" : "none" };
      if (isStrong("kick", j)) {
        return { gain: rng.pick([0.05, 0.05, 0.1]), minGain: 0.025, type: rng.pick<StepType>(["none", "single"]) };
      }
      if (rng.chance(0.03)) {
        return { gain: rng.range(0.7, 0.8), minGain: rng.range(0.7, 0.8), type: "roll", density: rng.range(0.8, 1) };
      }
      return {
        gain: 0.5,
        minGain: rng.range(0.05, 0.3),
        type: rng.weighted<StepType>([["syncopated", 0.1], ["multi", 0.1], ["none", 0.8]]),
      };
    },
  },
  hiHat: {
    density: 0.2,
    rollLength: upTo(4),
    steps: (j, rng) => {
      if (j % 2 == 0 && rng.chance(0.7)) return { gain: 1, minGain: 0.6, type: "single" };
      if (j % 3 == 0 && rng.chance(0.6)) return { gain: 0.8, minGain: 0.5, type: "syncopated" };
      return {
        gain: rng.range(0.2, 0.5),
        minGain: rng.range(0.1, 0.2),
        type: rng.weighted<StepType>([["multi", 0.2], ["syncopated", 0.2], ["random", 0.3], ["none", 0.3]]),
      };
    },
  },
};

const disjointed: SectionProfile = {
  kick: {
    density: 0.3,
    rollLength: toNextStrong("kick"),
    steps: (j, rng) => {
      if (isStrong("kick", j) || isStrong("snare", j)) {
        return { gain: 1, minGain: 0.8, type: rng.chance(0.96) ? "single" : "none" };
      }
      return {
        gain: rng.range(0.2, 0.4),
        minGain: rng.range(0.1, 0.2),
        type: rng.pick<StepType>(["single", "none", "none", "multi"]),
      };
    },
  },
  // the snare and the hiHat don't follow the grid: one random scatter across the whole bar
  snare: { bar: scatterBar("snare") },
  hiHat: { bar: scatterBar("hiHat") },
};

/** the repetition bar: same shape as minimalist, but denser and more regular */
const repetitionBar: SectionProfile = {
  kick: {
    density: 0.7,
    rollLength: toNextStrong("kick", 0.6),
    steps: (j, rng) => {
      if (isStrong("kick", j)) return { gain: 1, minGain: 0.8, type: "single" };
      const gain = rng.range(0.1, 0.5);
      if (isStrong("snare", j)) {
        return { gain, minGain: rng.range(0.1, 0.25), type: rng.pick<StepType>(["single", "none"]) };
      }
      return {
        gain,
        minGain: rng.range(0.05, 0.2),
        type: rng.weighted<StepType>([["single", 0.6], ["multi", 0.2], ["none", 0.2]]),
      };
    },
  },
  snare: {
    density: 0.7,
    rollLength: toNextStrong("snare", 0.6),
    steps: (j, rng) => {
      if (isStrong("snare", j)) return { gain: 1, minGain: 0.7, type: "single" };
      const gain = rng.range(0.1, 0.3);
      if (isStrong("kick", j)) {
        return { gain, minGain: rng.range(0.05, 0.3), type: rng.pick<StepType>(["none", "single"]) };
      }
      const type = rng.weighted<StepType>([["syncopated", 0.4], ["random", 0.2], ["roll", 0.01], ["none", 0.49]]);
      return {
        gain,
        minGain: rng.range(0.05, 0.3),
        type,
        density: type === "roll" ? rng.range(0.8, 1) : undefined, // rolls get their own density
      };
    },
  },
  hiHat: {
    density: 0.7,
    rollLength: upTo(4),
    steps: (j, rng) => {
      if (j % 2 == 0 && rng.chance(0.7)) return { gain: 0.8, minGain: 0.4, type: "single" };
      if (j % 3 == 0 && rng.chance(0.5)) return { gain: 1, minGain: 0.2, type: "syncopated" };
      return {
        gain: rng.range(0.1, 0.6),
        minGain: rng.range(0.05, 0.1),
        type: rng.weighted<StepType>([["multi", 0.2], ["syncopated", 0.2], ["random", 0.3], ["none", 0.2], ["roll", 0.1]]),
      };
    },
  },
};

/** tandem only needs a profile for the hiHat: kick and snare are written by renderTandem itself */
const tandemHiHat: RoleProfile = {
  density: 0.4,
  rollLength: upTo(4),
  steps: (j, rng) => {
    if (j % 2 == 0 && rng.chance(1)) return { gain: 1, minGain: 0.6, type: "single" };
    if (j % 3 == 0 && rng.chance(0.2)) return { gain: 0.8, minGain: 0.5, type: "syncopated" };
    return {
      gain: rng.range(0.2, 0.5),
      minGain: rng.range(0.1, 0.2),
      type: rng.weighted<StepType>([["multi", 0.2], ["syncopated", 0.2], ["random", 0.1], ["none", 0.5]]),
    };
  },
};

// ---- custom sections --------------------------------------------------------------------------

function renderTransition(ctx: RenderCtx, section: ASection): Rendered {
  const { rng } = ctx;
  const stems = rng.pick(["kick", "snare", "both", "both"]);
  const length = section.end - section.start;
  const density = rng.range(0, 1);

  // one long roll that drifts from where the path is back to the origin
  const build = (role: Role): Mutation => {
    const anchor = anchorAt(ctx, role, section.start);
    const chars: Chars = {
      sample: 0,
      gain: { value: 1, min: 0 },
      anchor,
      drift: { x: -anchor.x, y: -anchor.y },
      density,
    };
    return addSequence(roll(chars, length, false, rng));
  };
  const silence = () => addSequence(Array<Node>(length).fill(null));

  const kick = stems === "kick" || stems === "both" ? build("kick") : silence();
  const snare = stems === "snare" || stems === "both" ? build("snare") : silence();
  // the hiHat stays silent through the transition
  return { kick: [kick], snare: [snare], hiHat: [silence()], bars: 1 };
}

function renderTandem(ctx: RenderCtx, section: ASection): Rendered {
  const { rng } = ctx;
  const strongHits = [...new Set([...strong.kick, ...strong.snare])].sort((a, b) => a - b);

  return perBar(section, (barStart) => {
    const kick: Node[] = [];
    const snare: Node[] = [];

    for (let j = 0; j < BAR; j++) {
      if (!strongHits.includes(j)) {
        kick.push(null);
        snare.push(null);
        continue;
      }

      // each strong step starts a roll that ends right before the next strong step
      const stepsToStrong = (strongHits.find((s) => s > j) ?? BAR) - j;
      const charsFor = (role: Role): Chars => ({
        sample: 0,
        gain: { value: 1, min: 0 },
        ...pathAt(ctx, role, barStart + j),
        density: 0,
      });
      const kickChars = charsFor("kick");
      const snareChars = charsFor("snare");

      const unison = rng.chance(0.6);                       // snare plays the kick's roll
      const split = stepsToStrong >= 2 && rng.chance(0.3);  // two rolls instead of one
      const cut = split ? rng.int(1, stepsToStrong - 1) : stepsToStrong;
      const parts = split ? [cut, stepsToStrong - cut] : [stepsToStrong];

      parts.forEach((length, k) => {
        const inverted = !unison && (!split || k === 1);
        const kickRoll = roll(kickChars, length, inverted, rng);
        kick.push(...kickRoll);
        snare.push(...(unison ? kickRoll : roll(snareChars, length, inverted, rng)));
      });

      j += stepsToStrong - 1;
    }

    // the hiHat doesn't join the tandem: it follows its own step-based profile
    const hiHat = renderRoleBar(ctx, "hiHat", tandemHiHat, barStart);
    return { kick, snare, hiHat };
  });
}

/**
 * Renders one bar at section.start, cut in two halves, then replays the halves along
 * the path. Each replay is the template shifted by how far the path has moved since
 * the template's position, so the movement inside every roll is preserved.
 */
function renderRepetition(ctx: RenderCtx, section: ASection): Rendered {
  const { rng } = ctx;

  const template = {} as Record<Role, Node[][]>;
  for (const role of ROLES) {
    const bar = renderRoleBar(ctx, role, repetitionBar[role], section.start);
    const mid = Math.ceil(bar.length / 2);
    template[role] = [bar.slice(0, mid), bar.slice(mid)];
  }
  const hop = template.kick[0].length;

  const hops = Math.ceil((section.end - section.start) / hop);
  // the second half takes over somewhere in the middle, at least a bar from each end
  const changeAt = hops >= 4 ? rng.int(2, hops - 2) : Math.ceil(hops / 2);

  const out: Rendered = { kick: [], snare: [], hiHat: [], bars: 0 };
  for (let k = 0; k < hops; k++) {
    const half = k < changeAt ? 0 : 1;
    const position = section.start + k * hop;
    const origin = section.start + half * hop; // where the template half was written

    for (const role of ROLES) {
      const now = anchorAt(ctx, role, position);
      const was = anchorAt(ctx, role, origin);
      const shift = { x: now.x - was.x, y: now.y - was.y };
      out[role].push(addSequence(template[role][half], shift));
    }
    out.bars++;
  }
  return out;
}

// add the others here as you write them; missing ones fall back to maximalist
const renderers: Partial<Record<ASectionName, Renderer>> = {
  maximalist: renderWith(maximalist),
  minimalist: renderWith(minimalist),
  disjointed: renderWith(disjointed),
  transition: renderTransition,
  repetition: renderRepetition,
  tandem: renderTandem,
};

// ---- drums (section A) ------------------------------------------------------------------------

function metaSequence(sequenceStart: number, index: number, sequenceCount: number, bars: number): Mutation {
  return {
    type: "change",
    where: ["metaSequences", META_SEQUENCE_START + index],   // always starts at 1
    probability: 1,
    injection: {
      type: "sequential",
      sequence: Array.from({ length: bars }, (_, i) => sequenceStart + sequenceCount + i),
    },
  };
}

function renderDrumSequences(plan: Plan, rng: Rng) {
  const ctx: RenderCtx = {
    rng,
    plan,
    epicycles: { kick: makeEpicycles(rng), snare: makeEpicycles(rng), hiHat: makeEpicycles(rng) },
  };

  strong = {
    kick: pickStrong(rng, [0]),
    snare: pickStrong(rng),
  };

  plan.kick = [];
  plan.snare = [];
  plan.hiHat = [];

  let sequenceCount = 0;
  plan.aStructure.forEach((section, index) => {
    const render = renderers[section.name] ?? renderWith(maximalist);
    const { kick, snare, hiHat, bars } = render(ctx, section);

    plan.kick.push(...kick, metaSequence(KICK_SEQUENCE_START, index, sequenceCount, bars));
    plan.snare.push(...snare, metaSequence(SNARE_SEQUENCE_START, index, sequenceCount, bars));
    plan.hiHat.push(...hiHat, metaSequence(HIHAT_SEQUENCE_START, index, sequenceCount, bars));
    sequenceCount += bars;
  });
}

// ---- voice (section B) ------------------------------------------------------------------------

/**
 * Voice track (section B).
 *
 * - one metaSequence (id 1) over all of B, one 16-step sequence per bar (ids start at 1)
 * - every step holds two half-step hits, so the hit stream is 1,2,3,4,1,2,3,4...
 *   and one bar is [1,2],[3,4] x 8
 * - 3 voices (0, 1, 2), each with its own epicycles. The 4 slots point at voices:
 *   slot 0 is always voice 0, and one of slots 1..3 repeats voice 0 (1214, 1231, 1134...)
 * - each voice picks 1..3 points in B where its base sample changes (the repeat follows,
 *   since it is the same voice)
 * - 1..2 times the voices behind slots 1..3 swap places
 */

const VOICE_META_SEQUENCE = 1;
const VOICE_SEQUENCE_START = 1;

const SAMPLE_COUNT = 6;     // base samples, offsets 0..5
const VOICE_COUNT = 3;
const SLOT_COUNT = 4;       // hits in the repeating pattern
const HITS_PER_STEP = 2;    // each hit is half a step
const HITS_PER_CYCLE = SLOT_COUNT;

/** `count` distinct random integers in [lo, hi], sorted ascending */
function distinctPoints(rng: Rng, count: number, lo: number, hi: number): number[] {
  if (hi < lo) return [];
  const points = new Set<number>();
  const target = Math.min(count, hi - lo + 1);
  while (points.size < target) points.add(rng.int(lo, hi));
  return [...points].sort((a, b) => a - b);
}

/** slot -> voice. slot 0 is voice 0; one random slot in 1..3 repeats it; the rest are voices 1, 2 */
function makePattern(rng: Rng): number[] {
  const repeat = rng.int(1, 3);
  const others = [1, 2];
  return Array.from({ length: SLOT_COUNT }, (_, slot) =>
    slot === 0 || slot === repeat ? 0 : others.shift()!,
  );
}

export function renderVoiceSequences(plan: Plan, rng: Rng) {
  plan.voice = [];

  const span = Math.max(1, plan.endPoint - plan.middlePoint);
  const bars = Math.max(1, Math.ceil(span / BAR));
  const totalHits = bars * BAR * HITS_PER_STEP;
  const totalCycles = totalHits / HITS_PER_CYCLE;

  const epicycles: Epicycle[][] = Array.from({ length: VOICE_COUNT }, () => makeEpicycles(rng));

  // voice 0 starts on the first base sample, the others anywhere
  const sample = [0, rng.int(0, SAMPLE_COUNT - 1), rng.int(0, SAMPLE_COUNT - 1)];
  // hit indexes where each voice changes its base sample
  const sampleChanges = Array.from({ length: VOICE_COUNT }, () =>
    distinctPoints(rng, rng.int(1, 3), 1, totalHits - 1),
  );
  // cycle indexes where two of slots 1..3 trade voices
  const swaps = distinctPoints(rng, rng.int(1, 2), 1, totalCycles - 1);

  const pattern = makePattern(rng);

  for (let bar = 0; bar < bars; bar++) {
    const steps: object[][] = [];

    for (let step = 0; step < BAR; step++) {
      const pair: object[] = [];

      for (let h = 0; h < HITS_PER_STEP; h++) {
        const n = (bar * BAR + step) * HITS_PER_STEP + h; // global hit index in B
        const slot = n % HITS_PER_CYCLE;

        // swaps only land on a cycle boundary, so the pattern stays whole
        if (slot === 0) {
          const cycle = n / HITS_PER_CYCLE;
          while (swaps.length && swaps[0] <= cycle) {
            swaps.shift();
            const [a, b] = rng.shuffle([1, 2, 3]).slice(0, 2);
            [pattern[a], pattern[b]] = [pattern[b], pattern[a]];
          }
        }

        const voice = pattern[slot];

        // a due change fires the next time this voice plays; new sample must differ
        const changes = sampleChanges[voice];
        while (changes.length && changes[0] <= n) {
          changes.shift();
          const current = sample[voice];
          const choices = Array.from({ length: SAMPLE_COUNT }, (_, i) => i).filter((i) => i !== current);
          sample[voice] = rng.pick(choices);
        }

        // progress: 0 at the middle point, 1 at the end point (each hit is half a step)
        const progress = (n / HITS_PER_STEP) / span;
        const anchor = coordinates(progress, epicycles[voice]);
        pair.push(voiceHit(sample[voice], anchor));
      }

      steps.push(pair);
    }

    plan.voice.push({
      type: "add",
      where: ["sequences"],
      probability: 1,
      injection: steps,
    } as Mutation);
  }

  plan.voice.push({
    type: "change",
    where: ["metaSequences", VOICE_META_SEQUENCE],
    probability: 1,
    injection: {
      type: "sequential",
      sequence: Array.from({ length: bars }, (_, i) => VOICE_SEQUENCE_START + i),
    },
  } as Mutation);
}

// ---- entry point (called by makePlan) ---------------------------------------------------------

/** renders every track that is built from sequences: drums for A, voice for B */
export function renderSequences(plan: Plan, rng: Rng) {
  renderDrumSequences(plan, rng);
  renderVoiceSequences(plan, rng);
}