<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as Tone from "tone";
  import SampleSequencer from "./SampleSequencer.svelte";
  import kickSchema from "./kick.json";

  // --- State ---
  let playing = $state(false);
  let beat = $state(-1);
  let time = $state(0);
  let channel: Tone.ToneAudioNode;
  let sequencerReady = $state(false);

  let message = $state(Array(4).fill(""));

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
      beat = 0;
      playing = false;
      return;
    }

    await Tone.start();

    Tone.Transport.bpm.value = 87;
    beat = 0;

    // Schedule a 16th-note repeating callback
    Tone.Transport.scheduleRepeat((t) => {
      time = t;
      beat += 1;
      //console.log("Beat:", beat, "Time:", time);
    }, "16n");

    Tone.Transport.start();
    playing = true;
  }
</script>

{#if sequencerReady}
  

  <SampleSequencer
    sampleSchema={kickSchema}
    {beat}
    metaSequence={0}
    {channel}
    {time}
  />
{/if}

<div class="message">
  <p class="pulsate">{message[0]}</p>
  <p >{message[1]}</p>
  <p >{message[2]}</p>
  <p >{message[3]}</p>
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

  .pulsate {
    animation: pulsate 0.5s ease-out;
  }

  @keyframes pulsate {
    0%   { background-color: black; }
    100% { background-color: transparent; }
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