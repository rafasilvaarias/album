import type { PieceDef, TrackDef, TracksMap } from './types';

/** Identity helper. `const` keeps the seq names as literals so they autocomplete. (TS >= 5.0) */
export function defineTrack<const S extends Record<string, number>>(def: TrackDef<S>): TrackDef<S> {
  return def;
}

export function definePiece<T extends TracksMap, P>(def: PieceDef<T, P>): PieceDef<T, P> {
  return def;
}
