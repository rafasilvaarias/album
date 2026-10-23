import { mulberry32 } from '$lib/globalFunctions';

/**
 * THE random stream of a piece. One continuous chain: compose(), track mutations,
 * sequence resolution and playback all draw from this same function, in a fixed order.
 *
 * It is re-seedable: stop points carry their own seed and call `reseed` when playback
 * reaches them (or resumes from them), so "what happens next" is derived from that seed.
 */
export function createRng(initialSeed: number) {
  let gen = mulberry32(initialSeed);
  const next = () => gen();

  return Object.assign(next, {
    /** Replace the stream with a fresh one from `seed`. */
    reseed(seed: number) {
      gen = mulberry32(seed);
    },
    /** true with probability p */
    chance: (p: number) => next() < p,
    /** float in [min, max) */
    range: (min: number, max: number) => next() * (max - min) + min,
    /** integer in [min, max] inclusive */
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    /** random element */
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    /** shuffled copy (Fisher-Yates) */
    shuffle: <T>(arr: readonly T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    /** weighted pick: entries are [item, weight]; weights don't need to sum to 1 */
    weighted: <T>(entries: readonly (readonly [T, number])[]): T => {
      let total = 0;
      for (const [, w] of entries) total += Math.max(0, w);
      if (total <= 0) throw new Error("weighted: total weight must be > 0");

      let r = next() * total;
      for (const [item, w] of entries) {
        const weight = Math.max(0, w);
        if (r < weight) return item;
        r -= weight;
      }
      // floating-point safety net: return the last item with a positive weight
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i][1] > 0) return entries[i][0];
      }
      throw new Error("unreachable");
    },
    /** draw a new seed value from the chain (used for stop points) */
    newSeed: () => Math.floor(next() * 4294967296),
  });
}

export type Rng = ReturnType<typeof createRng>;
