<script lang="ts">
  import { onMount } from "svelte";
  import * as Tone from "tone";

  // --- Types ---
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
    metaSequences: number[][];
  };

  // --- Props ---
  let {
    sampleSchema,
    beat,
    metaSequence,
    channel,
    time,
    onBeat,
  }: {
    sampleSchema: SampleSchema;
    beat: number;
    metaSequence: number;
    channel: Tone.ToneAudioNode;
    time: number;
    onBeat: (info: { metaSequence: number; sequence: number; sample: string }) => void;
  } = $props();

  // --- State ---   
  let sequence = 0;
  let samples: Tone.Player[] = [];
  let gainNode: Tone.Gain;
  let beatRef = 0;
  let ready = false;

  // --- Helpers ---
  function randomValue(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
  function resolveRange(
    exact?: number,
    min?: number,
    max?: number,
    fallback = 1
  ): number {
    if (exact !== undefined) return exact;
    if (min !== undefined && max !== undefined) return randomValue(min, max);
    return fallback;
  }

  const playlist = sampleSchema.metaSequences?.[metaSequence] ?? [0];

  // --- Init: resolve probabilities ---
  const resolvedSequences: ResolvedBeat[][] = sampleSchema.sequences.map((seq) =>
    seq.map((cell) => {
      if (!cell || typeof cell !== "number") return null;
      const type = cell - 1;
      const t = sampleSchema.types[type];
      if (!t) return null;
      const probability = resolveRange(t.probability, t.probabilityMin, t.probabilityMax, 1);
      return { type, probability };
    })
  );

  // --- Setup ---
  async function setup(): Promise<void> {
    await Tone.loaded();
    gainNode = new Tone.Gain(1).connect(channel);
    samples = sampleSchema.samples.map((url) =>
      new Tone.Player({ url, loop: false, playbackRate: 1 }).connect(gainNode)
    );
    ready = true;
  }

  // --- Play ---
  async function play(time: number): Promise<void> {
    if (!ready) return;

    const seqList = sampleSchema.metaSequences[metaSequence];
    const currentSeqIndex = seqList[sequence % seqList.length];
    const currentSeq = resolvedSequences[currentSeqIndex];

    beatRef = beat % currentSeq.length;

    if (beatRef === 0 && beat !== 0) {
      sequence = (sequence + 1) % seqList.length;
    }

    const currentBeat = currentSeq[beatRef];
    if (!currentBeat) return;
    if (Math.random() >= currentBeat.probability) return;
    const typeArray = sampleSchema.types[currentBeat.type];
    if (!typeArray) return;
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

    onBeat?.({
      metaSequence,
      sequence,
      sample: sampleSchema.types[currentBeat.type].name,
    });
  }

  // --- Lifecycle ---
  onMount(() => {
    setup();
  });

  $effect(() => {
    play(time);
  });
</script>