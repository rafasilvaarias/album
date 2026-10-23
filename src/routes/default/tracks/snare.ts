import { defineTrack} from "$lib/engine";
import schema from "../schemas/snare.json";
import { type Plan } from "../plan";

export const snare = defineTrack({
  schema,
  gain: 0.8,
  pan: null,
  eq: { low: 0, mid: 0, high: 0},
  reverb: 2,
  seq: { off: 0, a1: 1, a2: 2, a3: 3, a4: 4, a5: 5, a6: 6, a7: 7, a8: 8, b: 9 }, // metaSequence indices

  mutations: (rng, plan: Plan) => {
    const muts = [
      ...plan.snare,
    ];

    return muts;
  },
});

