<script lang="ts">
  import { onMount } from "svelte";
  import * as Tone from "tone";

  // Types
  type BeatInput = number | null | BeatInput[];

  type SampleType = {
    name: string;
    sample: number;
    probability?: number;
    probabilityMin?: number;
    probabilityMax?: number;
    gain?: number;
    gainMin?: number;
    gainMax?: number;
    offset?: number;
    offsetMin?: number;
    offsetMax?: number;
    duration?: number;
    durationMin?: number;
    durationMax?: number;
    playbackRate?: number;
    playbackRateMin?: number;
    playbackRateMax?: number;
    reversed?: number;
  };

  type ResolvedBeat = { type: BeatInput; probability: number } | null;

  type SampleSchema = {
    samples: string[];
    types: SampleType[];
    sequences: (BeatInput | null)[][];
    metaSequences: { type: string; sequence: number[]; markovMatrix?: number[][] }[];
    interjections?: {
      when: { sequences: number[]; beats: number[] };
      probability: number;
      sequence: (BeatInput | null)[] | undefined;
    }[];
  };

  // Props
  let {
    sampleSchema,
    beat,
    metaSequence,
    channel,
    time,
    beatDuration,
  }: {
    sampleSchema: SampleSchema;
    beat: number;
    metaSequence: number;
    channel: Tone.ToneAudioNode;
    time: number;
    beatDuration: number; // seconds per beat — parent should pass 60 / bpm / subdivision
  } = $props();

  // State
  let sequence = 0;
  let samples: Tone.Player[] = [];
  let gainNode: Tone.Gain;
  let beatRef = 0;
  let ready = false;
  let interjection: (BeatInput | null)[] | undefined;

  // Helper functions
  function randomValue(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  function resolveRange(exact?: number, min?: number, max?: number, fallback = 1): number {
    if (exact !== undefined) return exact;
    if (min !== undefined && max !== undefined) return randomValue(min, max);
    return fallback;
  }

  // Resolved sequences — now BeatInput-aware
  const resolvedSequences: ResolvedBeat[][] = sampleSchema.sequences.map((seq) =>
    seq.map((cell) => {
      if (cell === null || cell === undefined) return null;
      // For probability, peek at the first leaf type index
      const firstType = firstLeaf(cell);
      const t = sampleSchema.types[firstType];
      if (!t) return null;
      const probability = resolveRange(t.probability, t.probabilityMin, t.probabilityMax, 1);
      return { type: cell, probability };
    })
  );

  // Get the first leaf number from a BeatInput (for probability lookup)
  function firstLeaf(input: BeatInput): number {
    if (typeof input === "number") return input;
    if (Array.isArray(input)) return firstLeaf(input[0]);
    return 0; // Fallback for null or undefined
  }

  // Play a single type index at a given time and duration
  function playType(typeIndex: number, startTime: number, duration: number): void {
    const typeArray = sampleSchema.types[typeIndex];
    if (!typeArray) {
      console.warn(`Invalid type index: ${typeIndex}`);
      return;
    }

    const player = samples[typeArray.sample];
    if (!player || !player.loaded) return;

    const gain         = resolveRange(typeArray.gain, typeArray.gainMin, typeArray.gainMax, 1);
    const offset       = resolveRange(typeArray.offset, typeArray.offsetMin, typeArray.offsetMax, 0);
    const playbackRate = resolveRange(typeArray.playbackRate, typeArray.playbackRateMin, typeArray.playbackRateMax, 1);
    const dur = Math.min(
      resolveRange(typeArray.duration, typeArray.durationMin, typeArray.durationMax, duration),
      duration
    );
    const reversed     = typeArray.reversed !== undefined && Math.random() < typeArray.reversed;

    // Per-player gain envelope (each player has its own gainNode, so we use a fresh one here)
    // Note: gainNode is shared — if simultaneous subdivision hits matter, consider per-note gains
    gainNode.gain.cancelAndHoldAtTime(startTime);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.005);
    gainNode.gain.setValueAtTime(gain, startTime + dur - 0.005);
    gainNode.gain.linearRampToValueAtTime(0, startTime + dur);

    player.playbackRate = playbackRate;
    player.reverse = reversed;
    player.stop(startTime);
    player.start(startTime, offset, dur);
  }

  // Recursively play a BeatInput, subdividing `duration` across array elements
  function playSample(input: BeatInput, startTime: number, duration: number): void {
    if (typeof input === "number") {
      playType(input, startTime, duration);
    } else if (Array.isArray(input)) {
      const slotDuration = duration / input.length;
      input.forEach((item, i) => {
        if (item === null) return; // null = rest
        playSample(item, startTime + i * slotDuration, slotDuration);
      });
    }
  }

  // Setup
  async function setup(): Promise<void> {
    await Tone.loaded();
    gainNode = new Tone.Gain(1).connect(channel);
    samples = sampleSchema.samples.map((url) =>
      new Tone.Player({ url, loop: false, playbackRate: 1 }).connect(gainNode)
    );
    ready = true;
  }

  // Main play function — called on every beat tick
  async function play(time: number): Promise<void> {
    if (!ready) return;

    const seqList    = sampleSchema.metaSequences[metaSequence]?.sequence ?? [0];
    const metaType   = sampleSchema.metaSequences[metaSequence]?.type ?? "sequential";
    const currentSeqIndex = seqList[sequence % seqList.length];
    const currentSeq      = resolvedSequences[currentSeqIndex];

    beatRef = beat % currentSeq.length;

    // Meta sequence logic
    if (beatRef === 0 && beat !== 0) {
      if (metaType === "random") {
         = Math.floor(Math.random() * seqList.length);
      } else if (metaType === "markovian" && sampleSchema.metaSequences[metaSequence].markovMatrix) {
        const markovMatrix = sampleSchema.metaSequences[metaSequence].markovMatrix!;
        const probabilities = markovMatrix[sequence % markovMatrix.length];
        const total = probabilities.reduce((sum, p) => sum + p, 0);
        let r = Math.random() * total;
        for (let i = 0; i < probabilities.length; i++) {
          r -= probabilities[i];
          if (r <= 0) { sequence = i; break; }
        }
      } else {
        sequence = (sequence + 1) % seqList.length;
      }
    }

    // Start a new interjection if applicable
    if (sampleSchema.interjections && (!interjection || interjection.length === 0)) {
      for (const interjectionDef of sampleSchema.interjections) {
        if (
          interjectionDef.when.sequences.includes(currentSeqIndex) &&
          interjectionDef.when.beats.includes(beatRef) &&
          Math.random() < interjectionDef.probability
        ) {
          interjection = interjectionDef.sequence ? [...interjectionDef.sequence] : [];
          break;
        }
      }
    }

    let beatInput: BeatInput | null | undefined;

    if (interjection && interjection.length > 0) {
      const head = interjection.shift();
      if (head === null || head === undefined) return;
      beatInput = head;
    } else {
      interjection = undefined;
      const currentBeat = currentSeq[beatRef];
      console.log("Current Beat:", currentBeat);
      if (!currentBeat) return;
      if (Math.random() >= currentBeat.probability) return;
      beatInput = currentBeat.type;
    }

    if (beatInput === undefined || beatInput === null) return;

    console.log("Playing BeatInput:", beatInput);

    playSample(beatInput, time, beatDuration);
  }

  function updateBeat(time: number){ 
    if (beat < 0){
      return;
    } else if (beat < sequences)
  }

  onMount(() => {
    setup();
  });

  $effect(() => {
    updateBeat(time);
  });
</script>