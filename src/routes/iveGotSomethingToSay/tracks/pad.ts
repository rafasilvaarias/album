import { defineTrack} from "$lib/engine";
import schema from "../schemas/pad.json";
import { type Plan } from "../plan";

export const pad = defineTrack({
  schema,
  gain: 0.7,
  pan: null,
  eq: null,
  reverb: 0.2,
  seq: { off: 0, transition: 7, b: 8 },
});