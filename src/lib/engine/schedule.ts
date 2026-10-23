import type { Rng } from './rng';
import type { MasterEvent, ParamEvent, ParamName, SeqEvent, SeqName, StopPoint, TrackName, TracksMap } from './types';

const EMPTY: never[] = [];

/**
 * Pure data: "at beat N, do X". No Tone, no Svelte. compose() fills it, the Player reads it.
 * Events on the same beat run in insertion order.
 */
export class Schedule<T extends TracksMap> {
  private seqs = new Map<number, SeqEvent[]>();
  private params = new Map<number, ParamEvent[]>();
  private masters = new Map<number, MasterEvent[]>();
  /** Sorted. Always contains beat 0. */
  readonly stops: StopPoint[] = [];
  /** Beat at which everything goes silent and the player stops. null = never. */
  endBeat: number | null = null;

  constructor(private tracks: T, private rng: Rng) {
    this.stopPoint(0);
  }

  // ---------- helpers ----------
  private beatOf(beat: number) {
    return Math.max(0, Math.round(beat)); // beats before 0 never tick
  }
  private def(track: string) {
    const d = this.tracks[track];
    if (!d) throw new Error(`Unknown track "${track}"`);
    return d;
  }
  private resolveSeq(track: string, seq: number | string): number {
    if (typeof seq === 'number') return seq;
    const n = this.def(track).seq[seq];
    if (n === undefined) throw new Error(`Track "${track}" has no sequence named "${seq}"`);
    return n;
  }
  private push<E>(map: Map<number, E[]>, beat: number, e: E) {
    const list = map.get(beat);
    if (list) list.push(e);
    else map.set(beat, [e]);
  }

  // ---------- primitives ----------
  seq<K extends TrackName<T>>(beat: number, track: K, seq: SeqName<T, K> | number) {
    const b = this.beatOf(beat);
    this.push(this.seqs, b, { beat: b, track, seq: this.resolveSeq(track, seq) });
    return this;
  }

  param(beat: number, track: TrackName<T>, param: ParamName, value: number, ramp = 0) {
    this.def(track);
    const b = this.beatOf(beat);
    this.push(this.params, b, { beat: b, track, param, value, ramp });
    return this;
  }

  silence(beat: number, track: TrackName<T>) {
    return this.seq(beat, track, 0 as any);
  }

  silenceAll(beat: number) {
    for (const name of Object.keys(this.tracks)) this.silence(beat, name);
    return this;
  }

  // ---------- your recurring patterns ----------
  /** gain -> 0, (start sequence), ramp up to the track's configured gain. */
  fadeIn<K extends TrackName<T>>(track: K, start: number, beats: number, seq?: SeqName<T, K> | number) {
    this.param(start, track, 'gain', 0);
    if (seq !== undefined) this.seq(start, track, seq);
    this.param(start, track, 'gain', this.def(track).gain, beats);
    return this;
  }

  /** ramp gain to 0, then silence the track and restore its gain. */
  fadeOut(track: TrackName<T>, start: number, beats: number) {
    this.param(start, track, 'gain', 0, beats);
    this.seq(start + beats, track, 0 as any);
    this.param(start + beats, track, 'gain', this.def(track).gain);
    return this;
  }

  crossFade(
    from: TrackName<T>,
    to: TrackName<T>,
    start: number,
    beats: number,
    { toSeq, stepBeats = 2 }: { toSeq?: number | string; stepBeats?: number } = {},
  ) {
    const gFrom = this.def(from).gain;
    const gTo = this.def(to).gain;

    this.param(start, from, 'gain', gFrom);
    this.param(start, to, 'gain', 0);
    if (toSeq !== undefined) this.seq(start, to as any, toSeq as any);

    for (let done = 0; done < beats; done += stepBeats) {
      const len = Math.min(stepBeats, beats - done);
      const t = (done + len) / beats; // where this segment ends, 0..1
      const at = start + done;
      this.param(at, from, 'gain', gFrom * Math.cos((t * Math.PI) / 2), len);
      this.param(at, to, 'gain', gTo * Math.sin((t * Math.PI) / 2), len);
    }

    // same cleanup as fadeOut
    this.seq(start + beats, from as any, 0 as any);
    this.param(start + beats, from, 'gain', gFrom);
    return this;
  }

  /** ramp the 3-band EQ to [low, mid, high] positions (-1..1). */
  eqSweep(track: TrackName<T>, start: number, beats: number, [low, mid, high]: [number, number, number]) {
    this.param(start, track, 'low', low, beats);
    this.param(start, track, 'mid', mid, beats);
    this.param(start, track, 'high', high, beats);
    return this;
  }

  /** Master 3-band isolator: ramp to [low, mid, high] positions (-1..1) over `beats`. */
  isolator(start: number, beats: number, values: [number, number, number]) {
    const b = this.beatOf(start);
    this.push(this.masters, b, { beat: b, values, ramp: beats });
    return this;
  }

  // ---------- stop points & end ----------
  /**
   * A place where stopping "snaps back to". Gets its own seed, drawn from the chain NOW.
   * Put these on bar boundaries: sequencers restart their sequence there when resuming.
   */
  stopPoint(beat: number) {
    const b = this.beatOf(beat);
    if (this.stops.some((s) => s.beat === b)) return this;
    this.stops.push({ beat: b, seed: this.rng.newSeed() });
    this.stops.sort((x, y) => x.beat - y.beat);
    return this;
  }
  stopPoints(beats: number[]) {
    beats.forEach((b) => this.stopPoint(b));
    return this;
  }

  /** Everything goes silent at `beat`, and the player stops one beat later. */
  end(beat: number) {
    const b = this.beatOf(beat);
    this.silenceAll(b);
    this.endBeat = b;
    return this;
  }

  stopAt(beat: number): StopPoint | undefined {
    return this.stops.find((s) => s.beat === beat);
  }

  /** greatest stop point <= beat (never undefined, beat 0 always exists) */
  lastStopAtOrBefore(beat: number): StopPoint {
    let best = this.stops[0];
    for (const s of this.stops) if (s.beat <= beat) best = s;
    return best;
  }

  // ---------- reading ----------
  at(beat: number): { seqs: SeqEvent[]; params: ParamEvent[]; masters: MasterEvent[] } {
    return {
      seqs: this.seqs.get(beat) ?? EMPTY,
      params: this.params.get(beat) ?? EMPTY,
      masters: this.masters.get(beat) ?? EMPTY,
    };
  }

  /** Feed every event strictly before `before`, in order. Used to rebuild state when resuming mid-piece. */
  replay(before: number, apply: { seq: (e: SeqEvent) => void; param: (e: ParamEvent) => void; master: (e: MasterEvent) => void }) {
    const walk = <E>(map: Map<number, E[]>, fn: (e: E) => void) => {
      for (const b of [...map.keys()].sort((x, y) => x - y)) {
        if (b >= before) break;
        map.get(b)!.forEach(fn);
      }
    };
    walk(this.seqs, apply.seq);
    walk(this.params, apply.param);
    walk(this.masters, apply.master);
  }

  /** flat dump, handy for tests and the future timeline view */
  events() {
    const flat = <E>(m: Map<number, E[]>) => [...m.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, l]) => l);
    return { seqs: flat(this.seqs), params: flat(this.params), masters: flat(this.masters), stops: this.stops, endBeat: this.endBeat };
  }
}