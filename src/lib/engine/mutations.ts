import type { Rng } from './rng';

/**
 * Returns a mutated DEEP COPY of the schema (the imported .json is never touched, so
 * remounts / HMR don't stack "add" mutations).
 * Draws from the shared rng in a fixed order: schema's own mutations, then extras.
 */
export function applyMutations(schema: any, extra: any[], rng: Rng) {
  const out = structuredClone(schema);
  const all = [...(out.mutations ?? []), ...extra];

  for (const mutation of all) {
    if (rng() > mutation.probability) continue;

    const path = mutation.where;
    let target: any = out;
    for (let i = 0; i < path.length - 1; i++) {
      target = target[path[i]];
      if (target === undefined) break;
    }
    if (target === undefined) continue;

    const key = path[path.length - 1];
    if (mutation.type === 'add') target[key].push(mutation.injection);
    else target[key] = mutation.injection;
  }

  if (Array.isArray(out.sequences)) {
    out.sequences = out.sequences.map((s: any) => (typeof s === 'string' ? [] : s));
  }
  return out;
}
