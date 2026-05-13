<script lang="ts">
  import { onMount } from "svelte";
  import * as Tone from "tone";

  //Type
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
  type ResolvedBeat = { type: number; probability: number } | null;
  type SampleSchema = {
    samples: string[];
    types: SampleType[];
    sequences: (number | null)[][];
    metaSequences: { type: string; sequence: number[]; markovMatrix?: number[][] }[];
    interjections?: { when: { sequences: (number)[]; beats: number[] }; probability: number; sequence: (number | null) [] | undefined }[];
  };

  //Props
  let {
    sampleSchema,
    beat,
    metaSequence,
    channel,
    time,
  }: {
    sampleSchema: SampleSchema;
    beat: number;
    metaSequence: number;
    channel: Tone.ToneAudioNode;
    time: number;
  } = $props();

  //State 
  let sequence = 0;
  let samples: Tone.Player[] = [];
  let gainNode: Tone.Gain;
  let beatRef = 0;
  let ready = false;
  let interjection: (number | null)[] | undefined;

  //Helper functions
  function randomValue(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
  function resolveRange(exact?: number, min?: number, max?: number, fallback = 1): number {
    if (exact !== undefined) return exact;
    if (min !== undefined && max !== undefined) return randomValue(min, max);
    return fallback;
  }

  const playlist = sampleSchema.metaSequences?.[metaSequence]?.sequence ?? [0];

  //Resolve sequences
  const resolvedSequences: ResolvedBeat[][] = sampleSchema.sequences.map((seq) =>
    seq.map((cell) => {
      if (typeof cell !== "number") return null;
      const type = cell;
      const t = sampleSchema.types[type];
      if (!t) return null;
      const probability = resolveRange(t.probability, t.probabilityMin, t.probabilityMax, 1);
      return {type, probability};
    })
  );

  //Setup
  async function setup(): Promise<void> {
    await Tone.loaded();
    gainNode = new Tone.Gain(1).connect(channel);
    samples = sampleSchema.samples.map((url) =>
      new Tone.Player({ url, loop: false, playbackRate: 1 }).connect(gainNode)
    );
    ready = true;
  }

  //Function
  async function play(time: number): Promise<void> {
    if (!ready) return;

    const seqList = sampleSchema.metaSequences[metaSequence]?.sequence ?? [0];
    const metaType = sampleSchema.metaSequences[metaSequence]?.type ?? "sequential";
    const currentSeqIndex = seqList[sequence % seqList.length]; //sequence is initialized in 0, which is the current sequence index
    const currentSeq = resolvedSequences[currentSeqIndex];

    beatRef = beat % currentSeq.length;

    //Advance between sequences, guided by the metaSequence pattern
    if (beatRef === 0 && beat !== 0) {
      if (metaType === "random") {
        sequence = Math.floor(Math.random() * seqList.length);
      } else if (metaType === "markovian" && sampleSchema.metaSequences[metaSequence].markovMatrix) {
        const markovMatrix = sampleSchema.metaSequences[metaSequence].markovMatrix!;
        const probabilities = markovMatrix[sequence % markovMatrix.length];
        const total = probabilities.reduce((sum, p) => sum + p, 0);
        let r = Math.random() * total;
        for (let i = 0; i < probabilities.length; i++) {
          r -= probabilities[i];
          if (r <= 0) {
            sequence = i;
            break;
          }
        }
      } else {
        sequence = (sequence + 1) % seqList.length;
      }
    }

    //console.log(`Current Sequence Index: ${currentSeqIndex}, Beat Ref: ${beatRef}`);

    //Check for interjections
    if (sampleSchema.interjections && (!interjection || interjection.length === 0)) {
      //console.log(`Checked!`);
      for (const interjectionDef of sampleSchema.interjections) {
        if (
          interjectionDef.when.sequences.includes(currentSeqIndex) &&
          interjectionDef.when.beats.includes(beatRef) &&
          Math.random() < interjectionDef.probability
        ) {
          console.log(`Checked!`);
          interjection = interjectionDef.sequence ? [...interjectionDef.sequence] : [];
          break;
        }
      }
    }

    let typeArray: SampleType | undefined;

    if (interjection && interjection.length > 0) {
      console.log(`Interjection triggered!`, interjection);
      if (interjection[0] === null) {
        interjection.shift();
        return;
      }
      typeArray = sampleSchema.types[interjection[0]];
      interjection.shift();
    } else {
      interjection = undefined;
      const currentBeat = currentSeq[beatRef];
      if (!currentBeat) return;
      if (Math.random() >= currentBeat.probability) return;
      typeArray = sampleSchema.types[currentBeat.type];
    }

    if (!typeArray) {
      console.warn(`Invalid type beat`);
      return;
    }
    //Fetch the player of samples, based on the type of current bet
    const player = samples[typeArray.sample]; 
    if (!player || !player.loaded) return;

    const gain         = resolveRange(typeArray.gain, typeArray.gainMin, typeArray.gainMax, 1);
    const offset       = resolveRange(typeArray.offset, typeArray.offsetMin, typeArray.offsetMax, 0);
    const playbackRate = resolveRange(typeArray.playbackRate, typeArray.playbackRateMin, typeArray.playbackRateMax, 1);
    const duration     = resolveRange(typeArray.duration, typeArray.durationMin, typeArray.durationMax, player.buffer.duration - offset);
    const reversed     = typeArray.reversed !== undefined && Math.random() < typeArray.reversed;

    gainNode.gain.cancelScheduledValues(time);
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(gain, time + 0.005);
    gainNode.gain.setValueAtTime(gain, time + duration - 0.005);
    gainNode.gain.linearRampToValueAtTime(0, time + duration);

    player.playbackRate = playbackRate;
    player.reverse = reversed;
    player.stop(time);
    player.start(time, offset, duration);
  }

  //Updating states
  onMount(() => {
    setup();
  });

  $effect(() => {
    //console.log(`Beat: ${beat}, Time: ${time}`);
    play(time);
  });
</script>