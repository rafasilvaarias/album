<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as Tone from "tone";
  import StochasticSequencer from "./StochasticSequencer.svelte";
  import kickSchema from "./kick.json";

  // --- State ---
  let playing = $state(false);
  let beat = $state(-1);
  let time = $state(0);
  let channel: Tone.ToneAudioNode;
  let sequencerReady = $state(false);
  let seed = Math.round(Math.random()*100000);
  //let seed = 12345;

  let bpm = $state(87);
  let subdivision = $state(2);

  let message = $state<[number[], number, string[], number]>([[], 0, [], 0]);

  // --- Setup on mount ---
  onMount(async () => {
    if (typeof window === "undefined") return;
    channel = new Tone.Gain(0.5).toDestination();
    sequencerReady = true;
  });

  onDestroy(() => {
    if (typeof window === "undefined") return; // SSR guard
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

    // Schedule a 16th-note repeating callback
    Tone.Transport.scheduleRepeat((t) => {
      time = t;
      beat += 1;
      //console.log("Beat:", beat, "Time:", time);
    }, (60 / bpm) / subdivision);

    Tone.Transport.start();
    playing = true;
  }
</script>

{#if sequencerReady}
  

  <StochasticSequencer
    sampleSchema={kickSchema}
    {beat}
    metaSequenceIndex={1}
    {channel}
    {time}
    beatDuration={60 / bpm / subdivision}
    seed={seed}
    bind:message={message}
  />
{/if}

<div class="message">
  <p >{beat % 8}</p>
  <div class="messageDiv">
    <div>
      {#each message[0] as sequenceIndex, i}
        <p class={i === message[1] ? "pulsate" : ""}>{sequenceIndex}</p>
      {/each}
    </div>
    <div>
      {#each message[2] as beatNames, i}
        <p class={i+1 === message[3] ? "pulsate" : ""}>{beatNames}</p>
      {/each}
    </div>
  </div>
</div>

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

  .messageDiv > div > .pulsate {
    color: #fff;
    animation: pulsate 0.5s ease-out;
    border: 0.5px solid transparent;
  }

  .messageDiv{
    display:flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem;
    margin: 2rem;
    
  }

  .messageDiv > div {
    display:flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 0px;
    padding: 0px;
   
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

  .dididid{
     border: 0.3px solid #ccc;
  }

  @keyframes pulsate {
    0%   { background-color: transparent; border: 0.5px solid #444;}
    100% { background-color: transparent; border: 0.5px solid transparent;}
  }

  .message {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    color: #0f0;
    font-family: "Courier New", monospace;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    text-align: center;
  }

  .pessage p {
    margin: 0.25rem 0;
  }
</style>