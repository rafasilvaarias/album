import { BAR, type Rng, type Section, type Mutation } from "$lib/engine";
import { renderSequences, type ASection, type ASectionName } from "./sequences";

export type SectionName = "A" | "B";

export type Plan = {
  structure: Section<SectionName>[];
  kick: Mutation[];
  snare: Mutation[];
  hiHat: Mutation[];
  break: Mutation[];
  voice: Mutation[];
  pad: PadStep[];
  middlePoint: number;
  endPoint: number;
  aStructure: ASection[];
};

// ---- break ------------------------------------------------------------------------------

// mirrors break.json `types`, in the same order: [sample, offset, duration in beats]
const BREAK_TYPES: [number, number, number][] = [
  [0, 0, 2],
  ...Array.from({ length: 14 }, (_, i): [number, number, number] => [1, i, 1]),
  ...Array.from({ length: 10 }, (_, i): [number, number, number] => [2, i * 0.5, 0.5]),
];

// add to Plan type:  padTimeline: PadStep[];   (and `padTimeline: []` in makePlan's initial plan)
export type PadStep = { metaSequence: number; time: number };

const PAD_PLAY = 4 * BAR; // one loop of any pad metaSequence

function planPad(plan: Plan, rng: Rng) {
  const transitions = plan.aStructure.filter((s) => s.name === "transition");
  const mid = transitions[0];                      // middle transition
  const fin = transitions[transitions.length - 1]; // last one, closes section A
  const begin = plan.structure[0].start + rng.int(3, 7) * BAR;

  // ---- 6th metaSequence: plays once (4 bars), always after the middle transition,
  // ends 'rem' or 'rem + 4' bars before the final transition (loop grid anchored at mid.end)
  const postBars = (fin.start - mid.end) / BAR;
  const rem = postBars % 4 || 4;                   // bars into the unfinished loop, or 4 if exact
  let end6 = fin.start - (rem) * BAR;
  if (end6 - PAD_PLAY < mid.end) end6 = fin.start - rem * BAR;
  const start6 = end6 - PAD_PLAY;
  const has6 = start6 >= mid.end;
  const limit = has6 ? start6 : fin.start;         // levels 1-5 run until here

  // ---- 4-bar slots for levels 1-5: before the transition, then restarting at its end
  const slots: number[] = [];
  for (let t = begin; t < mid.start; t += PAD_PLAY) slots.push(t);
  const pre = slots.length;
  for (let t = mid.end; t < limit; t += PAD_PLAY) slots.push(t);

  // ---- levels 1..5, non-decreasing; some levels get more slots than others
  const N = slots.length;
  let levels: number[];
  if (N < 5) {
    levels = slots.map((_, i) => (N === 1 ? 1 : 1 + Math.round((i * 4) / (N - 1)))); // skips levels
  } else {
    const counts = new Array(5).fill(1);
    for (let i = 0; i < N - 5; i++) counts[rng.int(0, 4)]++;
    levels = counts.flatMap((c, i) => new Array(c).fill(i + 1));
  }
  // after the transition, resume in the same metaSequence it was in before
  if (pre > 0 && pre < N) levels[pre] = levels[pre - 1];

  // ---- build the timeline (loops, so only changes are written)
  const steps: PadStep[] = [];
  for (let i = 0; i < N; i++) {
    if (i === pre && pre > 0) steps.push({ metaSequence: 0, time: mid.start }); // transition silences it
    if (i === 0 || i === pre || levels[i] !== levels[i - 1]) {
      steps.push({ metaSequence: levels[i], time: slots[i] });
    }
  }
  if (pre === N && pre > 0) steps.push({ metaSequence: 0, time: mid.start });

  if (has6) {
    steps.push({ metaSequence: 6, time: start6 });
    steps.push({ metaSequence: 0, time: end6 }); // quiet until the end of A
  }

  plan.pad = steps;
}

function planBreak(plan: Plan, rng: Rng) {
  const steps = BREAK_TYPES.map(([, , d]) => Math.round(d * 4));

  // type 0 (full breakTwo, 2 beats) is always the first sequence; the random ones can't reuse it
  let pool = BREAK_TYPES.map((_, i) => i).filter((i) => i !== 0);
  const sequences: number[][] = [[0]];

  const nSequences = rng.int(10, 20);
  for (let n = 0; n < nSequences && pool.length > 0; n++) {
    let seq: number[] | null = null;

    for (let attempt = 0; attempt < 200 && !seq; attempt++) {
      const candidates = [...pool];
      const first = rng.pick(candidates);
      candidates.splice(candidates.indexOf(first), 1);
      const current = [first];
      let sum = steps[first];

      while (sum !== 4 && sum !== 8 && candidates.length > 0) {
        const c = rng.pick(candidates);
        candidates.splice(candidates.indexOf(c), 1);
        if (sum + steps[c] <= 8) {
          current.push(c);
          sum += steps[c];
        }
      }
      if (sum === 4 || sum === 8) seq = current;
    }

    if (!seq) break;
    sequences.push(seq);
    pool = pool.filter((i) => !seq!.includes(i));
  }

  for (const seq of sequences) {
    const total = seq.reduce((s, i) => s + steps[i], 0);
    const rows: (object | null)[][] = Array.from({ length: total / 4 }, () => [null, null, null, null]);
    let t = 0;
    for (const i of seq) {
      const [sample, offset, duration] = BREAK_TYPES[i];
      rows[Math.floor(t / 4)][t % 4] = {
        name: "H", sample, gain: 1, delay: 0, offset, duration, probability: 1,
      };
      t += steps[i];
    }
    plan.break.push({ type: "add", where: ["sequences"], probability: 1, injection: rows } as Mutation);
  }

  // added sequences land at ids 1..n (id 0 is the [null] placeholder); the first of them is type 0
  const n = sequences.length;
  const matrix = Array.from({ length: n }, () => {
    const row = new Array<number>(n).fill(0);
    if (n < 2) return row; // nothing else to go to
    const targets = Array.from({ length: n - 1 }, (_, i) => i + 1); // skip column 0
    const cols = rng.shuffle(targets).slice(0, rng.int(Math.min(2, n - 1), Math.min(5, n - 1)));
    const weights = cols.map(() => rng.range(0.05, 1));
    const total = weights.reduce((a, b) => a + b, 0);
    cols.forEach((c, k) => (row[c] = weights[k] / total));
    return row;
  });

  plan.break.push({
    type: "change",
    where: ["metaSequences", 1],
    probability: 1,
    injection: {
      type: "markovian",
      sequence: Array.from({ length: n }, (_, i) => i + 1),
      markovMatrix: matrix,
    },
  } as Mutation);
}

// ---- stages (order lives in makePlan) ---------------------------------------

function planStructure(plan: Plan, rng: Rng) {
  const parts = rng.shuffle<{ name: ASectionName; time: number }>([
    /*{ name: "maximalist", time: rng.int(7, 15) * BAR },
    { name: "maximalist", time: rng.int(4, 9) * BAR },
    { name: "minimalist", time: rng.int(7, 15) * BAR },
    { name: "tandem", time: rng.int(2, 7) * BAR },
    { name: "disjointed", time: rng.int(7, 11) * BAR },
    { name: "repetition", time: rng.pick([4, 6, 8, 10]) * BAR }*/
  ]);

  //middle transition
  parts.splice(rng.pick([2, 3, 4]), 0, {
    name: "transition",
    time: rng.int(5, 11),
  });

  parts.push({ name: "transition", time: rng.int(13, 27) });

  plan.aStructure = [];
  for (const s of parts) {
    const last = plan.aStructure[plan.aStructure.length - 1];
    const start = last ? last.end : 0;
    plan.aStructure.push({ name: s.name, start, end: start + s.time });
  }

  plan.middlePoint = plan.aStructure[plan.aStructure.length - 1].end;
  plan.endPoint = plan.middlePoint + BAR * rng.pick([14, 16, 18]);

  plan.structure = [
    { name: "A", start: 0, end: plan.middlePoint },
    { name: "B", start: plan.middlePoint, end: plan.endPoint },
    //{ name: "B", start: 0, end: BAR * rng.pick([16,18,17]) },
  ];
}

export function makePlan(rng: Rng): Plan {
  const plan: Plan = { structure: [], kick: [], snare: [], hiHat: [], break: [], voice: [], middlePoint: 0, endPoint: 0, aStructure: [], pad: [] };
  planStructure(plan, rng);
  renderSequences(plan, rng);
  planBreak(plan, rng);
  planPad(plan, rng);
  return plan;
}