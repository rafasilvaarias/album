<script lang="ts">
  import { onMount } from "svelte";
  import * as Tone from "tone";
  import { Draw } from "tone";
  import { mulberry32 } from "$lib/assets/mulberry32";

  type Sample = {
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
  };

  type Sequence = (Sample | null | Sequence)[];

  // Props

  let {
    sampleSchema,
    beat,
    beatDuration,
    metaSequenceIndex,
    channel,
    time,
    seed,
    message = $bindable([""]),
  }: {
    sampleSchema: any;
    beat: number;
    metaSequenceIndex: number;
    channel: Tone.ToneAudioNode;
    time: number;
    beatDuration: number;
    seed: number;
    message: any[];
  } = $props();

  // State

  let samples: Tone.Player[] = [];
  let gainNode: Tone.Gain;

  let sequenceIndex = 0;
  let beatIndex: number = beat;
  let beatOfQueue: number = 0;

  let ready = false;

  let sequences: any;
  let interjections: any;

  let queue: { sample: Sample; time: number; duration: number }[] = [];

  // Helper functions

  const random = mulberry32(seed);

  function randomInRange(min: number, max: number): number {
    return random() * (max - min) + min;
  }

  function resolveRange(param?: number, paramMin?: number, paramMax?: number): number | undefined {
    if (param !== undefined) return param;
    if (paramMin !== undefined && paramMax !== undefined) return randomInRange(paramMin, paramMax);
    return undefined;
  }

  function pickOption(options: number[] | number | undefined): number | undefined {
    if (Array.isArray(options)) {
      if (options.length === 0) return undefined;
      return options[Math.floor(random() * options.length)];
    }
    return options;
  }

  function setSequence(sequence: any[]): Sequence {
    return sequence.map((steps: any) => {
      if (steps === null) return null;
      if (Array.isArray(steps)) return setSequence(steps);

      const unresolvedSample = typeof steps === "number" ? sampleSchema.types[steps] : steps;
      if (!unresolvedSample) return null;

      return {
        name: unresolvedSample.name,
        sample: unresolvedSample.sample,
        probability: pickOption(unresolvedSample.probability),
        probabilityMin: unresolvedSample.probabilityMin,
        probabilityMax: unresolvedSample.probabilityMax,
        gain: pickOption(unresolvedSample.gain),
        gainMin: unresolvedSample.gainMin,
        gainMax: unresolvedSample.gainMax,
        offset: pickOption(unresolvedSample.offset),
        offsetMin: unresolvedSample.offsetMin,
        offsetMax: unresolvedSample.offsetMax,
        duration: pickOption(unresolvedSample.duration),
        durationMin: unresolvedSample.durationMin,
        durationMax: unresolvedSample.durationMax,
      } as Sample;
    });
  }

  function addSequenceToQueue(
    sequence: Sequence,
    time: number,
    duration: number,
    sequenceIndex?: number,
    beatIndex?: number,
    isInterjection = false
  ): void {
    const stepDuration = duration / sequence.length;
    let i = 0;

    while (i < sequence.length) {
      const cell = sequence[i];
      const cellTime = time + i * stepDuration;
      let interjected = false;

      if (!isInterjection && interjections && sequenceIndex !== undefined && beatIndex !== undefined) {
        for (const interjection of interjections) {
          const { when } = interjection;

          if (
            when.sequences.includes(sequenceIndex) &&
            when.beats.includes(beatIndex + i) &&
            interjection.sequence &&
            random() < interjection.probability
          ) {
            addSequenceToQueue(
              interjection.sequence,
              cellTime,
              stepDuration * interjection.sequence.length,
              sequenceIndex,
              beatIndex + i,
              true
            );
            i += interjection.sequence.length;
            interjected = true;
            break;
          }
        }
      }

      if (interjected) continue;
      if (cell === null) { i++; continue; }

      if (Array.isArray(cell)) {
        addSequenceToQueue(cell, cellTime, stepDuration, undefined, undefined, isInterjection);
      } else {
        const p = resolveRange(cell.probability, cell.probabilityMin, cell.probabilityMax);

        if (p === undefined || random() <= p) {
          const { probability, probabilityMin, probabilityMax, ...playbackSample } = cell;
          queue.push({ sample: playbackSample, time: cellTime, duration: stepDuration });
        }
      }

      i++;
    }
  }

  function scheduleQueue(
    queue: { sample: Sample; time: number; duration: number }[],
    offset: number = 0,
    sequenceEnd: number
  ) {
    for (let i = 0; i < queue.length; i++) {
      const { sample, time, duration } = queue[i];
      const player = samples[sample.sample];

      if (!player || !player.loaded) continue;

      const startTime = offset + time;
      const timeToNext = i + 1 < queue.length ? queue[i + 1].time - time : Infinity;
      const timeToEnd = sequenceEnd - time;

      const dur = Math.min((resolveRange(sample.duration, sample.durationMin, sample.durationMax) ?? duration) * beatDuration, timeToNext, timeToEnd);
      const gain = resolveRange(sample.gain, sample.gainMin, sample.gainMax) ?? 1;
      const sampleOffset = resolveRange(sample.offset, sample.offsetMin, sample.offsetMax) ?? 0;

      player.stop(startTime);
      player.start(startTime, sampleOffset, dur);

      Draw.schedule(() => { onBeat(); }, startTime);

      const ramp = 0.005;
      gainNode.gain.cancelScheduledValues(startTime);
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(gain, startTime + ramp);
      gainNode.gain.setValueAtTime(gain, startTime + dur - ramp - 0.005);
      gainNode.gain.linearRampToValueAtTime(0, startTime + dur - 0.005);
    }

    return [];
  }

  function updateBeat(time: number) {

    console.log("updatingBeat");
    beatIndex++;

    if (!ready) return;

    if (beatIndex < 0) {
      console.log("beat index out of bounds");
      beatIndex++;
      return;
    }

    const isSequenceEnd = beatIndex === sequences[sequenceIndex].length;

    if (isSequenceEnd) {
      beatIndex = 0;
      beatOfQueue = 0;

      const metaSeq = sampleSchema.metaSequences[metaSequenceIndex];
      const metaSequence = metaSeq?.sequence ?? [0];
      const metaSequenceType = metaSeq?.type ?? "sequential";

      if (metaSequenceType === "random") {
        sequenceIndex = metaSequence[Math.floor(random() * metaSequence.length)];
      } else if (metaSequenceType === "markovian" && metaSeq.markovMatrix) {
        const probabilities = metaSeq.markovMatrix[sequenceIndex % metaSeq.markovMatrix.length];
        const total = probabilities.reduce((sum: any, p: any) => sum + p, 0);
        let r = random() * total;

        for (let i = 0; i < probabilities.length; i++) {
          r -= probabilities[i];
          if (r <= 0) { sequenceIndex = metaSequence[i]; break; }
        }
      } else if (metaSequenceType === "sequential") {
        sequenceIndex = metaSequence[(sequenceIndex + 1) % metaSequence.length];
      } else {
        console.warn("unknown metaSequenceType:", metaSequenceType);
      }

      
    }

    if (beatIndex === 0) {
      const seqDuration = beatDuration * sequences[sequenceIndex].length;
      addSequenceToQueue(sequences[sequenceIndex], time, seqDuration, sequenceIndex, 0, false);
      updateMessage({ metaSequenceIndex, sequenceIndex, queue, beatOfQueue });
      queue = scheduleQueue(queue, undefined, seqDuration + time);
    }

    
  }

  function onBeat() {
    beatOfQueue++;
    updateMessage({ beatOfQueue });
  }

  function updateMessage(params: {
    metaSequenceIndex?: number;
    sequenceIndex?: number;
    queue?: { sample: Sample; time: number; duration: number }[];
    beatOfQueue?: number;
  }) {
    const { metaSequenceIndex, sequenceIndex, queue, beatOfQueue } = params;
    if (metaSequenceIndex !== undefined) message[0] = sampleSchema.metaSequences[metaSequenceIndex]?.sequence ?? [0];
    if (sequenceIndex !== undefined) message[1] = sequenceIndex;
    if (queue !== undefined) message[2] = queue.map(q => q.sample.name);
    if (beatOfQueue !== undefined) message[3] = beatOfQueue;
  }

  onMount(async () => {
    await Tone.loaded();

    gainNode = new Tone.Gain(1).connect(channel);

    samples = await Promise.all(
      sampleSchema.samples.map(
        (url: string) =>
          new Promise<Tone.Player>((resolve) => {
            const player = new Tone.Player(url, () => resolve(player)).connect(gainNode);
          })
      )
    );

    sequences = Array.isArray(sampleSchema.sequences)
      ? sampleSchema.sequences.map((seq: any) => setSequence(seq))
      : [];

    interjections = Array.isArray(sampleSchema.interjections)
      ? sampleSchema.interjections.map((interjection: any) => ({
          ...interjection,
          sequence: interjection.sequence ? setSequence(interjection.sequence) : undefined,
        }))
      : undefined;

    ready = true;
  });

  $effect(() => {
    time = time;
    if (!ready) return;
    updateBeat(time);
  });
</script>