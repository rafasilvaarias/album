import { createRng } from './rng';
import { Schedule } from './schedule';
import { applyMutations } from './mutations';
import type { PieceDef, TracksMap } from './types';

/**
 * PURE (no Tone, no Svelte). Fixed order on the one rng chain:
 *   1. piece.plan(rng)          shared decisions (structure, patterns...)
 *   2. Schedule ctor            (stop point 0 seed)
 *   3. piece.compose            (events, stop point seeds)
 *   4. track.mutations(rng, plan) + applyMutations, in track declaration order
 * Playback then continues the same chain (sequence resolution in mount order).
 */
export function buildPiece<T extends TracksMap, P>(piece: PieceDef<T, P>, seed: number) {
  const rng = createRng(seed);
  const plan = piece.plan(rng);
  const sched = new Schedule(piece.tracks, rng);

  const subdivision = piece.subdivision ?? 2;
  const beatTime = 60 / piece.bpm / subdivision;

  piece.compose({ rng, plan, sched, bpm: piece.bpm, subdivision, beatTime });

  const schemas: Record<string, any> = {};
  for (const [name, def] of Object.entries(piece.tracks)) {
    const extra = def.mutations?.(rng, plan) ?? [];
    schemas[name] = applyMutations(def.schema, extra, rng);
  }

  return { seed, rng, plan, sched, schemas, beatTime };
}
