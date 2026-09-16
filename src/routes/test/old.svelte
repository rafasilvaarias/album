<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as Tone from "tone";
  import { mulberry32 } from "$lib/assets/mulberry32";
  import StochasticSequencer from "$lib/StochasticSequencer.svelte";
  import kickSchema from "../listen/kick.json";
  import rideSchema from "../listen/ride.json";
  import tomsSchema from "../listen/toms.json";
  import snareSchema from "../listen/snare.json";
  import bassSchema from "../listen/bass.json";
  import harpSchema from "../listen/harp.json";
  import crashSchema from "../listen/crash.json";
  import guitarSchema from "../listen/guitar.json";
  import sonarSchema from "../listen/pad.json";
  import voiceSchema from "../listen/voice.json";
  import hiHatSchema from "../listen/hiHat.json";
  import breakDrumsSchema from "../listen/crashDrums.json";
  import synthSchema from "../listen/synth.json";
  import pianoSchema from "../listen/piano.json";
  import tambourineSchema from "../listen/tambourine.json";
  import { getPhrase } from "../listen/phrase";

  const seed = Math.round(Math.random() * 100000);
  //const seed=12;
  const random = mulberry32(seed);

  // --- State ---
  let playing = $state(false);
  let beat = $state(-1);
  let time = $state(0);
  let sequencerReady = $state(false);

  let bpm = $state(87);
  let subdivision = $state(2);
  let beatTime = (60 / bpm) / subdivision;

  /* STRUCTURE;
    6 numbers for intro; 4 for track appearances; 1 idle; 1 for glotal sound;
    1 for first verse
  */
  
  ////INTRO
  let introTrackOrder: (keyof typeof tracks)[] = ['kick', 'ride', 'toms', 'snare'];
  introTrackOrder = introTrackOrder.sort(() => random() - 0.5);
  //introTrackOrder = ['snare','toms','ride','kick'] //uncomment to select intro order
  let times = [Math.floor(random() * 2) + 2, Math.floor(random() * 2) + 1, Math.floor(random() * 3) + 0, Math.floor(random() * 3) + 0, Math.floor(random() * 3) + 0];
  //times = [0,0,0,0,0] //uncomment to manually select intro times
  const sum = times.reduce((a, b) => a + b, 0);
  times = [...times, sum % 2 === 0 ? 2 : 1]; //glotal sound

  ////FIRST VERSE
  times = [...times, Math.floor(random() * 8) + 4];

  ////PAUSE
  times = [...times, Math.floor(random() * 6) + 2];

  ////SECOND VERSE
  times = [...times, Math.floor(random() * 8) + 4];

  ////CLIMAX
  times = [...times, Math.floor(random() * 6) + 2];

  ////OUTRO
  times = [...times, Math.floor(random() * 4) + 2];
  //[0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 272, 288],
  for (let i = 0; i < 6; i++) { //SKIP SECTIONS HERE
    times[i] = 100;
  }

  console.log(times);

  let running = 0;
  const timesSum = times.map(t => {
    running += t;
    return running * 16;
  });

  console.log(timesSum);
  console.log("Total minutes of track: ", timesSum[10] * beatTime / 60)

  //EXTRA TIMES
  const synthTimes = [
    timesSum[5] + Math.floor(random() * ((timesSum[6] - timesSum[5]) / 8)) * 8,
    timesSum[6] + Math.floor(random() * ((timesSum[7] - timesSum[6]) / 8)) * 8
  ];
  console.log(synthTimes);
  const glotalTime = timesSum[5] - 32 >= timesSum[4] ? 2 : 1;

  //EXTRA MUTATIONS///////////////////////////////////////////////////////////////////////

  const bassExtraMutations = (() => {
    const possibleSteps = [1, 2, 4, 5, 7, 8, 10, 11, 12];
    function getRandomInt(min: number, max: number) {
      min = Math.ceil(min);
      max = Math.floor(max);
      return Math.floor(random() * (max - min + 1)) + min;
    }
    const mutationsPerSequence = [getRandomInt(0, 3), getRandomInt(0, 3), getRandomInt(0, 3), getRandomInt(0, 3)];
    function getRandomMutation(index: number) {
      const randomStep = possibleSteps[Math.floor(random() * possibleSteps.length)];
      return {
        "type": "change",
        "where": ["sequences", index + 1, randomStep],
        "probability": 1,
        "injection": 0
      }
    }
    let extraMutations = [];
    for (let i = 0; i < mutationsPerSequence.length; i++) {
      for (let j = 0; j < mutationsPerSequence[i]; j++) {
        extraMutations.push(getRandomMutation(i));
      }
    }
    return extraMutations;
  })();

  const rideExtraMutations = (() => {
    let possibleSteps = [3, 4, 5, 6, 7];
    let extraMutations = [];
    for (let i = 0; i < possibleSteps.length; i++) {
      if (random() < 0.15) {
        const randomStep = possibleSteps[Math.floor(random() * possibleSteps.length)];
        extraMutations.push({
          "type": "change",
          "where": ["sequences", 6, randomStep],
          "probability": 1,
          "injection": [null, [4, 4]]
        });
      }
    }
    possibleSteps = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = 0; i < possibleSteps.length; i++) {
      if (random() < 0.15) {
        const randomStep = possibleSteps[Math.floor(random() * possibleSteps.length)];
        extraMutations.push({
          "type": "change",
          "where": ["sequences", 7, randomStep],
          "probability": 1,
          "injection": [null, [4, 4]]
        });
      }
    }

    return extraMutations;
  })();

  const harpExtraMutations = (() => {
    const harpPossibleNHits = [3, 5, 7];
    const harpNoHits = harpPossibleNHits[Math.floor(random() * harpPossibleNHits.length)];
    const harpBeatTime = 8 / harpNoHits;

    function buildSequence() {
      const seq = [];
      for (let i = 0; i < harpNoHits; i++) {
        const syncopated = random() < 0.5;
        const delay = (harpBeatTime * i) - (i * (1 / harpNoHits));
        const delaySyncopated = delay - (1 / (harpNoHits * 2)) + harpBeatTime * 0.75;
        if (syncopated) {
          seq.push([
            { "name": "*", "sample": 1, "gain": [1, 0.75, 0.5], "delay": delay, "offset": 0, "duration": 4, "probability": [1] },
            { "name": "*", "sample": 1, "gain": [0.3, 0.5, 0.4, 0.72], "delay": delaySyncopated, "offset": [0.2, 0.1], "duration": 4, "probability": [1] },
          ]);
        } else {
          seq.push(
            { "name": "*", "sample": 1, "gain": [1, 0.75, 0.5], "delay": delay, "offset": 0, "duration": 4, "probability": [1] }
          );
        }
      }
      return [seq, null, null, null, null, null, null, null];
    }

    return [
      { "type": "add", "where": ["sequences"], "probability": 1, "injection": buildSequence() },
      { "type": "add", "where": ["sequences"], "probability": 1, "injection": buildSequence() },
      { "type": "add", "where": ["sequences"], "probability": 1, "injection": buildSequence() },
    ];
  })();

  const sonarExtraMutations = (() => {
    let extraMutations = [];
    for (let i = 0; i < 15; i++) {
      if (random() < 0.5) {
        const sampleN = random() < 0.2 ? 1 : 0;
        const sampleOffset = i + (random() * 0.2 - 0.1);
        const sampleName = "[]";
        extraMutations.push(
          {
            "type": "change",
            "where": ["sequences", 1, i + 1],
            "probability": 1,
            "injection":
            {
              "name": sampleName,
              "sample": sampleN,
              "gain": [0.9, 1, 1.1],
              "delay": 0,
              "offset": sampleOffset,
              "duration": 16,
              "probability": 0.5
            }
          }
        )
      }
      if (random() < 0.5) {
        const sampleN = random() < 0.2 ? 1 : 0;
        const sampleOffset = i + (random() * 0.2 - 0.1);
        const sampleName = "[]";
        extraMutations.push(
          {
            "type": "change",
            "where": ["sequences", 2, i + 1],
            "probability": 1,
            "injection":
            {
              "name": sampleName,
              "sample": sampleN,
              "gain": [0.9, 1, 1.1],
              "delay": 0,
              "offset": sampleOffset,
              "duration": 16,
              "probability": 0.5
            }
          }
        )
      }
    }

    return extraMutations;
  })();

  const voiceExtraMutations = (() => {
    let extraMutations = [];

    let iGOrder = [0, 1, 2, 3, 4, 5];
    iGOrder = iGOrder.sort(() => random() - 0.5);

    for (let i = 0; i < iGOrder.length; i++) {
      const name = "IG" + iGOrder[i] + ".wav";
      extraMutations.push({
        "type": "change",
        "where": ["samples", [i]],
        "probability": 1,
        "injection": name,
      });
    }

    ///////////////////////////////////// Interjections for aaaaaaaa
    const numberOfInterjections = 3;
    for (let i = 0; i < numberOfInterjections; i++) {
      const nOfA = Math.floor(random() * 15) + 10;
      const minDiff = 8; // min y-gap between the two middle points
      const minGap = 3;  // min x-gap between every pair of points

      const startPoint = [0, 0];
      const endPoint = [nOfA, 11];

      let pointA: [number, number];
      let pointB: [number, number];
      do {
        const xA = Math.floor(random() * (nOfA - 1)) + 1;
        const xB = Math.floor(random() * (nOfA - 1)) + 1;
        const [x1, x2] = xA <= xB ? [xA, xB] : [xB, xA];
        pointA = [x1, Math.floor(random() * 12)];
        pointB = [x2, Math.floor(random() * 12)];
      } while (
        pointA[0] - startPoint[0] < minGap ||
        endPoint[0] - pointB[0] < minGap ||
        pointB[0] - pointA[0] < minGap ||
        Math.abs(pointB[1] - pointA[1]) < minDiff
      );

      const points = [];
      for (let x = startPoint[0]; x <= pointA[0]; x++) {
        const t = (x - startPoint[0]) / (pointA[0] - startPoint[0]);
        points.push(Math.floor(startPoint[1] + t * (pointA[1] - startPoint[1])));
      }
      for (let x = pointA[0] + 1; x <= pointB[0]; x++) {
        const t = (x - pointA[0]) / (pointB[0] - pointA[0]);
        points.push(Math.floor(pointA[1] + t * (pointB[1] - pointA[1])));
      }
      for (let x = pointB[0] + 1; x < endPoint[0]; x++) {
        const t = (x - pointB[0]) / (endPoint[0] - pointB[0]);
        points.push(Math.floor(pointB[1] + t * (endPoint[1] - pointB[1])));
      }
      let aSequence: (any)[] = [null];
      for (let i = 0; i < points.length; i++) {
        aSequence.push(
          {
            "name": "a",
            "sample": 7,
            "gain": 1.5,
            "delay": 0,
            "offset": points[i] / 2,
            "duration": 0.5,
            "probability": 1
          }
        );
      }

      //pairing for half note
      const paired = [];
      for (let i = 0; i < aSequence.length; i += 2) {
        paired.push([aSequence[i], aSequence[i + 1] ?? null]);
      }
      //console.log(paired);

      const probability = i == 2 ? 1 : random() * 0.5 + 0.25;

      extraMutations.push({
        "type": "add",
        "where": ["interjections"],
        "probability": 1,
        "injection": {
          "when": {
            "sequences": [4],
            "beats": [3]
          },
          "probability": probability,
          "sequence": paired
        },
      });

      if (glotalTime == 1) {
        extraMutations.push({
          "type": "change",
          "where": ["types", 6, "offset"],
          "probability": 1,
          "injection": 16
        });
      }
    }

    //// markov phrase builder
    const alphabet = ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"]
    type Chain = Record<string, string[]>;

    function buildMarkovChain(text: string): Chain {
      const clean = text.toLowerCase().replace(/[^a-z]/g, '');
      const chain: Chain = {};

      for (let i = 0; i < clean.length; i++) {
        const current = clean[i];
        const next = clean[(i + 1) % clean.length];
        if (!chain[current]) chain[current] = [];
        chain[current].push(next);
      }

      return chain;
    }

    function generate(chain: Chain, n: number, start?: string): string {
      const keys = Object.keys(chain);
      let current = start ?? keys[0];
      let result = current;

      while (result.length < n) {
        const options = chain[current];
        if (!options || options.length === 0) {
          current = keys[Math.floor(random() * keys.length)];
          continue;
        }
        current = options[Math.floor(random() * options.length)];
        result += current;
      }

      return result;
    }

    // Example
    const phrase = getPhrase(seed);
    const text = phrase.phrase;
    const chain = buildMarkovChain(text);
    let sequenceLetters = generate(chain, 32);
    let sequenceSlow = [];
    let sequenceFast = [];
    for (let i = 0; i < sequenceLetters.length; i++){
      const index = alphabet.indexOf(sequenceLetters[i]);
      sequenceSlow.push(
        {
            "name": sequenceLetters[i],
            "sample": 9,
            "gainMin": 1.5, "gainMax": 1.7,
            "delay": 0,
            "offset": index*2,
            "duration": 2,
            "probability": 1
        },
      );
      sequenceSlow.push(null);
      
    }

    sequenceLetters = generate(chain, 32);

    for (let i = 0; i < sequenceLetters.length; i++){
      const index = alphabet.indexOf(sequenceLetters[i]);
      sequenceFast.push(
        {
            "name": sequenceLetters[i],
            "sample": 10,
            "gainMin": 1.5, "gainMax": 1.7,
            "delay": 0,
            "offset": index,
            "duration": 1,
            "probability": 1
        },
      );
    }

    extraMutations.push({
        "type": "change",
        "where": ["sequences",8],
        "probability": 1,
        "injection": sequenceSlow,
    });
    extraMutations.push({
        "type": "change",
        "where": ["sequences",9],
        "probability": 1,
        "injection": sequenceFast,
    });

    return extraMutations;
  })();

  const bDExtraMutations = (() => {
    let extraMutations: any = [];
    const durations = [0.5, 0.5, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 0.75, 0.75, 1.5, 1.5, 1.5, 1.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.25, 1.25, 1, 0.75, 2, 1, 1, 0.25, 0.5, 0.25, 0.5, 0.25, 0.75, 0.5, 0.75, 0.5, 0.25, 0.25];
    let indexes = Array.from({ length: 38 }, (_, i) => i);
    const nOfSequences = 10 + Math.floor(random() * 11);
    const sequences = [];

    for (let i = 0; i < nOfSequences; i++) {
      if (indexes.length === 0) break;
      let sequence = null;
      let attempts = 0;
      while (!sequence && attempts < 200) {
        attempts++;
        const pool = [...indexes];
        const current = [];
        let sum = 0;
        const startPos = Math.floor(random() * pool.length);
        const startIndex = pool.splice(startPos, 1)[0];
        current.push(startIndex);
        sum += durations[startIndex];
        while (sum !== 1 && sum !== 2 && pool.length > 0) {
          const pos = Math.floor(random() * pool.length);
          const candidateIndex = pool[pos];
          pool.splice(pos, 1);
          if (sum + durations[candidateIndex] <= 2) {
            current.push(candidateIndex);
            sum += durations[candidateIndex];
          }
        }
        if (sum === 1 || sum === 2) {
          sequence = current.map(idx => ({ index: idx, duration: durations[idx] }));
        }
      }
      if (!sequence) break;
      sequences.push(sequence);
      indexes = indexes.filter(idx => !sequence.some(s => s.index === idx));
    }

    for (let i = 0; i < sequences.length; i++) {
      const totalDuration = sequences[i].reduce((sum, s) => sum + s.duration, 0);
      let injection: any = totalDuration === 1
        ? [[null, null, null, null]]
        : [[null, null, null, null], [null, null, null, null]];
      let tempoSum = 0;
      for (let a = 0; a < sequences[i].length; a++) {
        injection[tempoSum >= 4 ? 1 : 0][tempoSum % 4] = {
          "name": "&&",
          "sample": 0,
          "gain": 1,
          "delay": 0,
          "offset": sequences[i][a].index * 2,
          "duration": 2,
          "probability": 1
        }
        tempoSum = tempoSum + sequences[i][a].duration * 4;
      }
      extraMutations.push({
        "type": "add",
        "where": ["sequences"],
        "probability": 1,
        "injection": injection,
      });
    }

    // 1 = the existing sequence already in the json, 2..N = the ones we just added, in order
    const nOfCDSequences = sequences.length + 1;
    const cdSequenceList = Array.from({ length: nOfCDSequences }, (_, i) => i + 1);

    const cdMarkovMatrix = [];
    for (let s = 0; s < nOfCDSequences; s++) {
      const row = new Array(nOfCDSequences).fill(0);
      const maxConnections = Math.min(5, nOfCDSequences);
      const nConnections = Math.floor(random() * (maxConnections - 1)) + 2;

      const availableCols = Array.from({ length: nOfCDSequences }, (_, i) => i);
      const chosenCols = [];
      for (let c = 0; c < nConnections; c++) {
        const pos = Math.floor(random() * availableCols.length);
        chosenCols.push(availableCols.splice(pos, 1)[0]);
      }

      const rawWeights = chosenCols.map(() => random());
      const weightSum = rawWeights.reduce((a, b) => a + b, 0);

      chosenCols.forEach((col, idx) => {
        row[col] = rawWeights[idx] / weightSum;
      });

      cdMarkovMatrix.push(row);
    }

    extraMutations.push({
      "type": "change",
      "where": ["metaSequences", 1],
      "probability": 1,
      "injection": {
        "type": "markovian",
        "sequence": cdSequenceList,
        "markovMatrix": cdMarkovMatrix
      }
    });

    return extraMutations;
  })();

  // --- Tracks ------------------------------------------------------------------------------------------------------------------------------------

  type EqSettings = {
    low: number;
    mid: number;
    high: number;
    lowFrequency?: number;  // defaults to 200
    highFrequency?: number; // defaults to 6800
  };

  type TrackMessage = [number[], number, string[], number];

  type Track = {
    schema: any;
    gain: number;
    pan: number | null;   // null = no panner, straight to master bus
    eq: EqSettings | null; // null = no per-track EQ3
    reverb: number | null; // null = no reverb send, otherwise send gain amount
    metaSequence: number;
    extraMutations: any[];
    message: TrackMessage;
    reset: number;
    // built in onMount:
    channel?: Tone.Gain;
    panner?: Tone.Panner;
    eq3?: Tone.EQ3;
    reverbSend?: Tone.Gain;
  };

  const defaultEQ = {low:0,mid:0,high:0};
  const defaultMessage : TrackMessage = [[], 1000, [], 1000];

  const tracks = $state<Record<string, Track>>({
    kick:       { schema: kickSchema,       gain: 0.25, pan: null, eq: defaultEQ,   reverb: 0.2,  metaSequence: 2, extraMutations: [],                  message: defaultMessage, reset: 0 },
    ride:       { schema: rideSchema,       gain: 0.30, pan: 0.5,  eq: null,        reverb: null, metaSequence: 0, extraMutations: rideExtraMutations,  message: defaultMessage, reset: 0 },
    toms:       { schema: tomsSchema,       gain: 1.00, pan:-0.2,  eq: null,        reverb: 1,    metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    snare:      { schema: snareSchema,      gain: 0.40, pan:-0.05, eq: null,        reverb: 1.3,  metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    bass:       { schema: bassSchema,       gain: 0.90, pan: null, eq: null,        reverb: null, metaSequence: 1, extraMutations: bassExtraMutations,  message: defaultMessage, reset: 0 },
    crash:      { schema: crashSchema,      gain: 0.40, pan: null, eq: null,        reverb: 3,    metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    guitar:     { schema: guitarSchema,     gain: 0.10, pan: 0.2,  eq: null,        reverb: 2,    metaSequence: 3, extraMutations: [],                  message: defaultMessage, reset: 0 },
    sonar:      { schema: sonarSchema,      gain: 1.30, pan: null, eq: null,        reverb: 1,    metaSequence: 0, extraMutations: sonarExtraMutations, message: defaultMessage, reset: 0 },
    voice:      { schema: voiceSchema,      gain: 2.00, pan: null, eq: null,        reverb: null, metaSequence: 0, extraMutations: voiceExtraMutations, message: defaultMessage, reset: 0 },
    hiHat:      { schema: hiHatSchema,      gain: 0.90, pan:-0.2,  eq: null,        reverb: 1.7,  metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    breakDrums: { schema: breakDrumsSchema, gain: 0.45, pan: null, eq: defaultEQ,   reverb: null, metaSequence: 1, extraMutations: bDExtraMutations,    message: defaultMessage, reset: 0 },
    synth:      { schema: synthSchema,      gain: 0.90, pan: null, eq: defaultEQ,   reverb: 5,    metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    piano:      { schema: pianoSchema,      gain: 1.60, pan: null, eq: null,        reverb: null, metaSequence: 0, extraMutations: [],                  message: defaultMessage, reset: 0 },
    tambourine: { schema: tambourineSchema, gain: 1.00, pan: null, eq: null,        reverb: null, metaSequence: 1, extraMutations: [],                  message: defaultMessage, reset: 0 },
  });

  let masterEq: Tone.EQ3;

  // --- Hardware-style -1..1 knob position -> dB, exponential curve ---
  function positionToDb(
    position: number,
    min: number = -30,
    max: number = 10,
    k: number = 3
  ): number {
    const t = Math.max(-1, Math.min(1, position));
    const peak = t >= 0 ? max : Math.abs(min);
    const sign = t >= 0 ? 1 : -1;
    return sign * ((Math.pow(k, Math.abs(t)) - 1) / (k - 1)) * peak;
  }

  const EQ_RANGE: Record<'low' | 'mid' | 'high', [number, number]> = {
    low:  [-30, 10],
    mid:  [-25, 10],
    high: [-30, 10],
  };

  const ISOLATOR_RANGE: Record<'low' | 'mid' | 'high', [number, number]> = {
    low:  [-35, 6],
    mid:  [-20, 6],
    high: [-35, 6],
  };

  function setSeq(track: keyof typeof tracks, seq: number) {
    tracks[track].metaSequence = seq;
    tracks[track].reset++;
  }

  type ParamName = 'gain' | 'pan' | 'low' | 'mid' | 'high' | 'reverb';

  function setParam(
    track: keyof typeof tracks,
    param: ParamName,
    value: number,      // -1..1 for low/mid/high, raw value for gain/pan/reverb
    rampBeats: number = 0
  ) {
    const t = tracks[track];

    const node = {
      gain:   t.channel?.gain,
      pan:    t.panner?.pan,
      low:    t.eq3?.low,
      mid:    t.eq3?.mid,
      high:   t.eq3?.high,
      reverb: t.reverbSend?.gain,
    }[param];

    if (!node) return;

    const isEq = param === 'low' || param === 'mid' || param === 'high';
    const target = isEq ? positionToDb(value, ...EQ_RANGE[param]) : value;
    const rampTime = rampBeats * beatTime;

    rampTime > 0 ? node.rampTo(target, rampTime) : (node.value = target);
  }

  function setIsolator(values: [number, number, number], rampBeats: number = 0) {
    const [low, mid, high] = values;
    const rampTime = rampBeats * beatTime;

    const targets = {
      low:  positionToDb(low,  ...ISOLATOR_RANGE.low),
      mid:  positionToDb(mid,  ...ISOLATOR_RANGE.mid),
      high: positionToDb(high, ...ISOLATOR_RANGE.high),
    };

    (['low', 'mid', 'high'] as const).forEach((band) => {
      rampTime > 0
        ? masterEq[band].rampTo(targets[band], rampTime)
        : (masterEq[band].value = targets[band]);
    });
  }

  // --- Setup on mount ---
  onMount(async () => {
    if (typeof window === "undefined") return;

    masterEq = new Tone.EQ3({
      low: 0,
      mid: 0,
      high: 0,
      lowFrequency: 300,
      highFrequency: 4000,
    }).toDestination();

    // shared reverb bus - individual tracks send into this via t.reverbSend
    const reverb = new Tone.Reverb({ decay: 0.8, wet: 1 }).connect(masterEq);
    const reverbReturn = new Tone.Gain(0.2).connect(reverb); // master reverb gain

    (Object.values(tracks) as Track[]).forEach((t) => {
      t.channel = new Tone.Gain(t.gain);
      let node: Tone.ToneAudioNode = t.channel;

      if (t.eq) {
        t.eq3 = new Tone.EQ3({
          low: t.eq.low,
          mid: t.eq.mid,
          high: t.eq.high,
          lowFrequency: t.eq.lowFrequency ?? 200,
          highFrequency: t.eq.highFrequency ?? 6800,
        });
        node.connect(t.eq3);
        node = t.eq3;
      }

      if (t.pan !== null) {
        t.panner = new Tone.Panner(t.pan);
        t.panner.channelCount = 2;
        t.panner.channelCountMode = "explicit";
        node.connect(t.panner);
        node = t.panner;
      }

      if (t.reverb !== null) {
        t.reverbSend = new Tone.Gain(t.reverb).connect(reverbReturn);
        t.channel.connect(t.reverbSend); // send taps the dry channel, in parallel to the main path
      }

      node.connect(masterEq);
    });

    sequencerReady = true;
    tracks.bass.channel!.gain.value = 0; // start with bass muted for intro
  });

  onDestroy(() => {
    if (typeof window === "undefined") return;
    Tone.Transport.stop();
    Tone.Transport.cancel();
  });

  // --- Play / Stop ---
    async function togglePlay() {
    if (playing) {
        Tone.Transport.stop();
        Tone.Transport.cancel();
        playing = false;
        return;
    }
    await Tone.start();
    Tone.Transport.bpm.value = bpm;

    Tone.Transport.scheduleRepeat((t) => {
        beat += 1;
        if (beat % 16 == 0) console.log(beat);
        time = t;

        //BASS FADE IN
        if (beat == 0) {
        setParam('bass', 'gain', tracks.bass.gain, times[0] * 16);
        }

        //INTRO
        for (let i = 0; i < 4; i++) {
        const name = introTrackOrder[i];
        if (name === 'ride' && beat === timesSum[i] - 4) {
            setSeq(name, 2);
        }
        if (beat === timesSum[i]) {
            setSeq(name, 1);
            if (random() < 0.2) {
            //Voice inflections
            setSeq('voice', 2);
            }
        }
        }

        //GLOTAL RISER
        if (beat == timesSum[5] - (glotalTime * 16)) {
        setParam('voice', 'gain', 0);
        setParam('voice', 'gain', tracks.voice.gain, glotalTime * 16);
        setSeq('voice', 3);
        }

        //VERSE BEAT SWITCH (branches on ride's state before this update)
        if (((beat >= timesSum[4] && beat < timesSum[6]) || (beat >= timesSum[7] && beat < timesSum[8])) && beat % 16 == 0 && random() < 0) {
        const rideWasOne = tracks.ride.metaSequence == 1;
        setSeq('ride', rideWasOne ? 3 : 1);
        setSeq('toms', rideWasOne ? 0 : 1);
        setSeq('snare', rideWasOne ? 0 : 1);
        setSeq('guitar', rideWasOne ? 2 : 0);
        setSeq('sonar', 1);
        setSeq('hiHat', rideWasOne ? 1 : 0);
        }

        //VERSE
        if (beat == timesSum[5]) {
        setSeq('voice', 1);
        setSeq('crash', 1);
        setParam('kick','mid',-0.3,64);
        //setParam('kick','high',-0.6,64);
        console.log("kickgoinglower")
        }

        if (beat == timesSum[5] + 61) {
        setSeq('piano', 3);
        }

        if (beat == timesSum[5] + 64) {
        setParam('kick','mid',0,32);
        setParam('kick','high',0,32);
        console.log("kickatHisLowGoingHigh")
        }

        if (beat == synthTimes[0]) {
        setSeq('synth', 1);
        }

        if (beat == timesSum[6] - 3) setSeq('piano', 2);

        //PAUSE
        if (beat == timesSum[6]) {
        setSeq('tambourine',1)
        setSeq('bass',2);
        setSeq('voice',4);
        setSeq('crash',1);
        setSeq('snare',0);
        setSeq('kick',2);
        setSeq('toms',0);
        setSeq('ride',0);
        setSeq('piano', 1);
        setSeq('guitar',3);
        }

        if (beat == synthTimes[1]) {
        setSeq('synth', 2);
        }

        //VERSE
        if (beat == timesSum[7] - 3) setSeq('piano', 3);

        if (beat == timesSum[7]) {
        setSeq('tambourine',0)
        setSeq('voice', 1);
        setSeq('bass', 1);
        setSeq('snare',1);
        setSeq('kick',1);
        setParam('guitar','gain',0,32)
        }

        if (beat > timesSum[7] && beat % 16 == 13 && random() < 0.3) setSeq('piano', 2);
        if (beat > timesSum[7] && tracks.piano.metaSequence == 2 && beat % 16 == 0) setSeq('piano', 1);

        if (beat == timesSum[8] - 32) {
        setParam('synth', 'mid', -0.5, 16);
        setSeq('guitar',3);
        setParam('guitar','gain',tracks.guitar.gain)
        }

        if (beat == timesSum[8] - 16) {
        setParam('synth', 'mid', 0.6, 16);
        setSeq('synth', 3);

        setParam('breakDrums', 'gain', 0);
        setParam('breakDrums', 'gain', tracks.breakDrums.gain, 16);
        }

        if (beat > timesSum[8] - 16 && beat < timesSum[8]) {
        setSeq('breakDrums', 1);
        }

        //if (beat == timesSum[8] - 32) setParam('bass', 'low', -1, 32);
        //if (beat == timesSum[8]) setParam('bass', 'low', 0, 0);

        //CLIMAX
        if (beat == timesSum[8]) {
        setSeq('voice', 5);
        setSeq('crash', 1);
        setSeq('kick', 2);
        setSeq('ride', 0);
        setSeq('toms', 0);
        setSeq('snare', 0);
        setSeq('hiHat', 0);
        setSeq('bass', 2);
        setIsolator([0,0,0]);
        setParam('breakDrums', 'mid', 0.2, times[9]*16);
        setParam('breakDrums', 'high', 0.3, times[9]*16);
        setParam('breakDrums', 'low',-0.3, times[9]*16);
        setParam('voice', 'mid', .3);
        setSeq('tambourine',0)
        }

        if (beat == timesSum[8] + 32) setSeq('voice', 6);

        //CLIMAX
        if (beat >= timesSum[8] && beat < timesSum[9] && beat % 8 == 0) {
        setSeq('breakDrums', 1);
        }

        //OUTRO
        if (beat == timesSum[9]) {
        setSeq('breakDrums', 0);
        }

        if (beat == timesSum[10]) {
        console.log("end");
        setSeq('guitar', 0);
        setSeq('sonar', 1);
        setSeq('bass', 0);
        setSeq('voice', 0);
        }

    }, beatTime);

    Tone.Transport.start();
    playing = true;
    }
</script>

{#if sequencerReady}
  {#each Object.entries(tracks) as [name, track] (name)}
    <StochasticSequencer
      sampleSchema={track.schema}
      extraMutations={track.extraMutations}
      {beat}
      metaSequenceIndex={track.metaSequence}
      channel={track.channel!}
      {time}
      beatDuration={beatTime}
      {seed}
      bind:message={track.message}
      bind:reset={track.reset}
    />
  {/each}
{/if}

<div class="message">
  {#each Object.values(tracks) as track}
    <div class="messageDiv">
      <div>
        {#each track.message[0] as sequenceIndex, j}
          <p class={j === track.message[1] ? "pulsate" : ""}>{sequenceIndex}</p>
        {/each}
      </div>
      <div>
        {#each track.message[2] as beatName, j}
          <p class={j + 1 === track.message[3] ? "pulsate" : ""}>{beatName}</p>
        {/each}
      </div>
    </div>
  {/each}
</div>

<p class="white">{beat}</p>

<button
  class="play-btn"
  class:active={playing}
  onclick={togglePlay}
>
  {playing ? "■ stop" : "▶ play"}
</button>

<style>
  :global(body) {
    margin: 0;
    background: #0a0a0a;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    min-height: 100vh;
    font-family: "Courier New", monospace;
  }

  .play-btn {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: transparent;
    border: 1px solid #444;
    color: #ccc;
    font-family: "Courier New", monospace;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    padding: 0.5rem 2rem;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }

  .play-btn:hover {
    border-color: #fff;
    color: #fff;
  }

  .play-btn.active {
    border-color: #f00;
    color: #f00;
  }

  .message {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    font-family: "Courier New", monospace;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    width: 100%;
  }

  .messageDiv {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .messageDiv > div:first-child {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 26%;
    padding-left: 1rem;
  }

  .messageDiv > div:last-child {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 66.666%;
  }

  .messageDiv > div > p {
    color: #646464;
    transition: color ease-in-out 0.1s;
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .messageDiv > div > .pulsate {
    color: #fff;
    animation: pulsate 0.5s ease-out;
    border: 0.5px solid transparent;
  }

  @keyframes pulsate {
    0%   { background-color: transparent; border: 0.5px solid #444; }
    100% { background-color: transparent; border: 0.5px solid transparent; }
  }
</style>