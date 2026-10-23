<script lang="ts" generics="T extends TracksMap">
  import { onMount, onDestroy } from "svelte";
  import StochasticSequencer from "./StochasticSequencer.svelte";
  import TrackMonitor from "./TrackMonitor.svelte";
  import { Player } from "$lib/engine/player.svelte";
  import type { PieceDef, TracksMap } from "$lib/engine/types";

  let { piece, seed }: { piece: PieceDef<T, any>; seed?: number } = $props();

  // seed priority: prop > ?seed=123 in the URL > random
  const urlSeed = Number(new URLSearchParams(location.search).get("seed"));
  // svelte-ignore state_referenced_locally
  const player = new Player(piece, seed ?? (urlSeed || Math.round(Math.random() * 100000)));

  onMount(() => player.init());
  onDestroy(() => player.destroy());
</script>

{#if player.ready}
  {#each player.names as name (name)}
    <StochasticSequencer
      sampleSchema={player.schemas[name]}
      rng={player.rng}
      beatDuration={player.beatTime}
      metaSequenceIndex={player.runtime[name].metaSequence}
      channel={player.channel(name)}
      time={player.time}
      bind:message={player.runtime[name].message}
      bind:reset={player.runtime[name].reset}
      bind:halt={player.runtime[name].halt}
    />
  {/each}
{/if}

<TrackMonitor runtime={player.runtime} />

<p class="status">seed {player.seed} · beat {player.beat} · resume @ {player.resumeBeat}</p>

<button class="play-btn" class:active={player.playing} onclick={() => player.toggle()}>
  {player.playing ? "■ stop" : "▶ play"}
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
  .status {
    position: fixed;
    bottom: 4.5rem;
    left: 0;
    right: 0;
    text-align: center;
    color: #888;
    font-size: 0.8rem;
    letter-spacing: 0.1em;
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
  .play-btn:hover { border-color: #fff; color: #fff; }
  .play-btn.active { border-color: #f00; color: #f00; }
</style>
