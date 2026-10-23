import { defineTrack} from "$lib/engine";
import schema from "../schemas/break.json";
import { type Plan } from "../plan";

export const breakBeat = defineTrack({
  schema,
  //gain: 0,
  gain: 0.55,
  pan: null,
  eq: null,
  reverb: null,
  seq: { off: 0, b:1},

  mutations: (rng, plan: Plan) => {
    const muts = [
      ...plan.break,
    ];

    return muts;
  },
});