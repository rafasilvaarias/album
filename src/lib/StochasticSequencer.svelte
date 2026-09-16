<script lang="ts">
  import { onMount } from "svelte";
  import * as Tone from "tone";
  import { Draw } from "tone";
  import { mulberry32 } from "$lib/assets/mulberry32";

  const lastScheduled = new WeakMap<Tone.Player, number>();

  type Sample = {
    name: string;
    sample: number;
    probability?: number;
    probabilityMin?: number;
    probabilityMax?: number;
    gain?: number;
    gainMin?: number;
    gainMax?: number;
    delay?: number;
    delayMin?: number;
    delayMax?: number;
    offset?: number;
    offsetMin?: number;
    offsetMax?: number;
    duration?: number;
    durationMin?: number;
    durationMax?: number;
    attack? : number;
    attackMin? : number;
    attackMax? : number;
    decay? : number;
    decayMin? : number;
    decayMax? : number;
  };

  type Sequence = (Sample | null | Sequence)[];

  let {
    sampleSchema,
    extraMutations = [],
    beat,
    beatDuration,
    metaSequenceIndex,
    channel,
    time,
    seed,
    message = $bindable([""]),
    reset = $bindable(0),
  }: {
    sampleSchema: any;
    extraMutations?: any[];
    beat: number;
    metaSequenceIndex: number;
    channel: Tone.ToneAudioNode;
    time: number;
    beatDuration: number;
    seed: number;
    message: any[];
    reset: number;
  } = $props();

  let samples: Tone.Player[] = [];
  let gainNode: Tone.Gain;

  // sequenceIndex is now the position within metaSequence (0, 1, 2, ...)
  let sequenceIndex = 0;
  let beatIndex: number = beat;
  let beatOfQueue: number = 0;

  let ready = false;
  let sequences: any;
  let interjections: any;
  let queue: { sample: Sample; time: number; duration: number }[] = [];

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
        delay: pickOption(unresolvedSample.delay),
        delayMin: unresolvedSample.delayMin,
        delayMax: unresolvedSample.delayMax,
        offset: pickOption(unresolvedSample.offset),
        offsetMin: unresolvedSample.offsetMin,
        offsetMax: unresolvedSample.offsetMax,
        duration: pickOption(unresolvedSample.duration),
        durationMin: unresolvedSample.durationMin,
        durationMax: unresolvedSample.durationMax,
        attack: pickOption(unresolvedSample.attack),
        attackMin: unresolvedSample.attackMin,
        attackMax: unresolvedSample.attackMax,
        decay: pickOption(unresolvedSample.decay),
        decayMin: unresolvedSample.decayMin,
        decayMax: unresolvedSample.decayMax,
      } as Sample;
    });
  }

  // Helper: get the actual sequence array for the current sequenceIndex (metaSequence position)
  function currentSequence(): any[] {
    const metaSeq = sampleSchema.metaSequences[metaSequenceIndex];
    const metaSequence = metaSeq?.sequence ?? [0];
    return sequences[metaSequence[sequenceIndex]];
  }

  function addSequenceToQueue(
    sequence: Sequence,
    time: number,
    duration: number,
    seqRef?: number,
    beatIdx?: number,
    isInterjection = false
  ): void {
    const stepDuration = duration / sequence.length;
    let i = 0;

    while (i < sequence.length) {
      if (sequence[i] === undefined) {
          //console.log(sequence);
          //console.log(i);
      }
      const cell = sequence[i];
      const cellTime = time + i * stepDuration;
      let interjected = false;

      if (!isInterjection && interjections && seqRef !== undefined && beatIdx !== undefined) {
        for (const interjection of interjections) {
          const { when } = interjection;
          if (
            when.sequences.includes(seqRef) &&
            when.beats.includes(beatIdx + i) &&
            interjection.sequence &&
            random() < interjection.probability
          ) {
            addSequenceToQueue(
              interjection.sequence,
              cellTime,
              stepDuration * interjection.sequence.length,
              seqRef,
              beatIdx + i,
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

    samples.forEach(p => { p.stop(time); });

    for (let i = 0; i < queue.length; i++) {
      const { sample, time, duration } = queue[i];
      const player = samples[sample.sample];
      if (!player || !player.loaded) continue;

      const delay = (resolveRange(sample.delay, sample.delayMin, sample.delayMax) ?? 0) * beatDuration;
      const startTime = offset + time + delay;
      const nextDelay = i + 1 < queue.length 
        ? (resolveRange(queue[i+1].sample.delay, queue[i+1].sample.delayMin, queue[i+1].sample.delayMax) ?? 0) * beatDuration 
        : 0;
      const timeToNext = i + 1 < queue.length ? queue[i + 1].time + nextDelay - time - delay : Infinity;
      const timeToEnd = sequenceEnd - time;
      const dur = Math.min(
        (resolveRange(sample.duration, sample.durationMin, sample.durationMax) ?? duration) * beatDuration,
        timeToNext,
        timeToEnd
      );
      const gain = resolveRange(sample.gain, sample.gainMin, sample.gainMax) ?? 1;
      let sampleOffset = resolveRange(sample.offset, sample.offsetMin, sample.offsetMax) ?? 0;
      sampleOffset = sampleOffset * beatDuration;

      player.start(startTime, sampleOffset, dur);

      Draw.schedule(() => { onBeat(); }, startTime);

      let attack = resolveRange(sample.attack, sample.attackMin, sample.attackMax) ?? 0.001;
      attack = Math.min(attack, dur - 0.005);
      let decay = resolveRange(sample.decay, sample.decayMin, sample.decayMax) ?? 0.001;
      decay = Math.min(decay, dur - attack - 0.005);
      gainNode.gain.cancelScheduledValues(startTime);
      if (attack === 0) {
        gainNode.gain.setValueAtTime(gain, startTime);
      } else {
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(gain, startTime + attack);
      }
      gainNode.gain.setValueAtTime(gain, startTime + dur - decay - 0.005);
      gainNode.gain.linearRampToValueAtTime(0, startTime + dur - 0.005);
    }
    return [];
  }

  function updateBeat(time: number) {
    beatIndex++;
    if (!ready) return;
    if (beatIndex < 0) { beatIndex++; return; }

    const metaSeq = sampleSchema.metaSequences[metaSequenceIndex];
    const metaSequence = metaSeq?.sequence ?? [0];
    const metaSequenceType = metaSeq?.type ?? "sequential";
    const seq = currentSequence();

    const isSequenceEnd = beatIndex === seq.length;

    if (isSequenceEnd) {
      beatIndex = 0;
      beatOfQueue = 0;

      if (metaSequenceType === "random") {
        sequenceIndex = Math.floor(random() * metaSequence.length);
      } else if (metaSequenceType === "markovian" && metaSeq.markovMatrix) {
        const probabilities = metaSeq.markovMatrix[sequenceIndex % metaSeq.markovMatrix.length];
        const total = probabilities.reduce((sum: any, p: any) => sum + p, 0);
        let r = random() * total;
        for (let i = 0; i < probabilities.length; i++) {
          r -= probabilities[i];
          if (r <= 0) { sequenceIndex = i; break; }
        }
      } else if (metaSequenceType === "sequential") {
        sequenceIndex = (sequenceIndex + 1) % metaSequence.length;
      } else {
        console.warn("unknown metaSequenceType:", metaSequenceType);
      }
    }

    if (beatIndex === 0) {
      const nextSeq = currentSequence();
      const seqDuration = beatDuration * nextSeq.length;
      addSequenceToQueue(nextSeq, time, seqDuration, metaSequence[sequenceIndex], 0, false);
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

    const allMutations = [
      ...(sampleSchema.mutations ?? []),
      ...extraMutations,
    ];

    for (const mutation of allMutations) {
        if (random() > mutation.probability) continue;
        const path = mutation.where;
        //console.log(sampleSchema);
        let target: any = sampleSchema;
        for (let i = 0; i < path.length - 1; i++) {
          target = target[path[i]];
          if (target === undefined) break;
        }
        if (target === undefined) continue;
        const key = path[path.length - 1];
        if (mutation.type === "add") {
          target[key].push(mutation.injection);
        } else {
          target[key] = mutation.injection;
        }
    }

    await Tone.loaded();
    gainNode = new Tone.Gain(1).connect(channel);
    samples = await Promise.all(
      sampleSchema.samples.map(
        (url: string) =>
          new Promise<Tone.Player>((resolve) => {
            const player = new Tone.Player(sampleSchema.samplesFolder + url, () => resolve(player)).connect(gainNode);
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

    // sequenceIndex = 0 means position 0 in metaSequence
    //console.log(sequences);
    sequenceIndex = 0;
    ready = true;
  });

  $effect(() => {
    if (reset === 0) return;
    console.log("reseting");
    beatIndex = -1;
    sequenceIndex = 0;
    queue = [];
  });
 
  $effect(() => {
    time = time;
    if (!ready) return;
    updateBeat(time);
  });
</script>