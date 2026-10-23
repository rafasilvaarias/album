<script lang="ts">
  import type { TrackRuntime } from "$lib/engine/types";
  let { runtime }: { runtime: Record<string, TrackRuntime> } = $props();
</script>

<div class="monitor">
  {#each Object.entries(runtime) as [name, track] (name)}
    <div class="row">
      <span class="name">{name}</span>
      <div class="cells first">
        {#each track.message[0] as sequenceIndex, j}
          <p class:pulsate={j === track.message[1]}>{sequenceIndex}</p>
        {/each}
      </div>
      <div class="cells second">
        {#each track.message[2] as beatName, j}
          <p class:pulsate={j + 1 === track.message[3]}>{beatName}</p>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .monitor {
    position: fixed;
    top: 1rem;
    left: 0;
    right: 0;
    font-family: "Courier New", monospace;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
  }
  .row { display: flex; align-items: center; margin-bottom: 0.25rem; }
  .name { color: #646464; width: 6rem; padding-left: 1rem; }
  .cells { display: flex; align-items: center; }
  .first { width: 22%; }
  .second { width: 60%; }
  .cells > p {
    color: #646464;
    transition: color ease-in-out 0.1s;
    width: 2.5rem;
    height: 2.5rem;
    margin: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    border: 0.5px solid transparent;
  }
  .cells > p.pulsate { color: #fff; animation: pulsate 0.5s ease-out; }
  @keyframes pulsate {
    0%   { border: 0.5px solid #444; }
    100% { border: 0.5px solid transparent; }
  }
</style>
