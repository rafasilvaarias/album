import { defineTrack} from "$lib/engine";
import schema from "../schemas/voice.json";
import { type Plan } from "../plan";

export const voice = defineTrack({
  schema,
  gain: 0.6,
  pan: null,
  eq: null,
  reverb: 0.2,
  seq: { off: 0, b: 1 }, // metaSequence indices

  mutations: (rng, plan: Plan) => {
    const muts = [
      ...plan.voice,
    ];

    return muts;
  },
});