import { kick } from "./kick";
import { snare } from "./snare";

export const tracks = { kick, snare};
export type Tracks = typeof tracks;
