import { kick } from "./kick";
import { snare } from "./snare";
import { hiHat } from "./hiHat";
import { pad } from "./pad";
import { breakBeat } from "./break";
import { breakBeat2 } from "./break2";
import { voice } from "./voice";

export const tracks = { kick, snare, hiHat, pad, breakBeat, breakBeat2, voice};
export type Tracks = typeof tracks;
