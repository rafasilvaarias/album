import type { Rng } from './rng';
import type { Schedule } from './schedule';

export type EqSettings = {
  low: number; // position -1..1 (converted with positionToDb)
  mid: number;
  high: number;
  lowFrequency?: number;  // default 200
  highFrequency?: number; // default 6800
};

export type ParamName = 'gain' | 'pan' | 'low' | 'mid' | 'high' | 'reverb';

/** [metaSequence, sequenceIndex, queued sample names, beatOfQueue] */
export type TrackMessage = [number[], number, string[], number];

export type TrackRuntime = {
  metaSequence: number;
  reset: number; // ++ => sequencer restarts its sequence on the next beat
  halt: number;  // ++ => sequencer silences everything immediately
  message: TrackMessage;
};

/**
 * Convention: sequence 0 is ALWAYS silence (an empty sequence in the schema).
 * `seq` gives the other indices names, so you write sched.seq(beat, 'guitar', 'solo').
 */
export type TrackDef<S extends Record<string, number> = Record<string, number>> = {
  schema: any; // the .json
  gain: number;
  pan?: number | null;   // null/undefined = no panner
  eq?: Partial<EqSettings> | true | null; // true = flat EQ3; null/undefined = none
  reverb?: number | null; // send amount; null/undefined = no send
  seq: S;
  /** extra mutations for this track. Draws from the shared rng. */
  mutations?: (rng: Rng, plan: any) => any[];
};

export type TracksMap = Record<string, TrackDef<any>>;
export type TrackName<T extends TracksMap> = keyof T & string;
export type SeqName<T extends TracksMap, K extends TrackName<T>> = keyof T[K]['seq'] & string;

export type Section<N extends string = string> = { name: N; start: number; end: number };

export type ComposeCtx<T extends TracksMap, P = unknown> = {
  rng: Rng;
  plan: P;
  sched: Schedule<T>;
  bpm: number;
  subdivision: number;
  beatTime: number;
};

export type SectionCtx<T extends TracksMap, N extends string = string, P = unknown> = {
  plan: P;
  s: Section<N>;
  i: number;
  structure: Section<N>[];
  rng: Rng;
  sched: Schedule<T>;
};
export type SectionHandler<T extends TracksMap, N extends string = string, P = unknown> = (ctx: SectionCtx<T, N, P>) => void;

export type PieceDef<T extends TracksMap, P = unknown> = {
  bpm: number;
  subdivision?: number; // default 2
  tracks: T;
  /** Runs FIRST on the chain. Shared decisions; everything after only reads the result. */
  plan: (rng: Rng) => P;
  compose: (ctx: ComposeCtx<T, P>) => void;
};

export type Mutation = {
  type: 'change' | 'add';
  where: (string | number)[];
  probability: number;
  injection: unknown;
};

export type SeqEvent = { beat: number; track: string; seq: number };
export type ParamEvent = { beat: number; track: string; param: ParamName; value: number; ramp: number };
export type MasterEvent = { beat: number; values: [number, number, number]; ramp: number };
export type StopPoint = { beat: number; seed: number };
