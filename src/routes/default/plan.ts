import { BAR, type Rng, type Section, type Mutation } from "$lib/engine";

export type SectionName = "A" | "B";
type aSectionName = "maximalist" | "minimalist" | "tandem" | "disjointed" | "repetition" | "transition";

const KICK_SEQUENCE_START = 1;
const SNARE_SEQUENCE_START = 1;

export type Plan = {
  structure: Section<SectionName>[];
  kick: Mutation[];  // [bar][step], 1 = hit
  snare: Mutation[];
  hiHat: Mutation[];
  middlePoint : number;
  aStructure: any[];
};

// ---- stages (order lives in makePlan) ---------------------------------------

function planStructure(plan: Plan, rng: Rng) {
  // randomising aSection
  const aStructure = rng.shuffle<{ name: aSectionName; time: number }>([
    { name: "maximalist", time: rng.int(7, 15) * BAR },
    { name: "maximalist", time: rng.int(7, 11) * BAR },
    { name: "minimalist", time: rng.int(7, 15) * BAR },
    { name: "tandem", time: rng.int(4, 8) * BAR },
    { name: "disjointed", time: rng.int(5, 9) * BAR },
    { name: "repetition", time: rng.pick([4, 6]) * BAR },
    { name: "transition", time: rng.int(7, 13)},
  ]);
  aStructure.push({ name: "transition", time: rng.int(7, 13)});

  plan.aStructure = [];
  for (const [index, s] of aStructure.entries()) {
    const last = plan.aStructure[plan.aStructure.length - 1];
    const start = last ? last.end : 0;
    plan.aStructure.push({
      name: s.name,
      start,
      end: start + s.time,
    });
  }

  console.log("plan.structure", plan.aStructure);

  plan.middlePoint = plan.aStructure[plan.aStructure.length - 1].end;
  plan.structure = [];
  plan.structure.push({ name: "A", start: 0, end: plan.middlePoint });
}

function renderASequences(plan: Plan, rng: Rng) {

  const strongKickSteps = [0, 5, 8, 15];
  const strongSnareSteps = [ 2, 5, 10, 15];
  const strongSteps = { kick: strongKickSteps, snare: strongSnareSteps}
  const emptyBar = () => new Array(BAR).fill(null);
  

  plan.kick = [];
  plan.snare = [];
  plan.hiHat = [];

  let sequenceCount = 0;
  
  plan.aStructure.forEach((section, index) => {
    const name : aSectionName = section.name;
    const length = section.end - section.start;
    const start = section.start;
    const end = section.end;
    let sequenceBars = 0;

    const renderedSequence =
    (name === "maximalist") ? renderMaximalist(rng, plan, start, end, length, sequenceBars, strongSteps)
    : renderMaximalist(rng, plan, start, end, length, sequenceBars, strongSteps)
    /*else if (name === "minimalist") renderMinimalist(rng, plan, start, end, length, sequenceBars, strongSteps)
    else if (name === "tandem") renderTandem(rng, plan, start, end, length, sequenceBars, strongSteps)
    else if (name === "disjointed") renderDisjointed(rng, plan, start, end, length, sequenceBars, strongSteps)
    else if (name === "repetition") renderRepetition(rng, plan, start, end, length, sequenceBars, strongSteps)
    else if (name === "transition") renderTransition(rng, plan, start, end, length, sequenceBars, strongSteps)
    else { console.error("Unknown section name", name); return; }
    */

    plan.kick.push(...renderedSequence.kick);
    plan.snare.push(...renderedSequence.snare);
    //plan.hiHat.push(renderedSequence.hiHat);
    sequenceBars = renderedSequence.sequenceBars;

    function mSequence(sequenceStart: number = 0): Mutation {
      const seq: number[] = [];
      for (let i = 0; i < sequenceBars; i++) {
        seq.push(sequenceCount + (i + 1));
      }
      return {
        type: "change",
        where: ["metaSequences", index + sequenceStart],
        probability: 1,
        injection: {
          type: "sequential",
          sequence: seq,
        },
      };
    }

    plan.kick.push(mSequence(KICK_SEQUENCE_START));
    plan.snare.push(mSequence(SNARE_SEQUENCE_START));
    sequenceCount += sequenceBars;
  });
}

export function makePlan(rng: Rng): Plan {
  const plan: Plan = { structure: [], kick: [], snare: [], hiHat: [], middlePoint: 0, aStructure: [] };
  planStructure(plan, rng);
  renderASequences(plan, rng);
  return plan;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


const KICK_VECTORS = [
  { position: Math.random() * 360, rotation: Math.random() * 720 + 180, scale: Math.random() * 0.5 + 0.5 },
  { position: Math.random() * 360, rotation: - Math.random() * 720 + 180, scale: Math.random() * 0.5 + 0.5 },
  { position: Math.random() * 360, rotation: Math.random() * 1440 + 720, scale: Math.random() * 0.5 + 0.5},
  { position: Math.random() * 360, rotation: - Math.random() * 720 + 720, scale: Math.random() * 0.5 + 0.5}
];

const SNARE_VECTORS = [
  { position: Math.random() * 360, rotation: Math.random() * 720 + 180, scale: Math.random() * 0.5 + 0.5 },
  { position: Math.random() * 360, rotation: - Math.random() * 720 + 180, scale: Math.random() * 0.5 + 0.5 },
  { position: Math.random() * 360, rotation: Math.random() * 1440 + 720, scale: Math.random() * 0.5 + 0.5},
  { position: Math.random() * 360, rotation: - Math.random() * 720 + 720, scale: Math.random() * 0.5 + 0.5}
];

function coordinates(
    progress: number,
    vectors: { position: number; rotation: number; scale: number }[]
  ) {
    const endPoint = [7.5, 7.5];
    const startPoint = [-0.5, -0.5];
    let x = startPoint[0] + (endPoint[0] - startPoint[0]) * progress;
    let y = startPoint[1] + (endPoint[1] - startPoint[1]) * progress;
    let factor = (0.5 - Math.abs(progress - 0.5)) * 2;
    let scale = 7 / vectors.length * 1.2;
    for (const vector of vectors) {
      const angle = (vector.position + vector.rotation * progress) * (Math.PI / 180);
      x += scale * factor * vector.scale * Math.cos(angle);
      y += scale * factor * vector.scale * Math.sin(angle);
    }
    // clip x and y value between 0 and 7
    x = Math.max(0, Math.min(7, x));
    x = Math.round(x);
    y = Math.max(0, Math.min(7, y));
    y = Math.round(y);
    return { x, y };
  }

function compoundValue(x: number, y: number) {
  return Math.floor(x + y*8) * 2;
}

function get3dSample(name: string, sample: number, gain: number, x: number, y: number, delay:number = 0) {
  const offset = compoundValue(x, y);
  return {name, sample, gain, offset, duration: 1, attack: 0 }
}

function renderMaximalist(rng: Rng, plan: Plan, start: number, end: number, length: number, sequenceBars: number, strongSteps: any) {
  const kick: Mutation[] = [];
  const snare: Mutation[] = [];
  const hiHat: Mutation[] = [];
  for (let i = start; i < end; i = i + BAR) {
    let sequence = [];
    for (let j = 0; j < BAR; j++) {
      const isKickStrongStep = strongSteps.kick.includes(j);
      const isSnareStrongStep = strongSteps.snare.includes(j);
      const { x, y } = coordinates((i + j) / plan.middlePoint, KICK_VECTORS);
      const gain = isKickStrongStep ? 1 : isSnareStrongStep ? rng.pick([0.5, 0.7, 0.9]) : rng.pick([0.3,0.5]);
      const sample = 0;
      const type = isKickStrongStep
      ? (rng.chance(0.95) ? "single" : "none")
      : (isSnareStrongStep ? rng.pick(["single", "none", "single"])
      : rng.pick(["none", "none", "none", "multi", "multi", "single", "single"]));

      if (type === "single") {
        sequence.push(get3dSample("kc", sample, gain, x, y));

      } else if (type === "multi") {
        const microSequence = [];
        for (let a = 0; a < 10; a++) {
          if (rng.chance(2/(a * a))) microSequence.push(get3dSample("kc", sample, rng.range(0.1,gain), x, y));
          else break;
        }
        sequence.push(microSequence);
      } else {

        sequence.push(null);
      }
    }
    kick.push({
      type: "add",
      where: ["sequences"],
      probability: 1,
      injection: sequence
    })
    sequenceBars++;
    sequence = [];
    for (let j = 0; j < BAR; j++) {
      const isKickStrongStep = strongSteps.kick.includes(j);
      const isSnareStrongStep = strongSteps.snare.includes(j);
      const { x, y } = coordinates((i + j) / plan.middlePoint, SNARE_VECTORS);
      const gain = isSnareStrongStep ? 1 : isKickStrongStep ? rng.range(0.05,0.2) : rng.range(0.1,0.3);
      const sample = 0;
      const type = isSnareStrongStep
      ? (rng.chance(0.95) ? "single" : "none")
      : (isKickStrongStep ? rng.pick(["none", "none", "single"])
      : rng.pick(["none", "none", "multi", "multi", "single"]));

      if (type === "single") {
        sequence.push(get3dSample("kc", sample, gain, x, y));

      } else if (type === "multi") {
        const microSequence = [];
        for (let a = 0; a < 10; a++) {
          if (rng.chance(2/(a * a))) microSequence.push(get3dSample("kc", sample, rng.range(0.1,gain), x, y));
          else break;
        }
        sequence.push(microSequence);
      } else {

        sequence.push(null);
      }
    }
    snare.push({
      type: "add",
      where: ["sequences"],
      probability: 1,
      injection: sequence
    })
  }

  function Multi (curve: number, min:number, sample:number, gain:number, x:number, y:number ){
    const microSequence = [];
    const hits = rng.pick([2,2,2,2,2,3,3,3,3,4,4,4,5,5,6])
    for (let i = 0; i < hits; i++) {
      let delay;
      if (i % 2 === 1) delay = rng.range(0,(1 / hits / 3));
      else delay = 0
      microSequence.push(get3dSample("mt", sample, rng.range(min,gain), x, y, delay));
    }
    return microSequence;
  }

  function Roll (sample: number, gain:number, x:number, y:number, vector: number[], inverted: boolean, hits: number, steps: number){
    const microSequences = [];
    const totalHits = Math.ceil(hits/steps) * steps;
    
    for (let i = 0; i < steps; i++) {
      const microSequence = [];
      for (let a = 0; a < totalHits / steps; a++) {
        if (i < hits) {
          let sampleX, sampleY
          if (!inverted) {sampleX = x + (vector[0] * i/hits)}
          else {sampleX = (x + (vector[0])) - (- vector[0] * i/hits)}
          if (!inverted) {sampleY = y + (vector[1] * i/hits)}
          else {sampleY = (y + (vector[1])) - (- vector[1] * i/hits)}

          let sampleGain
          if (!inverted) {sampleGain = gain - ((gain - minGain) * i/steps)}
          else {sampleGain = minGain + ((gain - minGain) * i/steps)}
          microSequence.push(get3dSample("rl", sample, rng.range(minGain, gain), sampleX, sampleY))
        } else {
          microSequence.push(null);
        }
      }
      microSequences.push(microSequence);
    }
  }
  
  return { kick, snare, sequenceBars };
}
