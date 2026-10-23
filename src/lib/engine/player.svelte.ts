import * as Tone from 'tone';
import { buildPiece } from './build';
import { buildAudioGraph, resetTrackParams, setIsolator, setTrackParam, type AudioGraph } from './audioGraph';
import type { PieceDef, TrackRuntime, TracksMap } from './types';

const emptyRuntime = (): TrackRuntime => ({
  metaSequence: 0,
  reset: 0,
  halt: 0,
  message: [[], 1000, [], 1000], // fresh array per track (the old code shared one)
});

export class Player<T extends TracksMap> {
  // reactive
  playing = $state(false);
  ready = $state(false);
  beat = $state(-1);
  time = $state(0);
  /** where the next "play" starts (a stop point) */
  resumeBeat = $state(0);
  runtime = $state<Record<string, TrackRuntime>>({});

  // static
  readonly built;
  readonly beatTime: number;
  readonly names: string[];
  private graph?: AudioGraph;

  constructor(readonly piece: PieceDef<T, any>, readonly seed: number) {
    this.built = buildPiece(piece, seed);
    this.beatTime = this.built.beatTime;
    this.names = Object.keys(piece.tracks);
    for (const name of this.names) this.runtime[name] = emptyRuntime();

    console.log('seed', seed);
    console.log('stop points', this.built.sched.stops);
  }

  get rng() { return this.built.rng; }
  get schemas() { return this.built.schemas; }
  channel(name: string) { return this.graph!.nodes[name].channel; }

  /** browser only (creates the Tone graph). Call from onMount. */
  init() {
    this.graph = buildAudioGraph(this.piece.tracks);
    this.ready = true;
  }

  destroy() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    this.graph?.dispose();
  }

  async toggle() {
    if (this.playing) this.stop();
    else await this.play();
  }

  async play() {
    if (this.playing || !this.graph) return;
    await Tone.start();

    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.bpm.value = this.piece.bpm;

    this.restoreState(this.resumeBeat);
    this.beat = this.resumeBeat - 1; // tick() increments first

    Tone.Transport.scheduleRepeat((t) => this.tick(t), this.beatTime);
    Tone.Transport.start();
    this.playing = true;
  }

  /**
   * Stop snaps back to the nearest stop point at or before the current beat.
   * rewind: go back to beat 0 instead (used when the piece ends).
   */
  stop(opts: { rewind?: boolean } = {}) {
    if (!this.playing) {
      if (opts.rewind) this.resumeBeat = 0;
      return;
    }
    Tone.Transport.stop();
    Tone.Transport.cancel();
    for (const r of Object.values(this.runtime)) r.halt++;

    const { sched } = this.built;
    const target = opts.rewind ? sched.stops[0] : sched.lastStopAtOrBefore(this.beat);
    this.resumeBeat = target.beat;
    this.playing = false;
  }

  // ---------------------------------------------------------------------------

  private tick(t: number) {
    const b = ++this.beat;
    this.time = t;

    const { sched, rng } = this.built;

    // stop point reached (normally or by resuming): swap the seed. Happens BEFORE the
    // sequencers' effects run, so everything they draw this beat comes from that seed.
    const stop = sched.stopAt(b);
    if (stop) rng.reseed(stop.seed);

    const ev = sched.at(b);
    for (const p of ev.params) {
      setTrackParam(this.graph!.nodes[p.track], p.param, p.value, p.ramp * this.beatTime, t);
    }
    for (const m of ev.masters) setIsolator(this.graph!, m.values, m.ramp * this.beatTime, t);
    for (const s of ev.seqs) {
      const r = this.runtime[s.track];
      r.metaSequence = s.seq;
      r.reset++;
    }

    if (sched.endBeat !== null && b > sched.endBeat) {
      queueMicrotask(() => this.stop({ rewind: true }));
    }
  }

  /**
   * Rebuild mix + sequence state as it would be at `beat` by replaying all earlier events.
   * (Ramps that were still in flight jump straight to their final value.)
   * Then every sequencer restarts on the first tick.
   */
  private restoreState(beat: number) {
    const g = this.graph!;
    resetTrackParams(g, this.piece.tracks);
    setIsolator(g, [0, 0, 0]);
    for (const r of Object.values(this.runtime)) r.metaSequence = 0;

    this.built.sched.replay(beat, {
      seq: (e) => { this.runtime[e.track].metaSequence = e.seq; },
      param: (e) => setTrackParam(g.nodes[e.track], e.param, e.value, 0),
      master: (e) => setIsolator(g, e.values, 0),
    });

    for (const r of Object.values(this.runtime)) r.reset++;
  }
}
