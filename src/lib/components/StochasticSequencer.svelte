<script lang="ts">
  import { onMount, untrack } from "svelte";
  import * as Tone from "tone";
  import { Draw } from "tone";
  import type { Rng } from "$lib/engine/rng";
  import type { TrackMessage } from "$lib/engine/types";

  type Sample = {
    name: string;
    sample: number;
    probability?: number; probabilityMin?: number; probabilityMax?: number;
    gain?: number;        gainMin?: number;        gainMax?: number;
    delay?: number;       delayMin?: number;       delayMax?: number;
    offset?: number;      offsetMin?: number;      offsetMax?: number;
    duration?: number;    durationMin?: number;    durationMax?: number;
    attack?: number;      attackMin?: number;      attackMax?: number;
    decay?: number;       decayMin?: number;       decayMax?: number;
  };
  type Sequence = (Sample | null | Sequence)[];
  type QueueItem = { sample: Sample; time: number; duration: number };

  // order matters: it is the order rng is drawn in (same as before)
  const FIELDS = ["probability", "gain", "delay", "offset", "duration", "attack", "decay"] as const;

  let {
    sampleSchema,
    beatDuration,
    metaSequenceIndex,
    channel,
    time,
    rng,
    message = $bindable<TrackMessage>([[], 1000, [], 1000]),
    reset = $bindable(0),
    halt = $bindable(0),
  }: {
    sampleSchema: any;   // already mutated by the engine (a private copy)
    beatDuration: number;
    metaSequenceIndex: number;
    channel: Tone.ToneAudioNode;
    time: number;
    rng: Rng;            // the piece's shared random chain
    message: TrackMessage;
    reset: number;
    halt: number;
  } = $props();

  let samples: Tone.Player[] = [];
  let gainNode: Tone.Gain | undefined;

  let sequenceIndex = 0;   // position within the metaSequence
  let beatIndex = -1;      // beat within the current sequence
  let beatOfQueue = 0;

  let ready = false;
  let disposed = false;
  let sequences: any;
  let interjections: any;
  let queue: QueueItem[] = [];

  function resolveRange(param?: number, min?: number, max?: number): number | undefined {
    if (param !== undefined) return param;
    if (min !== undefined && max !== undefined) return rng.range(min, max);
    return undefined;
  }

  function pickOption(options: number[] | number | undefined): number | undefined {
    if (Array.isArray(options)) return options.length === 0 ? undefined : rng.pick(options);
    return options;
  }

  function setSequence(sequence: any[]): Sequence {
    return sequence.map((step: any) => {
      if (step === null) return null;
      if (Array.isArray(step)) return setSequence(step);

      const src = typeof step === "number" ? sampleSchema.types[step] : step;
      if (!src) return null;

      const out: any = { name: src.name, sample: src.sample };
      for (const f of FIELDS) {
        out[f] = pickOption(src[f]);
        out[`${f}Min`] = src[`${f}Min`];
        out[`${f}Max`] = src[`${f}Max`];
      }
      return out as Sample;
    });
  }

  function currentSequence(): any[] {
    const metaSeq = sampleSchema.metaSequences[metaSequenceIndex];
    const metaSequence = metaSeq?.sequence ?? [0];
    return sequences[metaSequence[sequenceIndex]];
  }

  function addSequenceToQueue(
    sequence: Sequence,
    at: number,
    duration: number,
    seqRef?: number,
    beatIdx?: number,
    isInterjection = false
  ): void {
    const stepDuration = duration / sequence.length;
    let i = 0;

    while (i < sequence.length) {
      const cell = sequence[i];
      const cellTime = at + i * stepDuration;
      let interjected = false;

      if (!isInterjection && interjections && seqRef !== undefined && beatIdx !== undefined) {
        for (const interjection of interjections) {
          const { when } = interjection;
          if (
            when.sequences.includes(seqRef) &&
            when.beats.includes(beatIdx + i) &&
            interjection.sequence &&
            rng() < interjection.probability
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
      if (cell === null || cell === undefined) { i++; continue; }

      if (Array.isArray(cell)) {
        addSequenceToQueue(cell, cellTime, stepDuration, undefined, undefined, isInterjection);
      } else {
        const p = resolveRange(cell.probability, cell.probabilityMin, cell.probabilityMax);
        if (p === undefined || rng() <= p) {
          const { probability, probabilityMin, probabilityMax, ...playbackSample } = cell;
          queue.push({ sample: playbackSample, time: cellTime, duration: stepDuration });
        }
      }
      i++;
    }
  }

  function delayOf(s: Sample) {
    return (resolveRange(s.delay, s.delayMin, s.delayMax) ?? 0) * beatDuration;
  }

  function scheduleQueue(q: QueueItem[], at: number, sequenceEnd: number) {
    samples.forEach((p) => p.stop(at));

    for (let i = 0; i < q.length; i++) {
      const { sample, time: t, duration } = q[i];
      const player = samples[sample.sample];
      if (!player || !player.loaded) continue;

      const delay = delayOf(sample);
      const startTime = t + delay;
      const nextDelay = i + 1 < q.length ? delayOf(q[i + 1].sample) : 0;
      const timeToNext = i + 1 < q.length ? q[i + 1].time + nextDelay - t - delay : Infinity;
      const timeToEnd = sequenceEnd - t;

      // explicit duration is in beats; fallback is the step length (already in seconds)
      const explicit = resolveRange(sample.duration, sample.durationMin, sample.durationMax);
      const wanted = explicit !== undefined ? explicit * beatDuration : duration;
      const dur = Math.min(wanted, timeToNext, timeToEnd);

      const gain = resolveRange(sample.gain, sample.gainMin, sample.gainMax) ?? 1;
      const sampleOffset = (resolveRange(sample.offset, sample.offsetMin, sample.offsetMax) ?? 0) * beatDuration;

      player.start(startTime, sampleOffset, dur);
      Draw.schedule(() => onBeat(), startTime);

      let attack = resolveRange(sample.attack, sample.attackMin, sample.attackMax) ?? 0.001;
      attack = Math.min(attack, dur - 0.005);
      let decay = resolveRange(sample.decay, sample.decayMin, sample.decayMax) ?? 0.001;
      decay = Math.min(decay, dur - attack - 0.005);

      const g = gainNode!.gain;
      g.cancelScheduledValues(startTime);
      if (attack === 0) {
        g.setValueAtTime(gain, startTime);
      } else {
        g.setValueAtTime(0, startTime);
        g.linearRampToValueAtTime(gain, startTime + attack);
      }
      g.setValueAtTime(gain, startTime + dur - decay - 0.005);
      g.linearRampToValueAtTime(0, startTime + dur - 0.005);
    }
  }

  function updateBeat(now: number) {
    if (!ready) return;
    beatIndex++;

    const metaSeq = sampleSchema.metaSequences[metaSequenceIndex];
    const metaSequence = metaSeq?.sequence ?? [0];
    const metaSequenceType = metaSeq?.type ?? "sequential";
    const seq = currentSequence();

    if (beatIndex === seq.length) {
      beatIndex = 0;
      beatOfQueue = 0;

      if (metaSequenceType === "random") {
        sequenceIndex = Math.floor(rng() * metaSequence.length);
      } else if (metaSequenceType === "markovian" && metaSeq.markovMatrix) {
        const probabilities = metaSeq.markovMatrix[sequenceIndex % metaSeq.markovMatrix.length];
        const total = probabilities.reduce((sum: number, p: number) => sum + p, 0);
        let r = rng() * total;
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
      addSequenceToQueue(nextSeq, now, seqDuration, metaSequence[sequenceIndex], 0, false);
      updateMessage({ metaSequenceIndex, sequenceIndex, queue, beatOfQueue });
      scheduleQueue(queue, now, now + seqDuration);
      queue = [];
    }
  }

  function onBeat() {
    beatOfQueue++;
    updateMessage({ beatOfQueue });
  }

  function updateMessage(p: {
    metaSequenceIndex?: number;
    sequenceIndex?: number;
    queue?: QueueItem[];
    beatOfQueue?: number;
  }) {
    if (p.metaSequenceIndex !== undefined) message[0] = sampleSchema.metaSequences[p.metaSequenceIndex]?.sequence ?? [0];
    if (p.sequenceIndex !== undefined) message[1] = p.sequenceIndex;
    if (p.queue !== undefined) message[2] = p.queue.map((q) => q.sample.name);
    if (p.beatOfQueue !== undefined) message[3] = p.beatOfQueue;
  }

  function hardStop() {
    samples.forEach((p) => p.stop());
    queue = [];
    if (gainNode) {
      gainNode.gain.cancelScheduledValues(0);
      gainNode.gain.value = 0;
    }
  }

  onMount(() => {
    // Resolved SYNCHRONOUSLY on mount so rng draws happen in a fixed (mount) order.
    // (Before, this ran after awaits, so the order depended on load times.)
    sequences = Array.isArray(sampleSchema.sequences)
      ? sampleSchema.sequences.map((seq: any) => setSequence(seq))
      : [];

    interjections = Array.isArray(sampleSchema.interjections)
      ? sampleSchema.interjections.map((interjection: any) => ({
          ...interjection,
          sequence: interjection.sequence ? setSequence(interjection.sequence) : undefined,
        }))
      : undefined;

    sequenceIndex = 0;

    (async () => {
      await Tone.loaded();
      if (disposed) return;
      gainNode = new Tone.Gain(1).connect(channel);
      samples = await Promise.all(
        sampleSchema.samples.map(
          (url: string) =>
            new Promise<Tone.Player>((resolve) => {
              const player = new Tone.Player(sampleSchema.samplesFolder + url, () => resolve(player)).connect(gainNode!);
            })
        )
      );
      ready = true;
    })();

    return () => {
      disposed = true;
      ready = false;
      samples.forEach((p) => p.dispose());
      gainNode?.dispose();
    };
  });

  // declaration order matters: reset runs before the beat effect when both change together
  $effect(() => {
    if (reset === 0) return;
    untrack(() => {
      beatIndex = -1;
      sequenceIndex = 0;
      queue = [];
    });
  });

  $effect(() => {
    if (halt === 0) return;
    untrack(hardStop);
  });

  $effect(() => {
    const t = time;
    if (!ready) return;
    untrack(() => updateBeat(t));
  });
</script>
