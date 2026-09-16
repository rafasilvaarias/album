<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as Tone from "tone";

  import StochasticSequencer from "$lib/StochasticSequencer.svelte";
  import fieldRecSchema from "./fieldRecording.json";
  import clickSchema from "./click.json";

  import { positionToDb, mulberry32 } from "$lib/globalFunctions";
  import { EQ_RANGE, ISOLATOR_RANGE } from "$lib/globalVariables";

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

  type ParamName = 'gain' | 'pan' | 'low' | 'mid' | 'high' | 'reverb';

  //const seed = 1018;
  const seed = Math.round(Math.random() * 100000);
  console.log("Seed: ",seed);
  const random = mulberry32(seed);

  // --- State ---
  let playing = $state(false);
  let beat = $state(-1);
  let time = $state(0);
  let sequencerReady = $state(false);

  let bpm = $state(87);
  let subdivision = $state(2);
  let beatTime = (60 / bpm) / subdivision;

  let sequenceScheduling : {beat: number, track: keyof typeof tracks, seq: number}[] = [];
  let paramScheduling : {beat: number, track: keyof typeof tracks, param: ParamName, value: number, rampBeats?: number }[] = [];

  const defaultEQ = {low:0,mid:0,high:0};
  const defaultMessage : TrackMessage = [[], 1000, [], 1000];

  let masterEq: Tone.EQ3;

  function setSongStructure(){
  }
  
  function setTrackScheduling(){
    sequenceScheduling.push({beat: 0, track: 'fieldRecLeft', seq: 1});
    sequenceScheduling.push({beat: 0, track: 'fieldRecCentre', seq: 1});
    sequenceScheduling.push({beat: 0, track: 'fieldRecRight', seq: 1});
    sequenceScheduling.push({beat: 0, track: 'clickLeft', seq: 1});
    sequenceScheduling.push({beat: 0, track: 'clickCentre', seq: 1});
    sequenceScheduling.push({beat: 0, track: 'clickRight', seq: 1});
    sequenceScheduling.push({beat: 32, track: 'clickLeft', seq: 2});
    sequenceScheduling.push({beat: 32, track: 'clickCentre', seq: 2});
    sequenceScheduling.push({beat: 32, track: 'clickRight', seq: 2});
  }
  
  function buildExtraMutations() {

    let cTimes : number[][] = [[],[],[]];

    
    const fieldRec = (() => {
      let extraMutations : any[][] = [[],[],[]];

      const sampleOrder = [0,1,2];
      for (let i = sampleOrder.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [sampleOrder[i], sampleOrder[j]] = [sampleOrder[j], sampleOrder[i]];
      }

      extraMutations.forEach((mutations, index) => {
        const sampleNumber = sampleOrder[index] + 1;
        const sampleName = "fieldRecording" + sampleNumber + ".wav";
        mutations.push(
          {
            "type": "change",
            "where": ["samples",0],
            "probability": 1,
            "injection": sampleName
          },
        );
      });

      extraMutations.forEach((mutations, index) => {

        //const triggers = 2 + Math.floor(random() * 10);
        const triggers = 12;
        let triggerTimes = [];
        triggerTimes.push(0);
        for (let i = 1; i < triggers; i++) {
          let time = Math.floor(random() * 31) + 1;
          triggerTimes.push(time);
        }
        triggerTimes.sort((a,b) => a-b);
        cTimes[index] = triggerTimes;

        let delayTimes = [];
        for (let i = 0; i < triggers; i++) {
          let delay = triggerTimes[i] - (i * beatTime / triggers);
          delayTimes.push(delay);
        }

        let sequence : any = [[],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
        for (let i = 0; i < triggers; i++) {
          sequence[0].push({
            "name": ".",
            "sample": 0,
            "gain": 1,
            "delay": delayTimes[i],
            "offsetMin": 0, "offsetMax": 128,
            "duration": 32,
            "probability": 1,
            "attack": 0,
            "decay": 1
          });
        }

        mutations.push(
          {
            "type": "change",
            "where": ["sequences",1],
            "probability": 1,
            "injection": sequence
          },
        );
      });

      return extraMutations;
    })();

    let totalNumberOfClicks = cTimes[0].length + cTimes[1].length + cTimes[2].length;

    const click = (() => {
      let extraMutations : any[][] = [[],[],[]];

      let clickTimes : number[] = [];
      for (let i = 0; i < totalNumberOfClicks; i++) {
        let time : number;
        do {
          time = Math.floor(random() * 32 * 2) / 2; // quarter beat resolution
          console.log("inLoopClickTimes");
        } while (clickTimes.includes(time));
        clickTimes.push(time);
      }

      let transition = (Math.floor(random() * 8) + 4);

      extraMutations.forEach((mutations, index) => {

        let startDelayTimes = [];
        for (let i = 0; i < cTimes[index].length; i++) {
          let delay = cTimes[index][i] - (i * beatTime / cTimes[index].length);
          startDelayTimes.push(delay);
        }

        let sequence : any = [[],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
        for (let i = 0; i < cTimes[index].length; i++) {
          sequence[0].push({
            "name": ".",
            "sample": 0,
            "gain": 1,
            "delay": startDelayTimes[i],
            "offset": [0,0.5,1,1.5,2,2.5,3,3.5,4,4.5],
            "duration": 0.1,
            "probability": 1,
            "attack": 0
          });
        }

        mutations.push(
          {
            "type": "change",
            "where": ["sequences",1],
            "probability": 1,
            "injection": sequence
          },
        );

        let endDelayTimes : number[] = [];
        for (let i = 0; i < cTimes[index].length; i++) {
          let time: number;
          do {
            time = clickTimes[Math.floor(random() * clickTimes.length)];
          } while (endDelayTimes.slice(0, i).includes(time));
          endDelayTimes[i] = time;
        }
        endDelayTimes.sort((a,b) => a-b);
        for (let i = 0; i < cTimes[index].length; i++) {
          endDelayTimes[i] = endDelayTimes[i] - (i * beatTime / cTimes[index].length);
        }

        function interpolateValues (start: number, end: number, weight: number) {
          return start + (end - start) * weight * weight;
        }

        let middleDelayTimes = [];
        for (let i = 0; i < transition; i++) {
          let weight = (i + 1) / (transition + 1);
          for (let a = 0; a < startDelayTimes.length; a++) {
            middleDelayTimes[a] = interpolateValues(startDelayTimes[a], endDelayTimes[0], weight);
          }
          let sequence : any = [[],null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
          for (let a = 0; a < middleDelayTimes.length; a++) {
            sequence[0].push({
              "name": ".",
              "sample": 0,
              "gain": 1,
              "delay": middleDelayTimes[a],
              "offset": [0,0.5,1,1.5,2,2.5,3,3.5,4,4.5],
              "duration": 0.1,
              "probability": 1,
              "attack": 0
            });
          }

          mutations.push(
            {
              "type": "add",
              "where": ["sequences"],
              "probability": 1,
              "injection": sequence
            },
          );
        }

        let metaSequence : number[] = [];
        for (let i = 0; i < transition; i++) {
          metaSequence.push(i + 2);
        }
        console.log("metaSequence: ", metaSequence);
        mutations.push(
          {
            "type": "change",
            "where": ["metaSequences",2],
            "probability": 1,
            "injection": {
              type: "sequential",
              sequence: metaSequence
            }
          },
        );
      });

      return extraMutations;
    })();

    return {fieldRec, click};
  }

  const { fieldRec, click } = buildExtraMutations();
  const [fRLEMutations, fRCEMutations, fRRMutations] = fieldRec;
  const [clickLEMutations, clickCEMutations, clickRMutations] = click;

  function buildAudioGraph() {
    masterEq = new Tone.EQ3({
      low: 0,
      mid: 0,
      high: 0,
      lowFrequency: ISOLATOR_RANGE.crossOver[0],
      highFrequency: ISOLATOR_RANGE.crossOver[1],
    }).toDestination();

    const reverb = new Tone.Reverb({ decay: 0.8, wet: 1 }).connect(masterEq);
    const reverbReturn = new Tone.Gain(0.2).connect(reverb);

    (Object.values(tracks) as Track[]).forEach((t) => {
      t.channel = new Tone.Gain(t.gain);
      let node: Tone.ToneAudioNode = t.channel;

      if (t.eq) {
        t.eq3 = new Tone.EQ3({
          low: t.eq.low,
          mid: t.eq.mid,
          high: t.eq.high,
          lowFrequency: t.eq.lowFrequency ?? EQ_RANGE.crossOver[0],
          highFrequency: t.eq.highFrequency ?? EQ_RANGE.crossOver[1],
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
        t.channel.connect(t.reverbSend);
      }

      node.connect(masterEq);
    });
  }

  // #region Tracks ------------------------------------------------------------------------------------------------------------------------------------

  const tracks = $state<Record<string, Track>>({
    fieldRecLeft:    { schema: fieldRecSchema,       gain: 0.25, pan:-0.70, eq: defaultEQ,   reverb: 0.2,  metaSequence: 0, extraMutations: fRLEMutations,       message: defaultMessage, reset: 0 },
    fieldRecCentre:  { schema: fieldRecSchema,       gain: 0.30, pan: null, eq: defaultEQ,   reverb: 0.2,  metaSequence: 0, extraMutations: fRCEMutations,       message: defaultMessage, reset: 0 },
    fieldRecRight:   { schema: fieldRecSchema,       gain: 0.25, pan: 0.70, eq: defaultEQ,   reverb: 0.2,  metaSequence: 0, extraMutations: fRRMutations,        message: defaultMessage, reset: 0 },
    clickLeft:       { schema: clickSchema,          gain: 1.30, pan:-0.70, eq: defaultEQ,   reverb: 0.2,  metaSequence: 0, extraMutations: clickLEMutations,    message: defaultMessage, reset: 0 },
    clickCentre:     { schema: clickSchema,          gain: 1.30, pan: null, eq: defaultEQ,   reverb: 0.2,  metaSequence: 0, extraMutations: clickCEMutations,    message: defaultMessage, reset: 0 },
    clickRight:      { schema: clickSchema,          gain: 1.30, pan: 0.70, eq: defaultEQ,   reverb: 0.2,  metaSequence: 0, extraMutations: clickRMutations,     message: defaultMessage, reset: 0 },
  });

  // #endregion

  function setSeq(track: keyof typeof tracks, seq: number) {
    tracks[track].metaSequence = seq;
    tracks[track].reset++;
  }

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

    buildAudioGraph();
    setSongStructure();
    setTrackScheduling();

    sequencerReady = true;
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
      beat++;
      time = t;

      const paramEvents = paramScheduling.filter(e => e.beat === beat);
      for (const e of paramEvents) {
          setParam(
              e.track,
              e.param,
              e.value,
              e.rampBeats ?? 0
          );
      }

      const seqEvents = sequenceScheduling.filter(e => e.beat === beat);
      for (const e of seqEvents) {
          setSeq(e.track, e.seq);
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