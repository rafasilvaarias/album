import { defineTrack} from "$lib/engine";
import schema from "../schemas/hiHat.json";
import { type Plan } from "../plan";

export const hiHat = defineTrack({
  schema,
  gain: 0.2,
  pan: 0.3,
  eq: null,
  reverb: 0.1,
  seq: { off: 0, a1: 1, a2: 2, a3: 3, a4: 4, a5: 5, a6: 6, a7: 7, a8: 8, b: 9 },

  mutations: (rng, plan: Plan) => {
    const muts = [
      ...plan.hiHat,
    ];

    return muts;
  },
});